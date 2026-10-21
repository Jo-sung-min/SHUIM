package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.Categories.Category;
import kr.co.shuim.ai.TodayDtos.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

import static kr.co.shuim.common.Korean.cut;
import static kr.co.shuim.common.Korean.josa;

/**
 * "오늘의 나" 브리핑 · 칭찬 · 사랑하기 · 메모 점검.
 * 기록을 사람이 읽는 텍스트로 만들어 Claude 에 보내고 JSON 응답을 검증한다. 키가 없거나 실패하면 규칙 기반 결과.
 * (frontend 에 있던 app/api/today/route.ts 를 옮긴 것)
 */
@Service
public class TodayService {
    private static final Logger log = LoggerFactory.getLogger(TodayService.class);
    private final ClaudeClient claude;
    private final ObjectMapper json;

    public TodayService(ClaudeClient claude, ObjectMapper json) {
        this.claude = claude;
        this.json = json;
    }

    public Map<String, Object> run(Request raw) {
        Request b = raw.normalized();
        String mode = b.mode();
        String text = "review".equals(mode) ? reviewText(b) : toPlainText(b);
        boolean crisis = Crisis.hasSignal(text);

        if (!claude.configured()) return local(b, mode, crisis);

        String override = b.prompts().get(mode);
        String system = override != null && !override.isBlank() ? cut(override, Prompts.MAX_LEN) : Prompts.DEFAULTS.get(mode);
        String ask = switch (mode) {
            case "praise" -> "기록을 읽고 나를 칭찬해줘.";
            case "love" -> "기록을 읽고 오늘 나를 사랑하는 방법을 알려줘.";
            case "review" -> "메모 전체와 오늘 기록을 읽고, 과거의 다짐과 오늘을 대조해 점검해줘.";
            default -> "오늘의 나 브리핑을 만들어줘.";
        };
        try {
            String rawText = claude.complete(claude.resolveModel(b.prompts().get("model")), "review".equals(mode) ? 3000 : 2000, system, ask + "\n\n" + text);
            Map<String, Object> out = new LinkedHashMap<>();
            switch (mode) {
                case "briefing" -> {
                    Briefing br = parseBriefing(rawText);
                    if (br == null) throw new IllegalStateException("JSON 파싱 실패: " + cut(rawText, 200));
                    out.put("briefing", br);
                }
                case "review" -> {
                    Review rv = parseReview(rawText);
                    if (rv == null) throw new IllegalStateException("JSON 파싱 실패: " + cut(rawText, 200));
                    out.put("review", rv);
                }
                default -> {
                    Moment m = parseMoment(rawText);
                    if (m == null) throw new IllegalStateException("JSON 파싱 실패: " + cut(rawText, 200));
                    out.put("moment", m);
                }
            }
            out.put("source", "ai");
            out.put("crisis", crisis);
            return out;
        } catch (Exception e) {
            log.error("today {} failed: {}", mode, e.getMessage());
            return local(b, mode, crisis);
        }
    }

    private Map<String, Object> local(Request b, String mode, boolean crisis) {
        Map<String, Object> out = new LinkedHashMap<>();
        switch (mode) {
            case "praise" -> out.put("moment", localPraise(b));
            case "love" -> out.put("moment", localLove(b));
            case "review" -> out.put("review", localReview(b));
            default -> out.put("briefing", localBriefing(b));
        }
        out.put("source", "local");
        out.put("crisis", crisis);
        return out;
    }

    /* ---------- 기록 → 텍스트 ---------- */

    static String fmtScore(int s) { return s > 0 ? "+" + s : String.valueOf(s); }

    private static String dayLine(String date, Map<String, Entry> record, List<String> did, List<Category> cats) {
        List<String> parts = new ArrayList<>();
        for (Category c : cats) {
            Entry e = record.get(c.id());
            if (e == null) continue;
            parts.add(c.label() + " " + fmtScore(e.score()) + (e.note() != null && !e.note().isEmpty() ? " \"" + cut(e.note(), 200) + "\"" : ""));
        }
        String didStr = did.isEmpty() ? "" : " | 한 행동: " + String.join(", ", did);
        return date + " | " + (parts.isEmpty() ? "(점수 없음)" : String.join(" / ", parts)) + didStr;
    }

