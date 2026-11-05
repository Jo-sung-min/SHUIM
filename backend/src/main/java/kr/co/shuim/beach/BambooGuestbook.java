package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public class BambooGuestbook {
    static final int BOARD_CAPACITY = 30;
    public record Entry(String id, String name, String story, long createdAt, boolean mine) {}
    public record Page(List<Entry> entries, String nextCursor) {}
    private static final RowMapper<Entry> ENTRY = (rs, i) -> new Entry(rs.getString("id"), rs.getString("display_name"),
            rs.getString("story"), rs.getTimestamp("created_at").getTime(), rs.getBoolean("mine"));

    private final JdbcClient jdbc;
    public BambooGuestbook(JdbcClient jdbc) { this.jdbc = jdbc; }

    public Page list(String community, String viewer, Long before) {
        if (before != null && before <= 0) throw ApiException.badRequest("이전 방명록을 다시 불러와 주세요.");
        // Take the same board of recent posts for everyone before checking blocks. Historical rows
        // stay available for idempotent retries, but cannot come back through an old cursor.
        var rows = jdbc.sql("""
            SELECT id, display_name, story, created_at, author_id = :viewer AS mine
            FROM (SELECT id, display_name, story, created_at, author_id FROM bamboo_guestbook
                  WHERE community_id = :community ORDER BY id DESC LIMIT :capacity) g
            WHERE id < :before AND NOT EXISTS (
              SELECT 1 FROM user_blocks b WHERE (b.blocker_id = :viewer AND b.blocked_id = g.author_id)
                 OR (b.blocked_id = :viewer AND b.blocker_id = g.author_id))
            ORDER BY id DESC
            """).param("viewer", viewer).param("community", community).param("before", before == null ? Long.MAX_VALUE : before)
            .param("capacity", BOARD_CAPACITY).query(ENTRY).list();
        return new Page(rows, null);
    }

    @Transactional
    public Entry write(String community, String author, UUID requestId, String name, String story) {
        // Serialize repeated sends from this account, including simultaneous visits on two devices.
        jdbc.sql("SELECT id FROM users WHERE id = ? FOR UPDATE").param(author).query(String.class).single();
        var existing = jdbc.sql("""
            SELECT id, display_name, story, created_at, true AS mine FROM bamboo_guestbook
            WHERE community_id=? AND author_id=? AND request_id=?
            """).param(community).param(author).param(requestId).query(ENTRY).optional();
        if (existing.isPresent()) {
            var entry = existing.get();
            if (!entry.name().equals(name) || !entry.story().equals(story))
                throw new ApiException(409, "이미 저장된 방명록이에요. 새 이야기로 다시 남겨 주세요.");
            return entry;
        }
        if (Boolean.TRUE.equals(jdbc.sql("""
            SELECT EXISTS (SELECT 1 FROM bamboo_guestbook WHERE community_id=? AND author_id=?
            AND created_at > CURRENT_TIMESTAMP - INTERVAL '15 seconds')
            """).param(community).param(author).query(Boolean.class).single()))
            throw new ApiException(429, "이야기를 남긴 뒤 15초가 지나면 다시 쓸 수 있어요.");
        return jdbc.sql("""
            INSERT INTO bamboo_guestbook (community_id, author_id, request_id, display_name, story)
            VALUES (?, ?, ?, ?, ?) RETURNING id, display_name, story, created_at, true AS mine
            """).param(community).param(author).param(requestId).param(name).param(story).query(ENTRY).single();
    }
}
