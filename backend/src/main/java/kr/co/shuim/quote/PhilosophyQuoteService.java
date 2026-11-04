package kr.co.shuim.quote;

import com.fasterxml.jackson.annotation.JsonInclude;
import kr.co.shuim.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;

/** 관리자 검수를 거친 문구만 AI의 보조 재료로 제공한다. */
@Service
public class PhilosophyQuoteService {
    private static final Logger log = LoggerFactory.getLogger(PhilosophyQuoteService.class);
    public static final int TEXT_MAX = 600, AUTHOR_MAX = 100, SOURCE_MAX = 300, URL_MAX = 2048, THEME_MAX = 60;
    private static final Set<String> KINDS = Set.of("paraphrase", "translation");
    private final JdbcClient jdbc;
    private final LongSupplier clock;

    @Autowired
    public PhilosophyQuoteService(JdbcClient jdbc) { this(jdbc, System::currentTimeMillis); }

    PhilosophyQuoteService(JdbcClient jdbc, LongSupplier clock) { this.jdbc = jdbc; this.clock = clock; }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Quote(String id, String text, String author, String source, String sourceUrl, String theme,
                        String kind, boolean enabled, Long reviewedAt, long createdAt, long updatedAt) {}

    public record Content(String text, String author, String source, String sourceUrl, String theme, String kind) {}

    private static final RowMapper<Quote> MAPPER = (rs, row) -> new Quote(rs.getString("id"), rs.getString("text"),
        rs.getString("author"), rs.getString("source"), rs.getString("source_url"), rs.getString("theme"), rs.getString("kind"),
        rs.getBoolean("enabled"), (Long) rs.getObject("reviewed_at"), rs.getLong("created_at"), rs.getLong("updated_at"));

    public List<Quote> list() {
        return jdbc.sql("SELECT * FROM philosophy_quotes ORDER BY updated_at DESC, id").query(MAPPER).list();
    }

    public Quote create(Content body) {
        Content c = validate(body);
        long now = clock.getAsLong();
        return jdbc.sql("""
            INSERT INTO philosophy_quotes (id,text,author,source,source_url,theme,kind,enabled,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,FALSE,?,?) RETURNING *
            """).params(UUID.randomUUID().toString(), c.text(), c.author(), c.source(), c.sourceUrl(), c.theme(), c.kind(), now, now)
            .query(MAPPER).single();
    }

    /** The row lock keeps content changes and explicit review decisions in one serial order. */
    @Transactional
    public Quote update(String id, Content body) {
        Content c = validate(body);
        Quote old = jdbc.sql("SELECT * FROM philosophy_quotes WHERE id=? FOR UPDATE").param(id).query(MAPPER).optional()
            .orElseThrow(() -> ApiException.notFound("명언을 찾을 수 없어요"));
        if (new Content(old.text(), old.author(), old.source(), old.sourceUrl(), old.theme(), old.kind()).equals(c)) return old;
        return jdbc.sql("""
            UPDATE philosophy_quotes SET text=?,author=?,source=?,source_url=?,theme=?,kind=?,
                enabled=FALSE,reviewed_at=NULL,reviewed_by=NULL,updated_at=? WHERE id=? RETURNING *
            """).params(c.text(), c.author(), c.source(), c.sourceUrl(), c.theme(), c.kind(), Math.max(clock.getAsLong(), old.updatedAt() + 1), id)
            .query(MAPPER).single();
    }

    public Quote setUsage(String id, boolean enabled, String reviewerId, Long expectedUpdatedAt) {
        if (reviewerId == null || reviewerId.isBlank()) throw ApiException.forbidden("관리자 검수가 필요해요");
        if (expectedUpdatedAt == null || expectedUpdatedAt < 0) throw ApiException.badRequest("현재 문구를 다시 불러온 뒤 검수해 주세요");
        long now = clock.getAsLong();
        Optional<Quote> changed = jdbc.sql("""
            UPDATE philosophy_quotes SET enabled=?,reviewed_at=?,reviewed_by=?,updated_at=GREATEST(?,updated_at+1)
            WHERE id=? AND updated_at=? RETURNING *
            """).params(enabled, now, reviewerId, now, id, expectedUpdatedAt).query(MAPPER).optional();
        if (changed.isPresent()) return changed.get();
        if (jdbc.sql("SELECT count(*) FROM philosophy_quotes WHERE id=?").param(id).query(Long.class).single() == 0)
            throw ApiException.notFound("명언을 찾을 수 없어요");
        throw new ApiException(409, "문구나 검수 상태가 바뀌었어요. 다시 확인한 뒤 검수해 주세요");
    }

    /** A missing/unavailable optional quote must never stop a love or praise response. */
    public Optional<Quote> randomApproved() {
        try {
            return jdbc.sql("SELECT * FROM philosophy_quotes WHERE enabled=TRUE AND reviewed_at IS NOT NULL ORDER BY random() LIMIT 1")
                .query(MAPPER).optional();
        } catch (DataAccessException e) {
            log.warn("Approved philosophy quote lookup unavailable: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    static Content validate(Content body) {
        if (body == null) throw ApiException.badRequest("명언 내용을 입력해 주세요");
        String text = field(body.text(), "문구", TEXT_MAX);
        String author = field(body.author(), "저자", AUTHOR_MAX);
        String source = field(body.source(), "출처", SOURCE_MAX);
        String url = field(body.sourceUrl(), "출처 URL", URL_MAX);
        String theme = field(body.theme(), "주제", THEME_MAX);
        String kind = body.kind() == null ? "" : body.kind().strip();
        if (!KINDS.contains(kind)) throw ApiException.badRequest("의역 또는 번역을 골라 주세요");
        try {
            URI parsed = new URI(url);
            if (!("http".equals(parsed.getScheme()) || "https".equals(parsed.getScheme()))
                || parsed.getHost() == null || parsed.getUserInfo() != null)
                throw ApiException.badRequest("출처는 http 또는 https 주소로 입력해 주세요");
        } catch (URISyntaxException e) {
            throw ApiException.badRequest("출처 주소를 다시 확인해 주세요");
        }
        return new Content(text, author, source, url, theme, kind);
    }

    private static String field(String input, String label, int max) {
        String value = input == null ? "" : input.strip();
        if (value.isEmpty()) throw ApiException.badRequest(label + "를 입력해 주세요");
        if (value.codePointCount(0, value.length()) > max) throw ApiException.badRequest(label + "는 " + max + "자 이하로 입력해 주세요");
        if (value.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\t'))
            throw ApiException.badRequest(label + "에 사용할 수 없는 문자가 있어요");
        return value;
    }
}