    private static String toPlainText(Request b) {
        List<Category> cats = b.cats();
        List<String> out = new ArrayList<>();
        out.add("[오늘 " + b.date() + "]");
        out.add(!b.today().isEmpty() || !b.todayDid().isEmpty() ? dayLine(b.date(), b.today(), b.todayDid(), cats) : "(오늘은 아직 기록 전)");
        out.add("");
        out.add("[최근 기록 (오래된 순)]");
        out.add(b.recent().isEmpty() ? "(없음)" : String.join("\n", b.recent().stream().map(r -> dayLine(r.date(), r.record(), r.did(), cats)).toList()));
        out.add("");
        out.add("[메모 (고정 먼저)]");
        out.add(b.memos().isEmpty() ? "(없음)" : String.join("\n", b.memos().stream()
            .map(m -> (Boolean.TRUE.equals(m.pinned()) ? "📌 " : "- ") + "[" + Categories.memoLabel(m.cat(), cats) + "] " + cut(m.text(), 300)).toList()));
        out.add("");
        out.add("[진행 중 목표]");
        out.add(b.goals().isEmpty() ? "(없음)" : String.join("\n", b.goals().stream().map(g -> {
            long done = g.steps().stream().filter(s -> Boolean.TRUE.equals(s.done())).count();
            String steps = String.join(", ", g.steps().stream().map(s -> (Boolean.TRUE.equals(s.done()) ? "✔ " : "○ ") + s.text()).toList());
            return "- [" + Categories.memoLabel(g.cat(), cats) + "] " + g.title() + " (" + done + "/" + g.steps().size() + (g.due() != null ? ", " + g.due() + "까지" : "") + ")"
                + (g.why().isEmpty() ? "" : " 이유: \"" + g.why() + "\"") + (steps.isEmpty() ? "" : " 단계: " + steps);
        }).toList()));
        out.add("");
        out.add("[일정 (오늘 + 3일)]");
        out.add(b.schedule().isEmpty() ? "(없음)" : String.join("\n", b.schedule().stream()
            .map(s -> "- " + s.date() + (s.time() != null ? " " + s.time() : "") + " " + (Boolean.TRUE.equals(s.done()) ? "✔ " : "") + s.title() + " [" + Categories.memoLabel(s.cat(), cats) + "]").toList()));
        return String.join("\n", out);
    }

    private static String reviewText(Request b) {
        List<DatedMemo> memos = b.allMemos();
        List<String> out = new ArrayList<>();
        out.add("[메모 전체 · " + memos.size() + "개 · 오래된 순]");
        out.add(memos.isEmpty() ? "(없음)" : String.join("\n", memos.stream()
            .map(m -> "[" + m.date() + " · " + Categories.memoLabel(m.cat(), b.cats()) + (Boolean.TRUE.equals(m.pinned()) ? " · 고정" : "") + "] " + cut(m.text(), 400)).toList()));
        out.add("");
        out.add("[오늘 " + b.date() + "]");
        out.add(!b.today().isEmpty() || !b.todayDid().isEmpty() ? dayLine(b.date(), b.today(), b.todayDid(), b.cats()) : "(오늘은 아직 기록 전)");
        List<DatedMemo> todayMemos = memos.stream().filter(m -> b.date().equals(m.date())).toList();
        if (!todayMemos.isEmpty()) out.add("오늘 쓴 메모: " + String.join(" / ", todayMemos.stream().map(m -> "\"" + cut(m.text(), 200) + "\"").toList()));
        out.add("");
        out.add("[최근 7일 기록]");
        out.add(b.recent().isEmpty() ? "(없음)" : String.join("\n", b.recent().stream().map(r -> dayLine(r.date(), r.record(), r.did(), b.cats())).toList()));
        if (!b.goals().isEmpty()) {
            out.add("");
            out.add("[진행 중 목표]");
            out.add(String.join("\n", b.goals().stream().map(g -> "- " + g.title() + (g.why().isEmpty() ? "" : " (이유: \"" + g.why() + "\")")).toList()));
        }
        return String.join("\n", out);
    }

    /* ---------- 규칙 기반 대체 ---------- */

    private static Double avg(Map<String, Entry> r) {
        List<Integer> s = r.values().stream().map(Entry::score).filter(Objects::nonNull).toList();
        if (s.isEmpty()) return null;
        return s.stream().mapToInt(Integer::intValue).sum() / (double) s.size();
    }

    private static Integer score(Map<String, Entry> r, String id) {
        Entry e = r.get(id);
        return e == null ? null : e.score();
    }

