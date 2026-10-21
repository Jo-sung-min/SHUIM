package kr.co.shuim.ai;

import kr.co.shuim.ai.Categories.Category;
import kr.co.shuim.ai.TodayDtos.Entry;
import kr.co.shuim.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

import static kr.co.shuim.common.Korean.cut;

/** 흐름 정리 (/api/summarize). 최근 N일 기록을 Claude 가 3~5문단으로 정리. 키가 없으면 규칙 기반 */
@Service
public class SummarizeService {
    private static final Logger log = LoggerFactory.getLogger(SummarizeService.class);
    private final ClaudeClient claude;

    public SummarizeService(ClaudeClient claude) { this.claude = claude; }

    public record EntryDay(String date, Map<String, Entry> record) {}

    public record Request(List<EntryDay> entries, String category, Integer days, List<Category> categories) {}

    private static List<Category> catsOf(Request b) {
        List<Category> all = Categories.of(b.categories());
        if (b.category() == null || "all".equals(b.category())) return all;
        return List.of(Categories.byId(b.category(), b.categories()));
    }

    public Map<String, Object> run(Request raw) {
        List<EntryDay> entries = raw.entries() == null ? List.of() : raw.entries().stream().filter(e -> e != null && e.date() != null).toList();
        if (entries.isEmpty()) throw ApiException.badRequest("정리할 기록이 없어요");
        if (entries.size() > 60) entries = entries.subList(entries.size() - 60, entries.size());
        Request b = new Request(entries, raw.category(), raw.days() == null ? entries.size() : raw.days(), raw.categories());
        String text = toPlainText(b);
        boolean crisis = Crisis.hasSignal(text);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("crisis", crisis);
        if (!claude.configured()) {
            out.put("summary", localSummary(b));
            out.put("source", "local");
            return out;
        }
        try {
            String scope = b.category() == null || "all".equals(b.category()) ? "전체 카테고리" : Categories.byId(b.category(), b.categories()).label() + " 카테고리";
            String summary = claude.complete(claude.resolveModel(null), 1200, Prompts.SUMMARY, "최근 " + b.days() + "일, " + scope + " 기록이야. 흐름을 정리해줘.\n\n" + text).strip();
            out.put("summary", summary);
            out.put("source", "ai");
        } catch (Exception e) {
            log.error("summarize failed: {}", e.getMessage());
            out.put("summary", localSummary(b));
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
        out.add("\nbackend/.env 에 ANTHROPIC_API_KEY 를 넣으면 AI가 기록 속 말들을 엮어서 더 자세히 정리해줘요.");
        return String.join("\n\n", out);
    }
}
