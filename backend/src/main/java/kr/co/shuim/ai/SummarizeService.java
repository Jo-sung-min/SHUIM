package kr.co.shuim.ai;

import kr.co.shuim.ai.Categories.Category;
import kr.co.shuim.ai.TodayDtos.Entry;
import kr.co.shuim.common.Dates;
import kr.co.shuim.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

import static kr.co.shuim.common.Korean.cut;

/** 흐름 정리 (/api/summarize). 최근 N일 기록을 GPT가 3~5문단으로 정리. 키가 없으면 규칙 기반 */
@Service
public class SummarizeService {
    private static final Logger log = LoggerFactory.getLogger(SummarizeService.class);
    private final OpenAiClient ai;

    public SummarizeService(OpenAiClient ai) { this.ai = ai; }

    public record EntryDay(String date, Map<String, Entry> record) {}

    public record Request(List<EntryDay> entries, String category, Integer days, List<Category> categories, String date) {
        public Request(List<EntryDay> entries, String category, Integer days, List<Category> categories) {
            this(entries, category, days, categories, null);
        }
    }

    private static boolean validDate(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        try { return LocalDate.parse(value).toString().equals(value); }
        catch (DateTimeParseException ignored) { return false; }
    }

    private static List<Category> catsOf(Request b) {
        List<Category> all = Categories.of(b.categories());
        if (b.category() == null || "all".equals(b.category())) return all;
        return List.of(Categories.byId(b.category(), b.categories()));
    }

    /** 프롬프트에 넣는 기록 글자 수 상한 (60일 × 카테고리 × 메모 300자에도 보통은 닿지 않는다) */
    static final int TEXT_MAX = 60_000;

    public Map<String, Object> run(Request raw) { return run(raw, null); }

    /** userId: OpenAI 남용 추적용 가명 식별자(safety_identifier)를 만들 때만 쓴다 */
    public Map<String, Object> run(Request raw, String userId) {
        if (raw == null) throw ApiException.badRequest("정리할 기록이 없어요");
        String referenceDate = raw.date() == null ? Dates.todayKey() : raw.date();
        if (!validDate(referenceDate)) throw ApiException.badRequest("기준 날짜를 다시 확인해 주세요");
        List<EntryDay> entries = raw.entries() == null ? List.of() : raw.entries().stream()
            .filter(e -> e != null && validDate(e.date())).sorted(Comparator.comparing(EntryDay::date)).toList();
        if (entries.isEmpty()) throw ApiException.badRequest("정리할 기록이 없어요");
        if (entries.size() > 60) entries = entries.subList(entries.size() - 60, entries.size());
        // 카테고리 목록·이름은 Categories.of 의 상한으로, 고른 카테고리 id 는 40자로 자른다
        List<Category> categories = raw.categories() == null || raw.categories().isEmpty() ? raw.categories() : Categories.of(raw.categories());
        String category = raw.category() == null ? null : cut(raw.category(), 40);
        Request b = new Request(entries, category, raw.days() == null ? entries.size() : raw.days(), categories, referenceDate);
        String text = cut(toPlainText(b), TEXT_MAX);
        boolean crisis = Crisis.hasSignal(text);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("crisis", crisis);
        if (text.isBlank() || !ai.configured()) {
            out.put("summary", localWithCrisis(b, crisis));
            out.put("source", "local");
            return out;
        }
        try {
            String scope = b.category() == null || "all".equals(b.category()) ? "전체 카테고리" : Categories.byId(b.category(), b.categories()).label() + " 카테고리";
            String context = "기준일: " + b.date() + "\n기록 날짜 범위: " + entries.get(0).date() + " ~ " + entries.get(entries.size() - 1).date()
                + "\n" + scope + "의 아래 기록만 시간순으로 정리해줘.\n"
                + "기록 날짜는 작성일이며 사건 발생일을 확정하지 않아. 메모의 어제·지난주·내일 같은 상대 시점은 해당 작성일을 기준으로 해석하고, 예정은 완료로 바꾸지 마.\n"
                + "기준일보다 이전의 기록은 그 날짜의 과거 이야기로, 이후의 기록은 미래 날짜의 기록으로 구분해. 최신 기록을 오늘 일로 바꾸지 마.\n"
                + "기준일의 기록이 없거나 날짜가 빠진 구간의 상태는 알 수 없어. 과거 감정이 오늘도 이어진다거나 예정된 일을 이미 마쳤다고 추정하지 마.\n\n";
            String model = ai.resolveModel(null);
            String summary = (userId == null ? ai.complete(model, 3000, Prompts.SUMMARY, context + text)
                : ai.complete(model, 3000, Prompts.SUMMARY, context + text, userId)).strip();
            out.put("summary", summary);
            out.put("source", "ai");
        } catch (ApiException e) {
            // 동시 요청이 많아 OpenAI 호출 자리를 얻지 못함: 잠시 후 다시 시도하게 한다
            throw e;
        } catch (Exception e) {
            // 예외 메시지에는 OpenAI 오류 본문(입력 일부)이 섞일 수 있어 종류만 남긴다
            log.error("summarize failed: {}", e.getClass().getSimpleName());
            out.put("summary", localWithCrisis(b, crisis));
            out.put("source", "local");
        }
        return out;
    }

