package kr.co.shuim.circle;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 커뮤니티 소로우 규칙 (DB 없음, 순수 함수): 이름·주소 검사, 메일 도메인 확인, 실명·연락처 가리기, 사연 공개 범위.
 */
public final class CircleLogic {
    private CircleLogic() {}

    /**
     * 소로우 묶음: 회사·학교 같은 소속이나 직함보다 즐기는 일·살아가는 일·사람의 근본 고민으로 모인다.
     * enjoy(미식·여행·운동…), live(자취·출퇴근·반려생활…), love(싱글·모솔·이별·이혼·돌싱·외로움),
     * work(회사원·자영업…), study(대학생·취준생…), rest(쉬는 중), care(육아·돌봄).
     * 소속을 드러내면 누군가에게는 박탈감이 되어서, 소속 이름이 붙은 소로우는 만들지 않는다
     */
    public static final List<String> KINDS = List.of("enjoy", "live", "love", "work", "study", "rest", "care");
    public static final List<String> JOIN_MODES = List.of("open", "approve", "invite", "domain");
    public static final List<String> VISIBILITIES = List.of("public", "members");
    /** 한 사람(관리자)이 열 수 있는 소로우 */
    public static final int MAX_OWNED = 30;
    public static final String MASK = "○○";

    private static final Pattern SLUG = Pattern.compile("^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$");
    private static final Pattern DOMAIN = Pattern.compile("^(?=.{3,100}$)([a-z0-9-]+\\.)+[a-z]{2,}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@([^\\s@]+\\.[^\\s@]+)$");

    /** 이름: 2~30자, 끝에 '소로우'가 없으면 붙인다 ("쉬는 중" → "쉬는 중 소로우") */
    public static String normalizeName(String raw) {
        if (raw == null) return null;
        String n = raw.strip().replaceAll("\\s+", " ");
        if (n.isEmpty()) return null;
        if (!n.endsWith("소로우")) n = n + " 소로우";
        if (n.length() < 4 || n.length() > 30) return null;
        return n;
    }

    /** 같은 이름 막기용 키: 공백 없애고 소문자 */
    public static String nameKey(String name) { return name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT); }

    /** 주소용 이름: 영문 소문자·숫자·하이픈 3~40자 */
    public static String normalizeSlug(String raw) {
        if (raw == null) return null;
        String s = raw.strip().toLowerCase(Locale.ROOT);
        return SLUG.matcher(s).matches() ? s : null;
    }

    /** 메일 도메인: "@korea.ac.kr", "korea.ac.kr" 모두 받아서 "korea.ac.kr" 로 */
    public static String normalizeDomain(String raw) {
        if (raw == null) return null;
        String d = raw.strip().toLowerCase(Locale.ROOT);
        if (d.startsWith("@")) d = d.substring(1);
        return DOMAIN.matcher(d).matches() ? d : null;
    }

    /** 메일이 그 도메인(또는 하위 도메인) 소속인지. 예: a@korea.ac.kr, a@student.korea.ac.kr → korea.ac.kr */
    public static boolean emailMatchesDomain(String email, String domain) {
        if (email == null || domain == null) return false;
        Matcher m = EMAIL.matcher(email.strip().toLowerCase(Locale.ROOT));
        if (!m.matches()) return false;
        String host = m.group(1);
        return host.equals(domain) || host.endsWith("." + domain);
    }

    public static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String emailHash(String email) { return sha256("circle-email:" + email.strip().toLowerCase(Locale.ROOT)); }

    /* ---------- 실명·연락처 가리기 (AI 가 없을 때, 그리고 보내기 전 경고용) ---------- */

    public record Masked(String text, List<String> found) {}

    private static final Pattern PHONE = Pattern.compile("01[016789][-\\s.]?\\d{3,4}[-\\s.]?\\d{4}");
    private static final Pattern MAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final Pattern LONG_NUMBER = Pattern.compile("(?<!\\d)\\d{7,10}(?!\\d)");
    private static final Pattern TITLED_NAME = Pattern.compile(
        "(?<![가-힣])([가-힣]{2,3})\\s?(교수님|교수|팀장님|팀장|부장님|부장|과장님|과장|차장님|차장|대리님|대리|사장님|사장|상무님|상무|전무님|전무|선생님|매니저님|매니저|선배|후배|조교)");
    private static final Pattern NAME_SSI = Pattern.compile("(?<![가-힣])([가-힣]{2,3}) 씨");

    /** 실명(직함 앞 이름), 전화번호, 메일, 학번·사번 같은 긴 숫자를 ○○ 로 */
    public static Masked mask(String text) {
        if (text == null) return new Masked("", List.of());
        List<String> found = new ArrayList<>();
        String t = text;
        if (PHONE.matcher(t).find()) { found.add("전화번호"); t = PHONE.matcher(t).replaceAll("○○○-○○○○-○○○○"); }
        if (MAIL.matcher(t).find()) { found.add("메일 주소"); t = MAIL.matcher(t).replaceAll("○○○@○○○"); }
        if (LONG_NUMBER.matcher(t).find()) { found.add("학번·사번 같은 번호"); t = LONG_NUMBER.matcher(t).replaceAll("○○○○○○○"); }
        Matcher tn = TITLED_NAME.matcher(t);
        if (tn.find()) { found.add("실명으로 보이는 이름"); t = TITLED_NAME.matcher(t).replaceAll(MASK + "$2"); }
        Matcher ns = NAME_SSI.matcher(t);
        if (ns.find()) { if (!found.contains("실명으로 보이는 이름")) found.add("실명으로 보이는 이름"); t = NAME_SSI.matcher(t).replaceAll(MASK + " 씨"); }
        return new Masked(t, found);
    }

    /** 공백·줄바꿈 정리 (AI 없을 때의 '정리') */
    public static String tidy(String text) {
        if (text == null) return "";
        String t = text.replace("\r\n", "\n").replaceAll("[ \\t]+", " ").replaceAll(" *\\n *", "\n").replaceAll("\\n{3,}", "\n\n").strip();
        return t;
    }

    /* ---------- 사연 공개 범위 ---------- */

    /**
     * 이 사연(소로우 글)을 보는 사람이 볼 수 있는지.
     * - 멤버만 보기 소로우는 멤버만
     * - 게시 시각을 무작위로 늦춘 글은 그 시각이 지나야 (보낸 사람·관리자는 바로)
     */
    public static boolean canSee(String communityId, String visibility, Set<String> viewerCircles, boolean admin, boolean author, long createdAt, long now) {
        if (communityId == null || admin || author) return true;
        if ("members".equals(visibility) && !viewerCircles.contains(communityId)) return false;
        return createdAt <= now;
    }

    /** 다른 사람에게 보일 작성자 id: 사연은 소로우로 가린다 */
    public static String maskedAuthor(String communityId) { return "c:" + communityId; }

    /** 게시를 늦출 시간(분): 보낸 시각과 게시 시각으로 사람을 짐작하지 못하게 10~90분 사이 무작위 */
    public static int publishDelayMinutes(Random random) { return 10 + random.nextInt(81); }
}