    private static String note(Map<String, Entry> r, String id) {
        Entry e = r.get(id);
        return e == null || e.note() == null || e.note().isEmpty() ? null : e.note();
    }

    private static double round1(double v) { return Math.round(v * 10) / 10.0; }

    private static String fmt1(double v) {
        double r = round1(v);
        return r == Math.rint(r) ? String.valueOf((long) r) : String.valueOf(r);
    }

    static Briefing localBriefing(Request b) {
        Double todayAvg = avg(b.today());
        List<RecentDay> recent = b.recent().stream().filter(r -> avg(r.record()) != null).toList();
        RecentDay last = recent.isEmpty() ? null : recent.get(recent.size() - 1);
        Double lastAvg = last == null ? null : avg(last.record());
        Double prevAvg = recent.size() > 1 ? avg(recent.get(recent.size() - 2).record()) : null;

        Double diff = null;
        String base = "어제";
        if (todayAvg != null && lastAvg != null) diff = todayAvg - lastAvg;
        else if (lastAvg != null && prevAvg != null) {
            diff = lastAvg - prevAvg;
            base = "그 전날";
        }
        String direction = diff == null ? "flat" : diff > 0.3 ? "up" : diff < -0.3 ? "down" : "flat";

        String moved = "";
        if (last != null) {
            Map<String, Entry> src = todayAvg != null ? b.today() : recent.size() > 1 ? last.record() : null;
            Map<String, Entry> ref = todayAvg != null ? last.record() : recent.size() > 1 ? recent.get(recent.size() - 2).record() : null;
            if (src != null && ref != null) {
                String bestLabel = null;
                int bestD = 0;
                for (Category c : b.cats()) {
                    Integer a = score(src, c.id());
                    Integer p = score(ref, c.id());
                    if (a != null && p != null && (bestLabel == null || Math.abs(a - p) > Math.abs(bestD))) {
                        bestLabel = c.label();
                        bestD = a - p;
                    }
                }
                if (bestLabel != null && bestD != 0) moved = " 가장 크게 움직인 건 " + bestLabel + "(" + fmtScore(bestD) + ")이에요.";
            }
        }

        String momentumText = diff == null
            ? "아직 비교할 기록이 적어요. 이틀만 쌓이면 흐름이 보이기 시작해요."
            : direction.equals("up") ? base + "보다 평균 +" + fmt1(diff) + " 올라왔어요." + moved
            : direction.equals("down") ? base + "보다 평균 " + fmt1(diff) + " 내려갔어요." + moved + " 내려간 날도 기록했다는 게 이미 한 걸음이에요."
            : base + "와 비슷한 자리를 지키고 있어요." + moved + " 흔들리지 않은 것도 힘이에요.";

        String headline = todayAvg == null && b.todayDid().isEmpty()
            ? (direction.equals("up") ? "올라오던 흐름, 오늘도 이어가 봐요" : direction.equals("down") ? "어제 흔들렸어도, 오늘은 새 기록이에요" : "오늘 한 걸음만 보면 돼요")
            : (direction.equals("up") ? "어제보다 조금 올라온 오늘이에요" : direction.equals("down") ? "내려갔지만, 기록은 멈추지 않았어요" : "제자리를 지킨 것도 움직임이에요");

        List<String> highlights = new ArrayList<>();
        List<String> didAll = new ArrayList<>(b.todayDid());
        for (RecentDay r : recent.subList(Math.max(0, recent.size() - 3), recent.size())) didAll.addAll(r.did());
        if (!didAll.isEmpty()) highlights.add("최근 한 행동: " + String.join(", ", TodayDtos.head(new ArrayList<>(new LinkedHashSet<>(didAll)), 4)) + ". 작은 행동이 쌓이면 방향이 바뀌어요.");
        record Rise(String label, int d, String note) {}
        List<Rise> rises = new ArrayList<>();
        for (int i = 1; i < recent.size(); i++) {
            for (Category c : b.cats()) {
                Integer a = score(recent.get(i).record(), c.id());
                Integer p = score(recent.get(i - 1).record(), c.id());
                if (a != null && p != null && a - p >= 2) rises.add(new Rise(c.label(), a - p, Optional.ofNullable(note(recent.get(i).record(), c.id())).orElse("")));
            }
        }
        if (!rises.isEmpty()) {
            Rise r = rises.stream().max(Comparator.comparingInt(Rise::d)).get();
            highlights.add("최근 " + r.label() + "이(가) " + fmtScore(r.d()) + " 크게 올라온 날이 있었어요" + (r.note().isEmpty() ? "." : ": \"" + r.note() + "\""));
        }
        MemoIn pinned = b.memos().stream().filter(m -> Boolean.TRUE.equals(m.pinned())).findFirst().orElse(b.memos().isEmpty() ? null : b.memos().get(0));
        if (pinned != null) highlights.add("직접 남긴 메모예요: \"" + cut(pinned.text(), 80) + "\"");
        if (highlights.isEmpty()) highlights.add("아직 쌓인 게 적어요. 오늘 한 줄, 행동 하나만 남겨도 내일 브리핑이 달라져요.");

        List<ScheduleIn> todaySched = b.schedule().stream().filter(s -> b.date().equals(s.date())).toList();
        List<ScheduleIn> left = todaySched.stream().filter(s -> !Boolean.TRUE.equals(s.done())).toList();
        String schedule = todaySched.isEmpty()
            ? "오늘은 일정이 비어 있어요. 여유도 일정이에요."
            : "오늘 일정 " + todaySched.size() + "개" + (left.size() < todaySched.size() ? " 중 " + (todaySched.size() - left.size()) + "개 완료" : "") + ": "
              + String.join(", ", todaySched.stream().map(s -> (s.time() != null ? s.time() + " " : "") + s.title()).toList()) + ".";

        String goalsText = b.goals().isEmpty()
            ? "진행 중인 목표가 없어요. 작게 하나 세워두면 하루에 방향이 생겨요."
            : String.join(", ", TodayDtos.head(b.goals(), 2).stream().map(g -> {
                long done = g.steps().stream().filter(s -> Boolean.TRUE.equals(s.done())).count();
                return "'" + g.title() + "' " + (g.steps().isEmpty() ? "아직 시작 단계예요" : done + "/" + g.steps().size() + " 단계까지 왔어요");
            }).toList()) + ".";

        String nextStep = "오늘 기분을 한 줄만 기록해 봐요.";
        String firstGoalStep = b.goals().stream().flatMap(g -> g.steps().stream().filter(s -> !Boolean.TRUE.equals(s.done())).map(s -> "'" + g.title() + "'의 다음 단계, " + s.text())).findFirst().orElse(null);
        if (!left.isEmpty()) nextStep = (left.get(0).time() != null ? left.get(0).time() + "에 " : "") + left.get(0).title() + ", 이것 하나만 해보는 건 어때요.";
        else if (firstGoalStep != null) nextStep = firstGoalStep + "부터 시작해 보는 건 어때요.";

        String[] questions = {
            "오늘 하루 중 가장 작게라도 올라온 순간은 언제였나요?",
            "오늘 내가 지켜낸 원칙이 하나 있다면 무엇인가요?",
            "어제의 나에게 오늘 한 행동 하나를 말해준다면요?",
            "오늘 내려간 게 있다면, 그 옆에 있던 것은 무엇이었나요?",
        };
        int dom;
        try { dom = LocalDate.parse(b.date()).getDayOfMonth(); } catch (Exception e) { dom = 0; }
        return new Briefing(headline, new Momentum(direction, momentumText), TodayDtos.head(highlights, 3), new TodayInfo(schedule, goalsText), nextStep, questions[dom % questions.length]);
    }