    private static String toPlainText(Request b) {
        List<Category> cats = catsOf(b);
        List<String> lines = new ArrayList<>();
        for (EntryDay d : b.entries()) {
            Map<String, Entry> record = d.record() == null ? Map.of() : d.record();
            List<String> parts = new ArrayList<>();
            for (Category c : cats) {
                Entry e = record.get(c.id());
                if (e == null || e.score() == null) continue;
                parts.add(c.label() + " " + TodayService.fmtScore(e.score()) + (e.note() != null && !e.note().isEmpty() ? " \"" + cut(e.note(), 300) + "\"" : ""));
            }
            if (!parts.isEmpty()) lines.add(d.date() + " | " + String.join(" / ", parts));
        }
        return String.join("\n", lines);
    }

    /** 위험 신호가 있으면 도움 받을 곳(109·1577-0199)을 맨 앞에 둔다 */
    static String localWithCrisis(Request b, boolean crisis) {
        return crisis ? Prompts.CRISIS_LINE + "\n\n" + localSummary(b) : localSummary(b);
    }

    /** API 키가 없을 때 쓰는 간단한 규칙 기반 정리 */
    static String localSummary(Request b) {
        List<String> out = new ArrayList<>();
        record Pt(String date, int s, String note) {}
        for (Category c : catsOf(b)) {
            List<Pt> pts = new ArrayList<>();
            for (EntryDay d : b.entries()) {
                Entry e = d.record() == null ? null : d.record().get(c.id());
                if (e != null && e.score() != null) pts.add(new Pt(d.date(), e.score(), e.note() == null ? "" : e.note()));
            }
            if (pts.size() < 2) continue;
            int worstD = 0, bestD = 0;
            String worstDate = "", worstNote = "", bestDate = "", bestNote = "";
            for (int i = 1; i < pts.size(); i++) {
                int d = pts.get(i).s() - pts.get(i - 1).s();
                if (d < worstD) { worstD = d; worstDate = pts.get(i).date(); worstNote = pts.get(i).note(); }
                if (d > bestD) { bestD = d; bestDate = pts.get(i).date(); bestNote = pts.get(i).note(); }
            }
            int first = pts.get(0).s();
            int last = pts.get(pts.size() - 1).s();
            String trend = last > first ? "올라오는 흐름" : last < first ? "내려가는 흐름" : "제자리를 지키는 흐름";
            StringBuilder line = new StringBuilder(c.emoji() + " " + c.label() + ": " + first + "에서 " + last + "로, " + trend + "이에요.");
            if (worstD < 0) line.append(" 가장 크게 흔들린 건 ").append(worstDate).append("(").append(worstD).append(")").append(worstNote.isEmpty() ? "" : ", \"" + worstNote + "\"").append(".");
            if (bestD > 0) line.append(" 가장 크게 올라온 건 ").append(bestDate).append("(+").append(bestD).append(")").append(bestNote.isEmpty() ? "" : ", \"" + bestNote + "\"").append(".");
            out.add(line.toString());
        }
        if (out.isEmpty()) return "정리할 만큼 기록이 쌓이지 않았어요. 이틀 이상 기록하면 변화가 보이기 시작해요.";
        out.add(0, b.entries().get(0).date() + " ~ " + b.entries().get(b.entries().size() - 1).date() + "에 남긴 기록의 흐름이에요.");
        return String.join("\n\n", out);
    }
}
