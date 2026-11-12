package kr.co.shuim.keepsake;

import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 보관함의 저장소: 주운 감정구슬과 맵 앨범 (docs/EMOTION_ORBS.md). 둘 다 본인만 읽는다.
 * 구슬은 (계정, 한국 날짜)에 하나. 내려놓은 구슬도 그날의 자리를 차지해서 같은 날 다시 얻을 수 없다.
 */
@Repository
public class Keepsakes {
    static final int SHELF_LIMIT = 400;
    static final int COMPANION_LIMIT = 20;

    public record Companion(String id, String nick) {}
    /** companions 는 지금도 이름을 보여 줄 수 있는 사람들, companionCount 는 그 순간 함께 있던 사람 수 */
    public record Orb(String id, String day, long foundAt, int mood, String mapId, boolean shared, String spaceName,
                      String spotId, String spotName, List<Companion> companions, int companionCount) {}
    public record Photo(String id, String url, String mapId, String spaceName, long createdAt) {}

    private static final String ORB_COLUMNS = "id, day, found_at, mood, map_id, space_id, space_name, spot_id, spot_name, companion_count";

    private final JdbcClient jdbc;

    public Keepsakes(JdbcClient jdbc) { this.jdbc = jdbc; }

    /* ---------- 감정구슬 ---------- */

    /** 최근에 주운 것부터. 서로 차단한 사람과 탈퇴한 사람의 이름은 빠지고 수만 남는다 */
    public List<Orb> orbs(String userId) {
        Map<Long, List<Companion>> names = new HashMap<>();
        jdbc.sql("""
            SELECT c.orb_id, c.user_id, c.nick FROM emotion_orb_companions c
            JOIN emotion_orbs o ON o.id = c.orb_id
            WHERE o.user_id = :me AND o.removed_at IS NULL AND NOT EXISTS (
              SELECT 1 FROM user_blocks b WHERE (b.blocker_id = :me AND b.blocked_id = c.user_id)
                 OR (b.blocked_id = :me AND b.blocker_id = c.user_id))
            ORDER BY c.orb_id, c.nick, c.user_id
            """).param("me", userId).query((rs, i) -> {
                names.computeIfAbsent(rs.getLong("orb_id"), id -> new ArrayList<>())
                    .add(new Companion(rs.getString("user_id"), rs.getString("nick")));
                return null;
            }).list();
        return jdbc.sql("SELECT " + ORB_COLUMNS + " FROM emotion_orbs WHERE user_id = ? AND removed_at IS NULL ORDER BY day DESC LIMIT ?")
            .param(userId).param(SHELF_LIMIT)
            .query((rs, i) -> new Orb(String.valueOf(rs.getLong("id")), rs.getDate("day").toLocalDate().toString(),
                rs.getTimestamp("found_at").getTime(), rs.getInt("mood"), rs.getString("map_id"),
                "public".equals(rs.getString("space_id")), rs.getString("space_name"), rs.getString("spot_id"),
                rs.getString("spot_name"), List.copyOf(names.getOrDefault(rs.getLong("id"), List.of())), rs.getInt("companion_count")))
            .list();
    }

    /** 그날의 구슬을 이미 주웠는지 (내려놓은 구슬도 주운 것이다) */
    public boolean foundOn(String userId, LocalDate day) {
        return Boolean.TRUE.equals(jdbc.sql("SELECT EXISTS (SELECT 1 FROM emotion_orbs WHERE user_id = ? AND day = ?)")
            .param(userId).param(day).query(Boolean.class).single());
    }