    static Moment localPraise(Request b) {
        List<String> lines = new ArrayList<>();
        List<RecentDay> recent = b.recent();
        LinkedHashSet<String> didAll = new LinkedHashSet<>(b.todayDid());
        for (RecentDay r : recent.subList(Math.max(0, recent.size() - 3), recent.size())) didAll.addAll(r.did());
        if (!didAll.isEmpty()) lines.add("최근 며칠 동안 " + josa(String.join(", ", TodayDtos.head(new ArrayList<>(didAll), 3)), "을", "를") + " 직접 했어요. 아무도 시키지 않았는데 움직인 거예요.");
        RecentDay lowDay = recent.stream().filter(r -> Optional.ofNullable(avg(r.record())).orElse(0.0) <= -2).findFirst().orElse(null);
        if (lowDay != null) {
            String note = b.cats().stream().map(c -> note(lowDay.record(), c.id())).filter(Objects::nonNull).findFirst().orElse(null);
            lines.add(lowDay.date().substring(5).replace("-", "/") + "처럼 힘든 날에도 기록을 남겼어요" + (note != null ? ": \"" + note + "\"" : ".") + " 내려간 날을 적어두는 건 쉬운 일이 아니에요.");
        }
        outer:
        for (int i = 1; i < recent.size(); i++) {
            for (Category c : b.cats()) {
                Integer a = score(recent.get(i).record(), c.id());
                Integer p = score(recent.get(i - 1).record(), c.id());
                if (a != null && p != null && a - p >= 2) {
                    String note = note(recent.get(i).record(), c.id());
                    lines.add(c.label() + "이(가) " + fmtScore(a - p) + " 올라온 날이 있었어요" + (note != null ? ". 그날 쓴 말: \"" + note + "\"" : "."));
                    break outer;
                }
            }
        }
        List<String> doneSteps = b.goals().stream().flatMap(g -> g.steps().stream().filter(s -> Boolean.TRUE.equals(s.done())).map(s -> "'" + s.text() + "'")).toList();
        if (!doneSteps.isEmpty()) lines.add("목표에서 " + String.join(", ", TodayDtos.head(doneSteps, 2)) + "까지 끝냈어요. 큰 목표를 작게 쪼개서 실제로 체크한 사람은 생각보다 드물어요.");
        ScheduleIn doneSched = b.schedule().stream().filter(s -> Boolean.TRUE.equals(s.done())).findFirst().orElse(null);
        if (doneSched != null) lines.add("'" + doneSched.title() + "' 일정을 해냈어요. 계획한 걸 실제로 한 거예요.");
        MemoIn pinned = b.memos().stream().filter(m -> Boolean.TRUE.equals(m.pinned())).findFirst().orElse(null);
        if (pinned != null) lines.add("스스로 원칙을 세웠어요: \"" + cut(pinned.text(), 60) + "\". 원칙을 글로 적어둔 것 자체가 자기를 돌보는 일이에요.");
        if (lines.isEmpty()) lines.add("오늘 이 앱을 열고 자기를 돌아보려 한 것, 그게 첫 칭찬거리예요.");
        int recordedDays = recent.size() + (b.today().isEmpty() ? 0 : 1);
        return new Moment(recordedDays >= 3 ? recordedDays + "일 동안 자기를 들여다본 사람이에요" : "오늘도 자기를 들여다봤어요", TodayDtos.head(lines, 4), "내일의 나는 오늘 한 작은 행동 위에서 시작해요.");
    }

