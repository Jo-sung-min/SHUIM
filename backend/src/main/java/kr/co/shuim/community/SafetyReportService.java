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

    @Transactional
    public String submit(DbUser user, String kind, String targetId, String detail) {
        if (kind == null || !Set.of("user", "message", "ai").contains(kind)) throw ApiException.badRequest("신고 종류를 확인해 주세요.");
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
            else throw ApiException.badRequest("AI 응답 신고는 검토 후 처리 완료로 표시해 주세요.");
            if (userId == null) throw ApiException.notFound("신고 대상을 찾을 수 없어요.");
            if (userId.equals(admin.id())) throw ApiException.badRequest("자신의 계정은 이 메뉴에서 정지할 수 없어요.");
            jdbc.sql("UPDATE users SET blocked_at = now(), blocked_reason = '안전 신고 검토' WHERE id = ?").param(userId).update();
        }
        jdbc.sql("UPDATE safety_reports SET reviewed_at = now(), reviewed_by = ? WHERE id = ?").param(admin.id()).param(id).update();
    }
}
