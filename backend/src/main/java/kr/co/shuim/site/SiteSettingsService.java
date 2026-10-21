package kr.co.shuim.site;

import kr.co.shuim.common.Db;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 사이트 설정 (site_settings). 값이 없으면 프론트가 lib/site.ts 의 기본값을 쓴다.
 * 이미지는 data URL 로 받아 base64 그대로 저장하고 /api/site/{favicon,og} 가 바이트로 내려준다.
 */
@Service
public class SiteSettingsService {
    public static final int TITLE_MAX = 60;
    public static final int DESCRIPTION_MAX = 160;
    public static final int FAVICON_MAX_BYTES = 300 * 1024;
    public static final int OG_MAX_BYTES = 1024 * 1024;
    private static final Set<String> IMAGE_TYPES = Set.of("image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon");
    private static final Pattern DATA_URL = Pattern.compile("^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\\s]+)$", Pattern.CASE_INSENSITIVE);

    private final JdbcClient jdbc;

    public SiteSettingsService(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** 저장된 이미지 한 장 */
    public record Image(String type, byte[] bytes, long updatedAt) {}

    private record Row(String key, String value, long updatedAt) {}

    private Map<String, Row> all() {
        Map<String, Row> m = new HashMap<>();
        jdbc.sql("SELECT key, value, updated_at FROM site_settings")
            .query((rs, i) -> new Row(rs.getString("key"), rs.getString("value"), Db.msReq(rs, "updated_at")))
            .list().forEach(r -> m.put(r.key(), r));
        return m;
    }

    /** GET /api/site: 관리자가 바꾼 글만 (없으면 null), 이미지는 바뀐 시각만 (주소 뒤 ?v= 로 캐시를 깬다) */
    public Map<String, Object> summary() {
        Map<String, Row> m = all();
        Map<String, Object> out = new HashMap<>();
        out.put("title", m.containsKey("title") ? m.get("title").value() : null);
        out.put("description", m.containsKey("description") ? m.get("description").value() : null);
        out.put("faviconAt", m.containsKey("favicon.data") ? m.get("favicon.data").updatedAt() : null);
        out.put("ogAt", m.containsKey("og.data") ? m.get("og.data").updatedAt() : null);
        return out;
    }

    public Optional<Image> image(String kind) {
        Map<String, Row> m = all();
        Row data = m.get(kind + ".data");
        Row type = m.get(kind + ".type");
        if (data == null || type == null) return Optional.empty();
        return Optional.of(new Image(type.value(), Base64.getDecoder().decode(data.value()), data.updatedAt()));
    }

    /** 제목·설명. 비우면 기본값으로 돌아간다 (행 삭제) */
    @Transactional
    public void setText(String key, String value) {
        int max = "title".equals(key) ? TITLE_MAX : DESCRIPTION_MAX;
        String v = value == null ? "" : value.strip();
        if (v.isEmpty()) { delete(key); return; }
        if (v.length() > max) throw ApiException.badRequest(("title".equals(key) ? "제목은 " : "설명은 ") + max + "자 이하로 해요.");
        upsert(key, v);
    }

    /** 파비콘·공유 이미지. data URL(png/jpeg/webp/ico) 을 받고, null 이면 기본 이미지로 돌아간다 */
    @Transactional
    public void setImage(String kind, String dataUrl) {
        if (dataUrl == null || dataUrl.isBlank()) {
            delete(kind + ".data");
            delete(kind + ".type");
            return;
        }
        Decoded d = decode(kind, dataUrl);
        upsert(kind + ".type", d.type());
        upsert(kind + ".data", d.base64());
    }

    /** data URL 을 검사해 MIME 과 base64 본문으로 나눈다 (형식·종류·크기 검사) */
    record Decoded(String type, String base64, int bytes) {}

    static Decoded decode(String kind, String dataUrl) {
        Matcher mt = DATA_URL.matcher(dataUrl.strip());
        if (!mt.matches()) throw ApiException.badRequest("이미지 형식을 읽지 못했어요.");
        String type = mt.group(1).toLowerCase(Locale.ROOT);
        if (!IMAGE_TYPES.contains(type)) throw ApiException.badRequest("PNG·JPEG·WebP·ICO 이미지만 올릴 수 있어요.");
        String b64 = mt.group(2).replaceAll("\\s", "");
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("이미지 형식을 읽지 못했어요.");
        }
        int max = "favicon".equals(kind) ? FAVICON_MAX_BYTES : OG_MAX_BYTES;
        if (bytes.length == 0) throw ApiException.badRequest("빈 이미지예요.");
        if (bytes.length > max) throw ApiException.badRequest("이미지는 " + (max / 1024) + "KB 이하로 올려요.");
        return new Decoded(type, b64, bytes.length);
    }

    private void upsert(String key, String value) {
        jdbc.sql("""
            INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            """).param(key).param(value).param(LocalDateTime.now(ZoneOffset.UTC)).update();
    }

    private void delete(String key) {
        jdbc.sql("DELETE FROM site_settings WHERE key = ?").param(key).update();
    }
}
