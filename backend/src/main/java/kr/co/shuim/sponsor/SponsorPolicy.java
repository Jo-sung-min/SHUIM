package kr.co.shuim.sponsor;

import kr.co.shuim.config.ApiException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 기업 후원 규칙과 입력 검사. 금액·한도는 서버가 정하고 클라이언트 값은 검사된 문자열·숫자만 쓴다. */
public final class SponsorPolicy {
    private SponsorPolicy() {}

    /** 한 회원이 하루(Asia/Seoul)에 멋져요로 받을 수 있는 이용권 수 */
    public static final int DAILY_CHEERS = 3;
    /** PC 양옆 후원 액자 칸 수(한쪽). 프론트는 열 높이를 이 수로 나눠 한 화면에 다 보인다 */
    public static final int SLOTS_PER_SIDE = 5;
    /** 후원 1,000원 = 폭죽 1개 */
    public static final long WON_PER_FIREWORK = 1_000L;
    public static final long MAX_CONTRIBUTION_WON = 100_000_000L;
    public static final int NAME_MAX = 40, TAGLINE_MAX = 80, NOTE_MAX = 200, LINK_MAX = 500, EMAIL_MAX = 254, PRICE_LABEL_MAX = 40;
    public static final int IMAGE_MAX_BYTES = 400 * 1024;
    public static final String DEFAULT_CONTACT_EMAIL = "hello@sorow.co.kr";
    public static final String DEFAULT_PRICE_LABEL = "30일 30만원";

    private static final Set<String> IMAGE_TYPES = Set.of("image/png", "image/jpeg", "image/webp");
    private static final Pattern DATA_URL = Pattern.compile("^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\\s]+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern LINK = Pattern.compile("^https?://[^\\s<>\"']+$", Pattern.CASE_INSENSITIVE);
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    /** 꾸미기 액자: 테 모양 · 포인트 색 · 모서리 장식. 프론트 lib/sponsor-frames.ts 와 같은 목록 */
    public static final List<String> FRAME_STYLES = List.of("glass", "gold", "wood", "neon", "aurora", "polaroid", "stamp", "ink");
    public static final List<String> FRAME_COLORS = List.of("violet", "navy", "teal", "green", "gold", "coral", "pink", "ink");
    public static final List<String> FRAME_DECOS = List.of("none", "ribbon", "star", "leaf", "flame", "heart", "sparkle");
    /** 꾸미기 링크의 키: 32바이트 난수의 base64url (패딩 없이 43자) */
    private static final Pattern STUDIO_KEY = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Image(String type, String base64, int bytes) {}
    public record Frame(String style, String color, String deco) {
        public static final Frame DEFAULT = new Frame("glass", "violet", "none");
    }

    /** 저장할 액자: 목록에 없는 값은 400 */
    public static Frame frame(String style, String color, String deco) {
        if (style == null || !FRAME_STYLES.contains(style)) throw ApiException.badRequest("액자를 다시 골라 주세요.");
        if (color == null || !FRAME_COLORS.contains(color)) throw ApiException.badRequest("색을 다시 골라 주세요.");
        if (deco == null || !FRAME_DECOS.contains(deco)) throw ApiException.badRequest("장식을 다시 골라 주세요.");
        return new Frame(style, color, deco);
    }

    /** DB 에서 읽은 액자: 목록에서 빠진 값은 기본값으로 */
    public static Frame frameOrDefault(String style, String color, String deco) {
        return new Frame(known(FRAME_STYLES, style) ? style : Frame.DEFAULT.style(),
            known(FRAME_COLORS, color) ? color : Frame.DEFAULT.color(),
            known(FRAME_DECOS, deco) ? deco : Frame.DEFAULT.deco());
    }

    /** List.of(..).contains(null) 은 예외를 던지므로 null 을 먼저 거른다 */
    private static boolean known(List<String> list, String value) { return value != null && list.contains(value); }

    public static String newStudioKey() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 키의 SHA-256(hex). 모양이 다르면 null (DB 를 보지 않고 거절한다) */
    public static String studioKeyHash(String key) {
        if (key == null || !STUDIO_KEY.matcher(key).matches()) return null;
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.US_ASCII))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public static int fireworksFor(long amountWon) {
        if (amountWon < WON_PER_FIREWORK || amountWon > MAX_CONTRIBUTION_WON) throw ApiException.badRequest("후원 금액은 1,000원 이상 1억원 이하로 넣어 주세요.");
        return (int) (amountWon / WON_PER_FIREWORK);
    }