    /** 줍기. 같은 날 두 번째는 409 (두 기기에서 동시에 주워도 하나만 남는다) */
    @Transactional
    public Orb claim(String userId, LocalDate day, int mood, String mapId, String spaceId, String spaceName,
                     String spotId, String spotName, List<Companion> companions) {
        List<Companion> beside = companions.stream().filter(c -> !c.id().equals(userId)).limit(COMPANION_LIMIT).toList();
        Long id = jdbc.sql("""
            INSERT INTO emotion_orbs (user_id, day, mood, map_id, space_id, space_name, spot_id, spot_name, companion_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, day) DO NOTHING RETURNING id
            """).param(userId).param(day).param(mood).param(mapId).param(spaceId).param(spaceName).param(spotId).param(spotName)
            .param(beside.size()).query(Long.class).optional().orElse(null);
        if (id == null) throw new ApiException(409, "오늘의 구슬은 이미 주웠어요.");
        for (Companion c : beside) {
            // 그 사이 탈퇴한 계정이면 이름을 적지 않는다 (수에는 남는다)
            jdbc.sql("INSERT INTO emotion_orb_companions (orb_id, user_id, nick) SELECT ?, id, ? FROM users WHERE id = ? ON CONFLICT DO NOTHING")
                .param(id).param(c.nick()).param(c.id()).update();
        }
        String key = String.valueOf(id);
        return orbs(userId).stream().filter(orb -> orb.id().equals(key)).findFirst().orElseThrow();
    }

    /** 내려놓기: 보관함에서 빼되 그날의 자리는 그대로 둔다 */
    public boolean removeOrb(String userId, long id) {
        return jdbc.sql("UPDATE emotion_orbs SET removed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND removed_at IS NULL")
            .param(id).param(userId).update() > 0;
    }

    /* ---------- 맵 앨범 ---------- */

    public List<Photo> photos(String userId) {
        return jdbc.sql("SELECT id, url, map_id, space_name, created_at FROM map_photos WHERE user_id = ? ORDER BY id DESC")
            .param(userId).query((rs, i) -> new Photo(String.valueOf(rs.getLong("id")), rs.getString("url"), rs.getString("map_id"),
                rs.getString("space_name"), rs.getTimestamp("created_at").getTime())).list();
    }

    /** 내가 올린 사진만 앨범에 들어간다. 같은 사진을 다시 넣으면 처음 넣은 것을 돌려준다. 가득 차면 409 */
    @Transactional
    public Photo addPhoto(String userId, String key, String url, String mapId, String spaceName, int max) {
        // 두 기기에서 동시에 넣어도 한도를 넘지 않게 계정 단위로 줄을 세운다
        jdbc.sql("SELECT id FROM users WHERE id = ? FOR UPDATE").param(userId).query(String.class).single();
        if (!Boolean.TRUE.equals(jdbc.sql("SELECT EXISTS (SELECT 1 FROM uploaded_objects WHERE object_key = ? AND user_id = ?)")
            .param(key).param(userId).query(Boolean.class).single()))
            throw ApiException.badRequest("내가 올린 사진만 앨범에 넣을 수 있어요.");
        Long existing = jdbc.sql("SELECT id FROM map_photos WHERE user_id = ? AND object_key = ?")
            .param(userId).param(key).query(Long.class).optional().orElse(null);
        if (existing == null) {
            int count = jdbc.sql("SELECT count(*) FROM map_photos WHERE user_id = ?").param(userId).query(Integer.class).single();
            if (count >= max) throw new ApiException(409, "앨범이 가득 찼어요 (" + max + "장). 사진을 정리한 뒤 다시 넣어 주세요.");
            existing = jdbc.sql("INSERT INTO map_photos (user_id, object_key, url, map_id, space_name) VALUES (?, ?, ?, ?, ?) RETURNING id")
                .param(userId).param(key).param(url).param(mapId).param(spaceName).query(Long.class).single();
        }
        String id = String.valueOf(existing);
        return photos(userId).stream().filter(photo -> photo.id().equals(id)).findFirst().orElseThrow();
    }

    /** 앨범에서 빼고, 사진 파일은 정리 작업이 지운다 */
    @Transactional
    public boolean removePhoto(String userId, long id) {
        String key = jdbc.sql("DELETE FROM map_photos WHERE id = ? AND user_id = ? RETURNING object_key")
            .param(id).param(userId).query(String.class).optional().orElse(null);
        if (key == null) return false;
        jdbc.sql("INSERT INTO object_deletion_jobs (object_key) VALUES (?) ON CONFLICT (object_key) DO NOTHING").param(key).update();
        return true;
    }
}