    private static final Pattern LOW_SLEEP = Pattern.compile("잠\\s*(못|부족|안|[0-9]\\s*시간)|못\\s*잠|못\\s*잤|피곤|졸려|새벽까지|밤새");
    private static final Pattern COFFEE = Pattern.compile("커피|카페인");
    private static final Pattern HARD = Pattern.compile("불안|막막|힘들|못하|싫");

    static Moment localLove(Request b) {
        List<String> lines = new ArrayList<>();
        List<String> bodyNotes = new ArrayList<>();
        for (RecentDay r : b.recent()) { String n = note(r.record(), "body"); if (n != null) bodyNotes.add(n); }
        String tb = note(b.today(), "body");
        if (tb != null) bodyNotes.add(tb);
        String lowSleep = bodyNotes.stream().filter(n -> LOW_SLEEP.matcher(n).find()).findFirst().orElse(null);
        String coffee = bodyNotes.stream().filter(n -> COFFEE.matcher(n).find()).findFirst().orElse(null);
        if (lowSleep != null) lines.add("몸 기록에 " + josa("\"" + lowSleep + "\"", "이라고", "라고") + " 썼어요. 오늘은 10분만 일찍 눕는 걸로 몸한테 미안함을 갚아봐도 좋아요.");
        else if (coffee != null) lines.add(josa("\"" + coffee + "\"", "이라고", "라고") + " 적어뒀죠. 오늘 커피 한 잔을 물이나 산책으로 바꾸면 그 메모가 몸을 지키는 방법이 돼요.");
        else lines.add("오늘 밥 한 끼는 폰 없이, 맛을 느끼면서 먹어봐요. 몸한테 '너를 챙기고 있어'라고 말하는 가장 쉬운 방법이에요.");
        List<String> mindNotes = new ArrayList<>();
        String tm = note(b.today(), "mind");
        if (tm != null) mindNotes.add(tm);
        for (int i = b.recent().size() - 1; i >= 0; i--) { String n = note(b.recent().get(i).record(), "mind"); if (n != null) mindNotes.add(n); }
        String mindNote = mindNotes.stream().filter(n -> HARD.matcher(n).find()).findFirst().orElse(null);
        if (mindNote != null) lines.add(josa("\"" + mindNote + "\"", "이라고", "라고") + " 쓴 날이 있어요. 친구가 그렇게 말했다면 \"그럴 만했어\"라고 했을 거예요. 오늘은 그 말을 나한테 해줘요.");
        MemoIn pinned = b.memos().stream().filter(m -> Boolean.TRUE.equals(m.pinned())).findFirst().orElse(b.memos().isEmpty() ? null : b.memos().get(0));
        if (pinned != null) lines.add("직접 정한 원칙이 있어요: \"" + cut(pinned.text(), 60) + "\". 이걸 지키는 건 자기를 통제하는 게 아니라 자기를 지키는 거예요.");
        List<ScheduleIn> todaySched = b.schedule().stream().filter(s -> b.date().equals(s.date()) && !Boolean.TRUE.equals(s.done())).toList();
        if (todaySched.size() >= 3) lines.add("오늘 일정이 " + todaySched.size() + "개예요. 그중 하나는 못 해도 괜찮다고 미리 정해두면 하루가 덜 무거워요.");
        else if (todaySched.isEmpty()) lines.add("오늘은 남은 일정이 없어요. 비어 있는 시간을 '아무것도 안 한 시간'이 아니라 '회복한 시간'이라고 불러줘요.");
        String relNote = note(b.today(), "relation");
        if (relNote == null) for (int i = b.recent().size() - 1; i >= 0 && relNote == null; i--) relNote = note(b.recent().get(i).record(), "relation");
        if (relNote != null && lines.size() < 4) lines.add("관계 기록에 " + josa("\"" + relNote + "\"", "이", "가") + " 있어요. 나를 사랑하는 건 혼자 버티는 게 아니라 한 사람에게 짧게 연락하는 걸로도 시작돼요.");
        return new Moment("오늘은 나를 친구처럼 대해봐요", TodayDtos.head(lines, 4), "잘하고 있어서가 아니라, 나라서 괜찮아요.");
    }

