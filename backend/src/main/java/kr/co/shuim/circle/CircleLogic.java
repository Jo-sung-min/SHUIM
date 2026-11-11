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
     * 기본 소로우 묶음 (circle_groups 의 builtin, V36). 새 묶음은 소로우를 열 때 만든다. 회사·학교 같은 소속이나 직함보다 즐기는 일·살아가는 일·사람의 근본 고민으로 모인다.
     * enjoy(미식·여행·운동…), live(자취·출퇴근·반려생활…), love(싱글·모솔·이별·이혼·돌싱·외로움),
     * work(회사원·자영업…), study(대학생·취준생…), rest(쉬는 중), care(육아·돌봄).
     * 소속을 드러내면 누군가에게는 박탈감이 되어서, 소속 이름이 붙은 소로우는 만들지 않는다
     */
    public static final List<String> KINDS = List.of("enjoy", "live", "love", "work", "study", "rest", "care");
    public static final List<String> JOIN_MODES = List.of("open", "approve", "invite", "domain");
    public static final List<String> VISIBILITIES = List.of("public", "members");
    /** 한 사람이 열 수 있는 소로우 */
    public static final int MAX_OWNED = 30;
    /** 예전 기본 아이콘 18개 (frontend components/CircleMark CIRCLE_ICONS 와 같은 id). 이미 고른 소로우가 있어 계속 받는다 */
    public static final java.util.Set<String> ICONS = java.util.Set.of("coffee", "leaf", "heart", "star", "moon", "sun", "book", "briefcase", "run", "gamepad", "music", "film", "palette", "plane", "paw", "lotus", "clover", "flame");
    /** Microsoft Fluent UI System Icons(MIT) 에서 고른 아이콘은 "fl:<이름>" 으로 저장한다 */
    public static final String FLUENT_PREFIX = "fl:";
    private static volatile Set<String> fluentIcons;

    /** 아이콘 찾기에 들어간 Fluent 아이콘 이름 (frontend/scripts/build-fluent-icons.mjs 가 만든 목록) */
    static Set<String> fluentIcons() {
        Set<String> names = fluentIcons;
        if (names != null) return names;
        Set<String> loaded = new HashSet<>();
        try (var in = CircleLogic.class.getResourceAsStream("/circle-fluent-icons.txt")) {
            if (in != null) {
                for (String line : new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\n")) {
                    String name = line.strip();
                    if (!name.isEmpty() && !name.startsWith("#")) loaded.add(name);
                }
            }
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Fluent 아이콘 목록을 읽지 못했어요", e);
        }
        fluentIcons = Set.copyOf(loaded);
        return fluentIcons;
    }

    /** 저장할 수 있는 아이콘 id 인지: 예전 18개 또는 목록에 있는 Fluent 아이콘. 아니면 null */
    public static String normalizeIcon(String raw) {
        if (raw == null) return null;
        if (ICONS.contains(raw)) return raw;
        if (raw.startsWith(FLUENT_PREFIX) && raw.length() <= 48 && fluentIcons().contains(raw.substring(FLUENT_PREFIX.length()))) return raw;
        return null;
    }

    /* ---------- 묶음 ---------- */

    /** 묶음 id: 기본 묶음은 enjoy…, 새 묶음은 g- + 8자 */
    private static final Pattern GROUP_ID = Pattern.compile("^[a-z0-9-]{1,12}$");
    private static final Pattern GROUP_LABEL = Pattern.compile("^[가-힣A-Za-z0-9 ·-]{2,10}$");
    private static final Pattern HAS_LETTER = Pattern.compile("[가-힣A-Za-z]");
    /** 회사·학교 같은 소속은 묶음으로 만들지 않는다 (누군가에게는 박탈감이 되어서) */
    private static final List<String> AFFILIATION_ENDINGS = List.of("대학교", "고등학교", "중학교", "초등학교", "주식회사", "(주)", "㈜");

    public static boolean isGroupId(String raw) { return raw != null && GROUP_ID.matcher(raw).matches(); }

    /** 새 묶음 이름: 공백 하나로, 끝의 '소로우'는 떼고, 2~10자 한글·영문·숫자·공백·가운뎃점·하이픈. 아니면 null */
    public static String normalizeGroupLabel(String raw) {
        if (raw == null) return null;
        String n = raw.strip().replaceAll("\\s+", " ").replace('ㆍ', '·').replace('•', '·').replaceAll("\\s*·\\s*", "·");
        n = n.replaceAll("\\s*소로우$", "").strip();
        if (!GROUP_LABEL.matcher(n).matches() || !HAS_LETTER.matcher(n).find() || n.matches("^[·-].*|.*[·-]$")) return null;
        return n;
    }

    /** 같은 묶음 막기용 키: 공백·가운뎃점·하이픈 없애고 소문자 ("사랑 혼자" = "사랑·혼자") */
    public static String groupKey(String label) { return label.replaceAll("[\\s·-]+", "").toLowerCase(Locale.ROOT); }

    public static boolean affiliationLabel(String label) {
        String compact = label.replaceAll("\\s+", "");
        return AFFILIATION_ENDINGS.stream().anyMatch(compact::endsWith);
    }

    public static String newGroupId(java.util.random.RandomGenerator random) {
        String abc = "abcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder("g-");
        for (int i = 0; i < 8; i++) sb.append(abc.charAt(random.nextInt(abc.length())));
        return sb.toString();
    }

    /* ---------- 쓰면 안 되는 말 (소로우 이름·묶음 이름) ---------- */

    /**
     * 욕설·비하·성적인 말. 띄어쓰기·숫자·기호를 끼워 넣어도 걸리게 지운 뒤 찾는다.
     * '새끼 고양이', '시바견', '보지 않아', '애자일', '등신대'처럼 평범한 말에 섞이는 짧은 낱말은 넣지 않는다.
     */
    private static final List<String> OFFENSIVE = List.of(
        "씨발", "시발", "씨빨", "시빨", "쓰발", "씨팔", "시팔", "ㅅㅂ", "ㅆㅂ", "ㅄ", "ㅂㅅ", "병신", "븅신", "빙신", "지랄", "ㅈㄹ",
        "좆", "존나", "ㅈㄴ", "개새", "개색", "개쌔", "ㄱㅅㄲ", "씹새", "씹창", "씹할", "썅", "미친놈", "미친년", "미친새", "ㅁㅊ",
        "염병", "엠창", "느금", "니애미", "니애비", "창녀", "걸레년", "한남충", "김치녀", "된장녀", "틀딱", "급식충", "맘충",
        "짱깨", "쪽바리", "똥꼬충", "섹스", "야동", "포르노", "fuck", "shit", "bitch", "porn");

    public static boolean offensive(String text) {
        if (text == null) return false;
        String t = text.toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Punct}·0-9_]+", "");
        return OFFENSIVE.stream().anyMatch(t::contains);
    }

    /** 다른 경로와 겹치는 주소 (GET /api/circles/warm·mine·groups, 화면 /c/new·/c/home) */
    private static final Set<String> RESERVED_SLUGS = Set.of("warm", "mine", "groups", "new", "home", "private-test", "submissions");
    /** 올린 아이콘 사진 크기 상한 (화면에서 256px 로 줄여 보낸다) */
    public static final int ICON_MAX_BYTES = 200 * 1024;
    public static final String PRIVATE_TEST_SLUG = "haesongmin-private-test";
    public static final String PRIVATE_TEST_NAME = "헤송민의 소로우";
    public static final int PRIVATE_TEST_CAPACITY = 4;
    public static final String MASK = "○○";

    /** A private test circle has no administrator, keeper or author exception. */
    public static boolean canAccessPrivate(boolean privateTest, boolean registeredAndUnblocked, boolean allowlisted) {
        return !privateTest || registeredAndUnblocked && allowlisted;
    }

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
        return SLUG.matcher(s).matches() && !RESERVED_SLUGS.contains(s) ? s : null;
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
