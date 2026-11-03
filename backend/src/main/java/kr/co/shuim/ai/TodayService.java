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
            case "praise" -> "기록을 읽고 먼저 다독여 주고, 내 마음을 알아주고, 그다음 나를 칭찬해줘.";
            case "love" -> "기록을 읽고 내 마음을 먼저 알아주고, 다독여 주고, 있는 그대로 사랑해줘.";
            case "review" -> "메모 전체와 오늘 기록을 읽고, 과거의 다짐과 오늘을 대조해 점검해줘.";
            default -> "오늘의 나 브리핑을 만들어줘.";
        };
        try {
            String rawText = claude.complete(claude.resolveModel(b.prompts().get("model")), "review".equals(mode) ? 6000 : 5000, system, ask + "\n\n" + text);
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

    /**
     * 칭찬받기 (AI 가 없을 때): 반말로 은근하게, 3문단을 3~4문장씩.
     * ① 위로(힘든 날도 괜찮아) ② 공감(티 안 내고 버텼구나) ③ 칭찬(해낸 것·너만의 기준). 조언·아쉬운 점은 없다.
     */
    static Moment localPraise(Request b) {
        List<String> lines = new ArrayList<>();
        List<RecentDay> recent = b.recent();
        int recordedDays = recent.size() + (b.today().isEmpty() ? 0 : 1);
        boolean noRecords = recordedDays == 0 && b.todayDid().isEmpty(); // 아무것도 손대지 못할 만큼 지친 날

        // 기록에서 힘들었던 날과 다시 올라온 날을 찾는다
        RecentDay lowDay = recent.stream().filter(r -> Optional.ofNullable(avg(r.record())).orElse(0.0) <= -2).findFirst().orElse(null);
        List<String> bodyNotes = new ArrayList<>();
        for (RecentDay r : recent) { String n = note(r.record(), "body"); if (n != null) bodyNotes.add(n); }
        String tb = note(b.today(), "body");
        if (tb != null) bodyNotes.add(tb);
        String tired = bodyNotes.stream().filter(n -> LOW_SLEEP.matcher(n).find() || COFFEE.matcher(n).find()).findFirst().orElse(null);
        String rise = null;
        outer:
        for (int i = 1; i < recent.size(); i++) {
            for (Category c : b.cats()) {
                Integer x = score(recent.get(i).record(), c.id());
                Integer y = score(recent.get(i - 1).record(), c.id());
                if (x != null && y != null && x - y >= 2) {
                    String note = note(recent.get(i).record(), c.id());
                    rise = c.label() + "이(가) " + fmtScore(x - y) + " 올라온 날이 있었어" + (note != null ? " (그날 쓴 말: \"" + note + "\")" : "") + ".";
                    break outer;
                }
            }
        }

        // ① 위로: 힘든 날을 먼저 다독인다 (칭찬은 아직)
        if (lowDay != null) {
            String note = b.cats().stream().map(c -> note(lowDay.record(), c.id())).filter(Objects::nonNull).findFirst().orElse(null);
            lines.add(lowDay.date().substring(5).replace("-", "/") + "은 꽤 힘든 날이었지" + (note != null ? " (\"" + note + "\")" : "") + ". 그런 날이 있는 건 네가 부족해서가 아니야. "
                + "그만큼 애쓰고 있다는 뜻이야. 그날의 너도 괜찮아, 정말 괜찮아.");
        } else if (tired != null) {
            lines.add("몸 기록에 " + josa("\"" + tired + "\"", "이라고", "라고") + " 썼더라. 지친 몸으로 하루를 버티는 건 누구한테나 벅찬 일이야. "
                + "오늘 좀 느려도 괜찮아. 그건 네 잘못이 아니야.");
        } else if (noRecords) {
            lines.add("아무것도 손대기 힘들 만큼 지쳐 있었구나. 뭔가를 적을 힘조차 남지 않은 날이 있다는 거, 알아. "
                + "그건 네가 게을러서가 아니라 그만큼 많이 쓰고 버텨 왔다는 뜻이야. 오늘은 아무것도 안 해도 괜찮아.");
        } else {
            lines.add("요즘 너한테 좀 엄격했지. 잘한 건 당연하게 넘기고 못한 것만 오래 들여다봤을 거야. "
                + "오늘은 그 잣대를 잠깐 내려놔도 괜찮아. 넌 이미 충분히 애쓰고 있어.");
        }

        // ② 공감: 어떤 마음으로 살아 냈는지 알아준다
        if (rise != null) {
            lines.add(rise + " 그 사이에 네가 얼마나 애썼을지 알 것 같아. 아무도 모르게 혼자 다시 일어선 거잖아. 티 안 내고 버틴 날들, 나는 봤어.");
        } else if (recordedDays >= 2) {
            lines.add(recordedDays + "일 동안 너를 기록해 왔더라. 지치고 귀찮은 날에도 너를 들여다본 거잖아. "
                + "그게 얼마나 마음을 써야 하는 일인지 알아. 혼자 조용히 애쓰고 있었구나.");
        } else {
            lines.add("그런 몸과 마음으로도 오늘 여기까지 왔잖아. 괜찮은 척하느라 애쓴 날도 있었겠지. "
                + "그걸 혼자 감당하느라 힘들었겠다. 그 마음, 나는 알아.");
        }

        // ③ 칭찬: 그제야 본인은 당연하게 넘겼을 좋은 점을 짚는다
        LinkedHashSet<String> didAll = new LinkedHashSet<>(b.todayDid());
        for (RecentDay r : recent.subList(Math.max(0, recent.size() - 3), recent.size())) didAll.addAll(r.did());
        List<String> doneSteps = b.goals().stream().flatMap(g -> g.steps().stream().filter(s -> Boolean.TRUE.equals(s.done())).map(s -> "'" + s.text() + "'")).toList();
        MemoIn pinned = b.memos().stream().filter(m -> Boolean.TRUE.equals(m.pinned())).findFirst().orElse(null);
        ScheduleIn doneSched = b.schedule().stream().filter(s -> Boolean.TRUE.equals(s.done())).findFirst().orElse(null);
        if (!didAll.isEmpty()) {
            lines.add("그 와중에 " + josa(String.join(", ", TodayDtos.head(new ArrayList<>(didAll), 3)), "을", "를") + " 직접 했더라. 누가 시킨 것도 아닌데 하루하루 챙겨 온 거잖아. "
                + "이런 작은 걸 꾸준히 하는 사람이 결국 자기 하루를 지켜 내는 사람이야. 그게 너야.");
        } else if (!doneSteps.isEmpty()) {
            lines.add("목표에서 " + String.join(", ", TodayDtos.head(doneSteps, 2)) + "까지 해냈더라. 큰 걸 작게 나눠서 하나씩 체크하는 거, 생각보다 쉽지 않아. "
                + "너는 말보다 행동으로 조금씩 앞으로 가는 사람이야.");
        } else if (pinned != null) {
            lines.add("메모에 이런 원칙을 적어 뒀더라: \"" + cut(pinned.text(), 60) + "\". 자기 기준을 글로 남겨 두는 사람은 흔들려도 다시 돌아올 자리가 있어. "
                + "그게 너라서 좀 든든해.");
        } else if (doneSched != null) {
            lines.add("'" + doneSched.title() + "' 일정도 계획한 대로 해냈더라. 마음먹은 걸 그대로 해내는 건 작아 보여도 자기와의 약속을 지킨 거야. "
                + "그렇게 쌓인 약속들이 너를 믿을 만한 사람으로 만들어.");
        } else {
            lines.add("오늘 칭찬받기를 눌렀다는 건 스스로를 아껴 주고 싶은 마음이 있다는 거야. 그 마음이 있는 사람은 결국 자기를 잘 돌봐. "
                + "그래서 나는 네가 꽤 괜찮은 사람이라고 생각해.");
        }

        return new Moment("힘든 날도 있었지만, 너 생각보다 훨씬 잘하고 있어", lines, "네가 걸어온 길, 나는 꽤 멋있다고 생각해.");
    }

    private static final Pattern LOW_SLEEP = Pattern.compile("잠\\s*(못|부족|안|[0-9]\\s*시간)|못\\s*잠|못\\s*잤|피곤|졸려|새벽까지|밤새");
    private static final Pattern COFFEE = Pattern.compile("커피|카페인");
    private static final Pattern HARD = Pattern.compile("불안|막막|힘들|못하|싫");

    /**
     * 사랑받기 (AI 가 없을 때): 반말로 다정하게, 3문단을 3~4문장씩.
     * ① 공감(많이 힘들었겠구나) ② 위로(네 잘못이 아니야) ③ 조건 없는 사랑(있는 그대로 사랑받을 자격). 조언·숙제는 없다.
     */
    static Moment localLove(Request b) {
        List<String> lines = new ArrayList<>();
        boolean noRecords = b.recent().isEmpty() && b.today().isEmpty() && b.todayDid().isEmpty(); // 아무것도 손대지 못할 만큼 지친 날

        // 기록에서 힘들었던 말을 찾는다: 마음 메모(힘든 말) → 몸 메모(잠 부족·커피)
        List<String> mindNotes = new ArrayList<>();
        String tm = note(b.today(), "mind");
        if (tm != null) mindNotes.add(tm);
        for (int i = b.recent().size() - 1; i >= 0; i--) { String n = note(b.recent().get(i).record(), "mind"); if (n != null) mindNotes.add(n); }
        String mindNote = mindNotes.stream().filter(n -> HARD.matcher(n).find()).findFirst().orElse(null);
        List<String> bodyNotes = new ArrayList<>();
        for (RecentDay r : b.recent()) { String n = note(r.record(), "body"); if (n != null) bodyNotes.add(n); }
        String tb = note(b.today(), "body");
        if (tb != null) bodyNotes.add(tb);
        String tired = bodyNotes.stream().filter(n -> LOW_SLEEP.matcher(n).find() || COFFEE.matcher(n).find()).findFirst().orElse(null);
        List<ScheduleIn> todaySched = b.schedule().stream().filter(s -> b.date().equals(s.date()) && !Boolean.TRUE.equals(s.done())).toList();

        // ① 공감: 그 마음을 먼저 알아준다
        if (mindNote != null) {
            lines.add(josa("\"" + mindNote + "\"", "이라고", "라고") + " 쓴 날이 있었지. 그 말을 적기까지 마음이 얼마나 무거웠을까. "
                + "많이 힘들었겠구나. 누구한테도 다 말하지 못하고 혼자 그 마음을 안고 있었을 너를 생각하면, 나도 마음이 쓰여.");
        } else if (tired != null) {
            lines.add("몸 기록에 " + josa("\"" + tired + "\"", "이라고", "라고") + " 썼더라. 지친 몸으로 하루를 버티느라 많이 힘들었겠구나. "
                + "쉬고 싶어도 마음 놓고 쉬지 못했을 거야. 그 고단함, 다 알 것 같아.");
        } else if (todaySched.size() >= 3) {
            lines.add("오늘 할 일이 " + todaySched.size() + "개나 있네. 그걸 다 떠안고 있는 마음이 얼마나 무거울까. "
                + "많이 버거웠겠구나. 해야 할 일 사이에서 너를 챙길 틈도 없었을 거야.");
        } else if (noRecords) {
            lines.add("아무것도 손대기 힘들 만큼 지쳤구나. 뭔가를 적을 힘조차 남지 않았던 거잖아. "
                + "그 정도로 버거웠을 하루를 혼자 지나왔을 너를 생각하면 마음이 쓰여. 많이 힘들었지.");
        } else {
            lines.add("여기까지 오느라 많이 지쳤겠구나. 말로 다 하지 못한 마음도 있었을 거야. "
                + "괜찮은 척하느라 애쓴 날도 있었겠지. 그 마음, 여기서는 그냥 내려놔도 돼.");
        }

        // ② 위로: 버텨 낸 것을 알아보고 짐을 내려놓게 한다
        String relNote = note(b.today(), "relation");
        if (relNote == null) for (int i = b.recent().size() - 1; i >= 0 && relNote == null; i--) relNote = note(b.recent().get(i).record(), "relation");
        MemoIn pinned = b.memos().stream().filter(m -> Boolean.TRUE.equals(m.pinned())).findFirst().orElse(null);
        if (relNote != null) {
            lines.add("그 와중에도 관계 기록에 " + josa("\"" + relNote + "\"", "이", "가") + " 있더라. 힘든 날에도 누군가에게 마음을 쓴 너야. "
                + "그 다정함은 하나도 당연한 게 아니야. 그러니 오늘 조금 지쳐 있어도, 그건 네 잘못이 아니야.");
        } else if (pinned != null) {
            lines.add("스스로 정한 원칙도 있지: \"" + cut(pinned.text(), 60) + "\". 흔들리는 날에도 너를 지키려고 기준을 세운 거잖아. "
                + "그건 네가 너를 아끼고 있다는 뜻이야. 그러니 오늘 조금 흔들렸어도 괜찮아, 그럴 수 있어.");
        } else if (mindNote != null || tired != null) {
            lines.add("그런 날에도 너는 너를 놓지 않고 기록으로 남겼어. 그만큼 애썼다는 뜻이야. "
                + "힘든 건 네가 약해서가 아니라, 그만큼 열심히 살아 내고 있어서야. 그러니까 너무 자책하지 않아도 돼.");
        } else if (noRecords) {
            lines.add("손대지 못한 건 게을러서가 아니라 그만큼 지쳤다는 뜻이야. 그건 네 잘못이 아니야. "
                + "쉬어야 할 때 쉬지 못하면 누구라도 멈추게 돼. 오늘은 아무것도 안 해도 괜찮아, 그럴 수 있어.");
        } else {
            lines.add("오늘 여기 와서 너를 돌보려고 한 것만으로도 충분해. 잘 해내지 못한 것 같은 날이 있어도, 그건 네 잘못이 아니야. "
                + "누구나 그런 날이 있어, 그럴 수 있어. 오늘은 너한테 조금 덜 엄격해도 괜찮아.");
        }

        // ③ 조건 없는 사랑: 조심스럽게, 하지만 분명하게
        lines.add("점수가 높든 낮든, 뭘 해냈든 못 했든 너는 너야. 무언가를 해내야만 소중해지는 게 아니라, 그냥 너라서 소중한 거야. "
            + "아무것도 해내지 않은 날의 너까지, 너는 있는 그대로 충분히 사랑받을 자격이 있어.");

        return new Moment("많이 힘들었지, 그래도 넌 충분히 사랑받을 자격이 있어", lines, "넌 있는 그대로, 사랑받기에 충분한 사람이야.");
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
        return new Moment(text(o, "title"), strings(o.get("lines"), 6), text(o, "closing"));
    }

    Review parseReview(String raw) {
        JsonNode o = parse(raw);
        if (o == null || text(o, "headline").isEmpty()) return null;
        List<Caution> cautions = new ArrayList<>();
        if (o.path("cautions").isArray()) for (JsonNode c : o.get("cautions")) { if (cautions.size() >= 5) break; cautions.add(new Caution(text(c, "past"), text(c, "now"), text(c, "note"))); }
        return new Review(text(o, "headline"), cautions, strings(o.get("changes"), 5), text(o, "growth"), text(o, "question"));
    }
}