    private static final Set<String> STOP = Set.of("오늘", "내일", "어제", "그때", "지금", "생각", "하루", "다시", "보기", "하기", "말기", "것이", "같은데", "같아도", "그냥", "조금", "많이", "정말", "너무", "오늘은", "오늘도", "나를", "내가", "나는", "있다", "없다", "했다", "한다", "것", "수", "더");

    private static Set<String> tokens(String t) {
        Set<String> out = new LinkedHashSet<>();
        for (String w : t.replaceAll("[^\\p{L}\\p{N}\\s]", " ").split("\\s+")) if (w.length() >= 2 && !STOP.contains(w)) out.add(w);
        return out;
    }

    static Review localReview(Request b) {
        List<DatedMemo> memos = new ArrayList<>(b.allMemos());
        memos.sort(Comparator.comparing(DatedMemo::date));
        List<DatedMemo> past = memos.stream().filter(m -> m.date().compareTo(b.date()) < 0).toList();
        List<String> todayTexts = new ArrayList<>();
        memos.stream().filter(m -> m.date().equals(b.date())).forEach(m -> todayTexts.add(m.text()));
        for (Category c : b.cats()) { String n = note(b.today(), c.id()); if (n != null) todayTexts.add(n); }
        todayTexts.addAll(b.todayDid());
        Set<String> todayTok = tokens(String.join(" ", todayTexts));
        List<Caution> cautions = new ArrayList<>();
        for (DatedMemo m : past) {
            List<String> common = tokens(m.text()).stream().filter(todayTok::contains).toList();
            if (common.size() >= 2 || (common.size() == 1 && Boolean.TRUE.equals(m.pinned()))) {
                String now = todayTexts.stream().filter(t -> tokens(t).stream().anyMatch(common::contains)).findFirst().orElse(todayTexts.isEmpty() ? "" : todayTexts.get(0));
                cautions.add(new Caution(m.date() + ": \"" + cut(m.text(), 120) + "\"", now.isEmpty() ? "오늘 기록" : "오늘: \"" + cut(now, 120) + "\"",
                    "그때 " + josa("'" + common.get(0) + "'", "을", "를") + " 두고 이렇게 적어뒀어요. 오늘의 상황이 그때 정한 기준 안에 있는지 한 번만 확인해 봐요."));
                if (cautions.size() >= 3) break;
            }
        }
        List<String> changes = new ArrayList<>();
        Map<String, List<DatedMemo>> byCat = new LinkedHashMap<>();
        for (DatedMemo m : memos) byCat.computeIfAbsent(m.cat() == null ? "etc" : m.cat(), k -> new ArrayList<>()).add(m);
        for (var e : byCat.entrySet()) {
            List<DatedMemo> list = e.getValue();
            if (list.size() < 2) continue;
            DatedMemo first = list.get(0);
            DatedMemo last = list.get(list.size() - 1);
            if (first.date().equals(last.date())) continue;
            changes.add(Categories.memoLabel(e.getKey(), b.cats()) + ": " + first.date() + "엔 \"" + cut(first.text(), 50) + "\", " + last.date() + "엔 \"" + cut(last.text(), 50) + "\".");
            if (changes.size() >= 3) break;
        }
        String span = memos.size() >= 2 ? memos.get(0).date() + "부터 " + memos.get(memos.size() - 1).date() + "까지 " + memos.size() + "개의 메모" : memos.size() + "개의 메모";
        String growth = memos.isEmpty()
            ? "아직 메모가 없어요. 다짐이나 원칙을 메모해 두면, 나중에 오늘의 나가 그때의 나와 대화할 수 있어요."
            : span + "가 쌓였어요. " + (cautions.isEmpty()
                ? "오늘과 직접 맞닿는 과거 메모는 없었어요. 오늘 든 생각을 메모로 남겨두면 다음 점검 때 비교할 수 있어요."
                : "오늘과 맞닿는 과거의 다짐이 있어요. 그 기준을 세운 것도, 오늘 다시 꺼내 본 것도 모두 당신이에요.");
        String headline = !cautions.isEmpty() ? "그때의 내가 오늘의 나에게 할 말이 있어요" : !memos.isEmpty() ? "오늘은 과거와 충돌하는 게 없어요" : "첫 메모부터 시작해요";
        return new Review(headline, cautions, changes, growth, "오늘 결정한 것 중, 1년 뒤의 나에게 미리 알려주고 싶은 기준이 있나요?");
    }

