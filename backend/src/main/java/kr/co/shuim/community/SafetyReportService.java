package kr.co.shuim.community;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.common.Ids;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

@Service
public class SafetyReportService {
    private final JdbcClient jdbc;
    public SafetyReportService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record Report(String id, String reporterId, String kind, String targetId, String detail, long createdAt, Long reviewedAt) {}

    /** circle = 소로우 자체, space = 3D 공간의 방명록·풍등 (V53 에서 DB 제약도 함께 넓혔다) */
    static final Set<String> KINDS = Set.of("user", "message", "ai", "circle", "space");
    private static final java.util.regex.Pattern SPACE_TARGET = java.util.regex.Pattern.compile("^(guestbook:[0-9]{1,18}|lantern:[A-Za-z0-9_-]{1,64})$");

    private static long guestbookId(String target) {
        return Long.parseLong(target.substring("guestbook:".length()));
    }

    @Transactional
    public String submit(DbUser user, String kind, String targetId, String detail) {
        if (kind == null || !KINDS.contains(kind)) throw ApiException.badRequest("신고 종류를 확인해 주세요.");
        String text = detail == null ? "" : detail.strip();
        if (text.isEmpty() || text.length() > 2000) throw ApiException.badRequest("신고 내용을 1~2,000자로 입력해 주세요.");
        if (jdbc.sql("SELECT count(*) FROM safety_reports WHERE reporter_id = ? AND created_at > now() - interval '1 day'")
            .param(user.id()).query(Long.class).single() >= 20) throw new ApiException(429, "오늘 접수한 신고가 많아요. 잠시 후 다시 시도해 주세요.");
        if ("message".equals(kind)) {
            long visible = jdbc.sql("""
                SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
                WHERE m.id = ? AND (c.user_a = ? OR c.user_b = ?)
                """).param(targetId).param(user.id()).param(user.id()).query(Long.class).single();
            if (visible == 0) throw ApiException.notFound("메시지를 찾을 수 없어요.");
        } else if ("user".equals(kind)) {
            if (jdbc.sql("SELECT count(*) FROM users WHERE id = ?").param(targetId).query(Long.class).single() == 0)
                throw ApiException.notFound("사용자를 찾을 수 없어요.");
        } else if ("circle".equals(kind)) {
            // 소로우 자체(이름·소개·공지·아이콘): id 또는 주소(slug) 로 받고 id 로 저장한다
            String key = targetId == null ? "" : targetId.strip();
            if (key.isEmpty() || key.length() > 40) throw ApiException.notFound("소로우를 찾을 수 없어요.");
            targetId = jdbc.sql("SELECT id FROM communities WHERE id = ? OR slug = ? LIMIT 1").param(key).param(key)
                .query(String.class).optional().orElseThrow(() -> ApiException.notFound("소로우를 찾을 수 없어요."));
        } else if ("space".equals(kind)) {
            // 3D 공간의 이용자 글: "guestbook:<방명록 id>" 또는 "lantern:<풍등 id>" (풍등은 저장되지 않아 모양만 본다)
            String key = targetId == null ? "" : targetId.strip();
            if (key.length() > 80 || !SPACE_TARGET.matcher(key).matches()) throw ApiException.badRequest("신고 대상을 확인해 주세요.");
            if (key.startsWith("guestbook:") && jdbc.sql("SELECT count(*) FROM bamboo_guestbook WHERE id = ?")
                .param(guestbookId(key)).query(Long.class).single() == 0) throw ApiException.notFound("방명록 글을 찾을 수 없어요.");
            targetId = key;
        } else targetId = null;
        String id = Ids.uid();
        jdbc.sql("INSERT INTO safety_reports (id, reporter_id, kind, target_id, detail) VALUES (?, ?, ?, ?, ?)")
            .param(id).param(user.id()).param(kind).param(targetId).param(text).update();
        return id;
    }

    public List<Report> list() {
        return jdbc.sql("SELECT * FROM safety_reports ORDER BY reviewed_at NULLS FIRST, created_at DESC LIMIT 200")
            .query((rs, i) -> new Report(rs.getString("id"), rs.getString("reporter_id"), rs.getString("kind"), rs.getString("target_id"),
                rs.getString("detail"), Db.msReq(rs, "created_at"), Db.ms(rs, "reviewed_at"))).list();
    }

    @Transactional
    public void review(DbUser admin, String id, String action) {
        if (action == null || !Set.of("dismiss", "block").contains(action)) throw ApiException.badRequest("처리 방법을 확인해 주세요.");
        record Target(String kind, String id) {}
        Target target = jdbc.sql("SELECT kind, target_id FROM safety_reports WHERE id = ? FOR UPDATE").param(id)
            .query((rs, i) -> new Target(rs.getString("kind"), rs.getString("target_id"))).optional()
            .orElseThrow(() -> ApiException.notFound("신고를 찾을 수 없어요."));
        if ("block".equals(action)) {
            String userId;
            if ("user".equals(target.kind())) userId = target.id();
            else if ("message".equals(target.kind())) userId = jdbc.sql("SELECT sender_id FROM messages WHERE id = ?").param(target.id()).query(String.class).optional().orElse(null);
            else if ("space".equals(target.kind()) && target.id() != null && target.id().startsWith("guestbook:"))
                userId = jdbc.sql("SELECT author_id FROM bamboo_guestbook WHERE id = ?").param(guestbookId(target.id())).query(String.class).optional().orElse(null);
            else if ("ai".equals(target.kind())) throw ApiException.badRequest("AI 응답 신고는 검토 후 처리 완료로 표시해 주세요.");
            // 소로우·풍등은 글쓴이를 안전하게 특정할 수 없어 여기서 정지하지 않는다
            else throw ApiException.badRequest("이 신고는 작성자를 특정할 수 없어요. 검토 후 처리 완료로 표시해 주세요.");
            if (userId == null) throw ApiException.notFound("신고 대상을 찾을 수 없어요.");
            if (userId.equals(admin.id())) throw ApiException.badRequest("자신의 계정은 이 메뉴에서 정지할 수 없어요.");
            if ("admin".equals(jdbc.sql("SELECT role FROM users WHERE id = ?").param(userId).query(String.class).optional().orElse(null)))
                throw ApiException.badRequest("관리자 계정은 이 메뉴에서 정지할 수 없어요.");
            jdbc.sql("UPDATE users SET blocked_at = now(), blocked_reason = '안전 신고 검토' WHERE id = ?").param(userId).update();
        }
        jdbc.sql("UPDATE safety_reports SET reviewed_at = now(), reviewed_by = ? WHERE id = ?").param(admin.id()).param(id).update();
    }
}