    public static String name(String value) { return text(value, NAME_MAX, "이름은", true); }
    public static String tagline(String value) { return text(value, TAGLINE_MAX, "한 줄 소개는", false); }
    public static String note(String value) {
        String v = text(value, NOTE_MAX, "메모는", false);
        return v.isEmpty() ? null : v;
    }

    public static String text(String value, int max, String label, boolean required) {
        String v = value == null ? "" : value.strip();
        if (required && v.isEmpty()) throw ApiException.badRequest(label + " 비울 수 없어요.");
        if (v.length() > max) throw ApiException.badRequest(label + " " + max + "자 이하로 적어 주세요.");
        return v;
    }

    /** http(s) 링크만. 비어 있으면 required 에 따라 null 또는 400 */
    public static String link(String value, boolean required) {
        String v = value == null ? "" : value.strip();
        if (v.isEmpty()) {
            if (required) throw ApiException.badRequest("링크를 넣어 주세요.");
            return null;
        }
        if (v.length() > LINK_MAX || !LINK.matcher(v).matches()) throw ApiException.badRequest("링크는 http:// 또는 https:// 로 시작하는 주소여야 해요.");
        return v;
    }

    public static String email(String value) {
        String v = value == null ? "" : value.strip();
        if (v.isEmpty()) return DEFAULT_CONTACT_EMAIL;
        if (v.length() > EMAIL_MAX || !EMAIL.matcher(v).matches()) throw ApiException.badRequest("문의 메일 주소 형식을 확인해 주세요.");
        return v;
    }

    public static String priceLabel(String value) {
        String v = text(value, PRICE_LABEL_MAX, "가격 문구는", false);
        return v.isEmpty() ? DEFAULT_PRICE_LABEL : v;
    }

    public static void period(long startsAt, long endsAt) {
        if (startsAt <= 0 || endsAt <= 0 || endsAt <= startsAt) throw ApiException.badRequest("게시 종료 시각은 시작 시각보다 뒤여야 해요.");
    }

    public static boolean live(boolean published, long startsAt, long endsAt, long now) {
        return published && startsAt <= now && now < endsAt;
    }

    public static String status(boolean published, long startsAt, long endsAt, long now) {
        if (!published) return "hidden";
        if (now < startsAt) return "scheduled";
        if (now >= endsAt) return "ended";
        return "live";
    }

    /** data URL(png/jpeg/webp, ≤400 KB) 을 MIME 과 base64 본문으로 나눈다 */
    public static Image decodeImage(String dataUrl) {
        Matcher m = DATA_URL.matcher(dataUrl == null ? "" : dataUrl.strip());
        if (!m.matches()) throw ApiException.badRequest("이미지 형식을 읽지 못했어요.");
        String type = m.group(1).toLowerCase(Locale.ROOT);
        if (!IMAGE_TYPES.contains(type)) throw ApiException.badRequest("PNG·JPEG·WebP 이미지만 올릴 수 있어요.");
        String base64 = m.group(2).replaceAll("\\s", "");
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(base64); }
        catch (IllegalArgumentException e) { throw ApiException.badRequest("이미지 형식을 읽지 못했어요."); }
        if (bytes.length == 0) throw ApiException.badRequest("빈 이미지예요.");
        if (bytes.length > IMAGE_MAX_BYTES) throw ApiException.badRequest("이미지는 " + (IMAGE_MAX_BYTES / 1024) + "KB 이하로 올려요.");
        return new Image(type, base64, bytes.length);
    }
}