    /* ---------- 응답 검증 ---------- */

    private JsonNode parse(String raw) {
        String j = JsonText.extract(raw);
        if (j == null) return null;
        try {
            return json.readTree(j);
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> strings(JsonNode arr, int max) {
        List<String> out = new ArrayList<>();
        if (arr != null && arr.isArray()) for (JsonNode n : arr) { if (out.size() >= max) break; out.add(n.isTextual() ? n.asText() : n.toString()); }
        return out;
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v == null || v.isNull() ? "" : v.isTextual() ? v.asText() : v.toString();
    }

    Briefing parseBriefing(String raw) {
        JsonNode o = parse(raw);
        if (o == null || text(o, "headline").isEmpty() || !o.has("momentum") || text(o.get("momentum"), "text").isEmpty() || !o.path("highlights").isArray()) return null;
        String dir = text(o.get("momentum"), "direction");
        return new Briefing(text(o, "headline"), new Momentum("up".equals(dir) || "down".equals(dir) ? dir : "flat", text(o.get("momentum"), "text")),
            strings(o.get("highlights"), 4), new TodayInfo(text(o.get("today"), "schedule"), text(o.get("today"), "goals")), text(o, "nextStep"), text(o, "question"));
    }

    Moment parseMoment(String raw) {
        JsonNode o = parse(raw);
        if (o == null || text(o, "title").isEmpty() || !o.path("lines").isArray() || o.get("lines").isEmpty()) return null;
        return new Moment(text(o, "title"), strings(o.get("lines"), 5), text(o, "closing"));
    }

    Review parseReview(String raw) {
        JsonNode o = parse(raw);
        if (o == null || text(o, "headline").isEmpty()) return null;
        List<Caution> cautions = new ArrayList<>();
        if (o.path("cautions").isArray()) for (JsonNode c : o.get("cautions")) { if (cautions.size() >= 5) break; cautions.add(new Caution(text(c, "past"), text(c, "now"), text(c, "note"))); }
        return new Review(text(o, "headline"), cautions, strings(o.get("changes"), 5), text(o, "growth"), text(o, "question"));
    }
}
