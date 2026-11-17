package kr.co.shuim.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.common.Ids;
import kr.co.shuim.community.CommunityLogic;
import kr.co.shuim.config.ApiException;
import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * 세션 인증. 쿠키(shuim_session)에 토큰을 두고 DB(auth_sessions)에는 SHA-256 해시만 저장.
 * 앱인토스 미니앱은 출처가 달라(*.tossmini.com) 쿠키를 못 쓰므로 X-Session-Transport: bearer 를 보낸다.
 * 그러면 세션을 만들거나 지울 때 X-Session-Token 응답 헤더로 토큰을 주고, 이후 Authorization: Bearer 로 받는다.
 * 비밀번호는 Node 시절과 같은 scrypt(N=16384, r=8, p=1, 64바이트, 소금은 hex 문자열 그대로)라 기존 계정이 그대로 로그인된다.
 * scrypt 는 DB 연결을 잡지 않은 채 계산하고(풀이 3개뿐이라), 동시에 도는 수도 묶는다.
 */
@Service
public class AuthService {
    public static final String COOKIE = "shuim_session";
    public static final String TRANSPORT_HEADER = "X-Session-Transport";
    public static final String TOKEN_HEADER = "X-Session-Token";
    /** 로그인 실패는 이유(없는 이메일·틀린 비밀번호·카카오 계정)와 관계없이 같은 문구로 답해 가입 여부를 드러내지 않는다 */
    public static final String LOGIN_FAILED = "이메일 또는 비밀번호가 맞지 않아요. 카카오로 가입했다면 카카오로 시작하기를 눌러 주세요.";
    static final String LOGIN_THROTTLED = "로그인 시도가 너무 많아요. 15분쯤 뒤에 다시 시도해 주세요.";
    static final int MAX_EMAIL = 254;
    static final int MAX_PASSWORD = 128;
    /** 예전 계정의 긴 비밀번호도 로그인은 되게 넉넉히 두되, 해시에 넘기는 길이는 묶는다 */
    private static final int MAX_LOGIN_PASSWORD = 1024;
    /** 이메일별 실패 제한: 15분에 10번 틀리면 429. 인스턴스가 하나라 메모리 카운터로 충분하다 (여러 대가 되면 DB 로 옮긴다) */
    static final int LOGIN_MAX_FAILURES = 10;
    static final long LOGIN_WINDOW_MS = TimeUnit.MINUTES.toMillis(15);
    private static final int FAILURE_MAP_LIMIT = 50_000;
    /** scrypt 한 번이 16MiB·수십 ms 라 동시에 도는 수를 묶는다 (단일 인스턴스 기준) */
    private static final Semaphore HASH_SLOTS = new Semaphore(4);
    /** 없는 이메일·비밀번호 없는 계정에도 같은 비용의 해시를 돌려 응답 시간으로 가입 여부를 알 수 없게 한다 */
    private static final String DUMMY_SALT = "00000000000000000000000000000000";
    /** 운영진으로 오해할 수 있는 말 (글자·숫자만 남겨 소문자로 바꾼 뒤 포함 여부로 본다) */
    private static final List<String> RESERVED_NICK_WORDS = List.of(
        "운영자", "운영진", "운영팀", "관리자", "관리팀", "소로우팀", "소로우공식", "소로우운영", "공식", "고객센터",
        "admin", "official", "sorow", "staff", "moderator");

    private final JdbcClient jdbc;
    private final boolean secureCookie;
    private final Duration ttl;
    /** 이메일 → {실패 수, 창 시작 ms} */
    private final ConcurrentHashMap<String, long[]> loginFailures = new ConcurrentHashMap<>();
    /** 있으면 가입·로그인의 DB 쓰기를 짧은 트랜잭션으로 묶는다 (해시는 그 밖에서 계산) */
    private TransactionTemplate tx;

    public AuthService(JdbcClient jdbc,
                       @Value("${app.auth.secure-cookie:true}") boolean secureCookie,
                       @Value("${app.auth.session-days:90}") long sessionDays) {
        this.jdbc = jdbc;
        this.secureCookie = secureCookie;
        this.ttl = Duration.ofDays(Math.max(1, Math.min(sessionDays, 365)));
    }

    @Autowired(required = false)
    public void setTransactionTemplate(TransactionTemplate tx) { this.tx = tx; }

    /** 있으면 익명 계정을 새로 만들 때마다 IP 별·전체 한도를 확인한다 (쿠키를 꾸며 필터 한도를 비켜 가는 것 막기) */
    private AnonymousCreationGuard anonGuard;

    @Autowired(required = false)
    public void setAnonymousCreationGuard(AnonymousCreationGuard anonGuard) { this.anonGuard = anonGuard; }

    private <T> T inTx(Supplier<T> work) {
        return tx == null ? work.get() : tx.execute(status -> work.get());
    }

    /* ---------- 세션 ---------- */

    /** 쿠키가 먼저, 없으면 Authorization: Bearer (미니앱) */
    private static String cookieToken(HttpServletRequest req) {
        Cookie[] cs = req.getCookies();
        if (cs != null) for (Cookie c : cs) if (COOKIE.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) return c.getValue();
        String h = req.getHeader(HttpHeaders.AUTHORIZATION);
        if (h != null && h.regionMatches(true, 0, "Bearer ", 0, 7)) {
            String t = h.substring(7).strip();
            if (t.matches("[0-9a-f]{64}")) return t;
        }
        return null;
    }

    /** 이번 요청이 토큰을 헤더로 받겠다고 했는지. 웹은 보내지 않아 토큰이 스크립트에 드러나지 않는다 */
    private static boolean wantsBearer() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes a)) return false;
        return "bearer".equalsIgnoreCase(a.getRequest().getHeader(TRANSPORT_HEADER));
    }

    /** 세션을 새로 만들고 쿠키를 내려준다 */
    public void issueSession(HttpServletResponse res, String userId) { setSessionCookie(res, userId); }

    /** 다른 유저로 세션을 바꾼다 (카카오 로그인): 지금(익명) 세션 행은 지우고 새 토큰을 발급 */
    @Transactional
    public void switchSession(HttpServletRequest req, HttpServletResponse res, String userId) {
        rotateSession(req, res, userId);
    }

    /** 세션 고정 막기: 요청에 실려 온 세션 행은 지우고 새 토큰을 발급한다 (가입·로그인 때마다) */
    private void rotateSession(HttpServletRequest req, HttpServletResponse res, String userId) {
        String token = cookieToken(req);
        if (token != null) jdbc.sql("DELETE FROM auth_sessions WHERE token_hash = ?").param(sha256(token)).update();
        setSessionCookie(res, userId);
    }

    private void setSessionCookie(HttpServletResponse res, String userId) {
        String token = Ids.randomHex(32);
        LocalDateTime expires = LocalDateTime.now(ZoneOffset.UTC).plus(ttl);
        jdbc.sql("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .param(sha256(token)).param(userId).param(expires).update();
        ResponseCookie c = ResponseCookie.from(COOKIE, token)
            .httpOnly(true).sameSite("Lax").secure(secureCookie).path("/").maxAge(ttl).build();
        res.addHeader(HttpHeaders.SET_COOKIE, c.toString());
        if (wantsBearer()) res.setHeader(TOKEN_HEADER, token);
    }

    private void clearSessionCookie(HttpServletResponse res) {
        ResponseCookie c = ResponseCookie.from(COOKIE, "").httpOnly(true).sameSite("Lax").secure(secureCookie).path("/").maxAge(0).build();
        res.addHeader(HttpHeaders.SET_COOKIE, c.toString());
        if (wantsBearer()) res.setHeader(TOKEN_HEADER, ""); // 빈 값 = 저장한 토큰을 지워라
    }

    /** 쿠키의 세션으로 유저를 찾는다. 없거나 만료면 비어 있음 */
    public Optional<DbUser> currentUser(HttpServletRequest req) {
        String token = cookieToken(req);
        if (token == null) return Optional.empty();
        return jdbc.sql("SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > now()")
            .param(sha256(token)).query(DbUser.MAPPER).optional();
    }

    /** 유저가 없으면 익명 유저를 만들어 세션을 발급한다 (외침 읽기·쓰기에 필요) */
    @Transactional
    public DbUser requireUser(HttpServletRequest req, HttpServletResponse res) {
        Optional<DbUser> cur = currentUser(req);
        if (cur.isPresent()) return cur.get();
        if (anonGuard != null) anonGuard.check(req);
        String id = Ids.uid();
        DbUser u = jdbc.sql("INSERT INTO users (id, nick, role, is_anonymous) VALUES (?, ?, 'user', TRUE) RETURNING *")
            .param(id).param(CommunityLogic.randomNick()).query(DbUser.MAPPER).single();
        setSessionCookie(res, id);
        return u;
    }

    /* ---------- 가입 · 로그인 ---------- */

    public static String validateSignup(String email, String nick, String password) {
        // 형식 검사보다 길이를 먼저 본다 (긴 입력으로 CPU 를 묶지 못하게)
        if (email == null || nick == null || password == null) return "입력값을 확인해 주세요.";
        if (email.length() > MAX_EMAIL || !validEmail(email.strip())) return "이메일 형식을 확인해요.";
        String nickErr = nickError(nick);
        if (nickErr != null) return nickErr;
        if (password.length() < 6) return "비밀번호는 6자 이상으로 해요.";
        if (password.length() > MAX_PASSWORD) return "비밀번호는 128자 이하로 해요.";
        return null;
    }

    /** 정규식 없이 선형 시간으로 본다: 공백 없음, @ 는 하나이고 앞이 비지 않음, @ 뒤 도메인의 처음·끝이 아닌 곳에 점 (예전 정규식과 같은 뜻) */
    static boolean validEmail(String e) {
        if (e == null || e.isEmpty() || e.length() > MAX_EMAIL) return false;
        for (int i = 0; i < e.length(); i++) if (Character.isWhitespace(e.charAt(i))) return false;
        int at = e.indexOf('@');
        if (at <= 0 || at != e.lastIndexOf('@')) return false;
        String domain = e.substring(at + 1);
        int dot = domain.indexOf('.', 1);
        return dot > 0 && dot < domain.length() - 1;
    }

    /** 닉네임 규칙: 앞뒤 공백을 뺀 2~12자, 보이지 않는 문자·방향 바꾸기 문자 금지, 운영진처럼 보이는 말 금지. 괜찮으면 null */
    public static String nickError(String nick) {
        if (nick == null) return "닉네임은 2~12자로 해요.";
        String n = nick.strip();
        if (n.length() < 2 || n.length() > 12) return "닉네임은 2~12자로 해요.";
        StringBuilder key = new StringBuilder();
        for (int i = 0; i < n.length(); ) {
            int cp = n.codePointAt(i);
            int type = Character.getType(cp);
            // CONTROL·FORMAT 에 제로폭 문자(U+200B~200F, 2060, FEFF)와 방향 바꾸기(U+202A~202E, 2066~2069)가 들어 있다
            if (type == Character.CONTROL || type == Character.FORMAT || type == Character.SURROGATE || type == Character.PRIVATE_USE
                || type == Character.UNASSIGNED || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR
                || cp == 0x115F || cp == 0x1160 || cp == 0x3164 || cp == 0xFFA0 || cp == 0x2800) { // 한글 채움 문자·점자 공백 (빈 닉네임처럼 보임)
                return "닉네임에 쓸 수 없는 문자가 들어 있어요.";
            }
            if (Character.isLetterOrDigit(cp)) key.appendCodePoint(Character.toLowerCase(cp));
            i += Character.charCount(cp);
        }
        String k = key.toString().toLowerCase(Locale.ROOT);
        for (String w : RESERVED_NICK_WORDS) if (k.contains(w)) return "운영진으로 오해할 수 있는 닉네임은 쓸 수 없어요.";
        return null;
    }

    /** 가입: 현재 익명 유저가 있으면 그 행을 승격, 아니면 새로 만든다. 관리자는 운영자가 별도로 지정한다. */
    public DbUser signUp(HttpServletRequest req, HttpServletResponse res, String email, String nick, String password) {
        return signUp(req, res, email, nick, password, null);
    }

    /**
     * 가입. 비밀번호 해시는 DB 연결을 잡기 전에 계산하고, 계정 쓰기·세션 교체·afterInsert(동의 저장)만 한 트랜잭션으로 묶는다.
     * afterInsert 가 실패하면 계정과 세션 모두 되돌린다.
     */
    public DbUser signUp(HttpServletRequest req, HttpServletResponse res, String email, String nick, String password, Consumer<DbUser> afterInsert) {
        String err = validateSignup(email, nick, password);
        if (err != null) throw ApiException.badRequest(err);
        String e = email.strip().toLowerCase(Locale.ROOT);
        String n = nick.strip();
        if (emailTaken(e)) throw ApiException.badRequest("이미 가입한 이메일이에요.");
        String salt = Ids.randomHex(16);
        String hash = boundedHash(password, salt);
        return inTx(() -> {
            String role = "user";
            Optional<DbUser> cur = currentUser(req);
            DbUser u;
            if (cur.isPresent() && cur.get().anonymous()) {
                u = jdbc.sql("UPDATE users SET email = ?, nick = ?, password_hash = ?, password_salt = ?, role = ?, is_anonymous = FALSE, registered_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE id = ? RETURNING *")
                    .param(e).param(n).param(hash).param(salt).param(role).param(cur.get().id()).query(DbUser.MAPPER).single();
            } else {
                u = jdbc.sql("INSERT INTO users (id, email, nick, password_hash, password_salt, role, is_anonymous, registered_at) VALUES (?, ?, ?, ?, ?, ?, FALSE, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) RETURNING *")
                    .param(Ids.uid()).param(e).param(n).param(hash).param(salt).param(role).query(DbUser.MAPPER).single();
            }
            // 익명 세션 토큰을 가입 계정에 그대로 쓰지 않고 새 토큰으로 바꾼다 (세션 고정 막기)
            rotateSession(req, res, u.id());
            if (afterInsert != null) afterInsert.accept(u);
            return u;
        });
    }

    private boolean emailTaken(String e) {
        return jdbc.sql("SELECT count(*) FROM users WHERE email = ?").param(e).query(Long.class).single() > 0;
    }

    /** 로그인: 짧은 조회 → DB 연결 없이 해시 비교 → 짧은 트랜잭션으로 세션 교체 */
    public DbUser signIn(HttpServletRequest req, HttpServletResponse res, String email, String password) {
        if (email == null || password == null || email.length() > MAX_EMAIL || password.length() > MAX_LOGIN_PASSWORD) {
            throw ApiException.badRequest(LOGIN_FAILED);
        }
        String e = email.strip().toLowerCase(Locale.ROOT);
        checkLoginThrottle(e);
        record Row(DbUser user, String hash, String salt) {}
        Optional<Row> row = e.isEmpty() ? Optional.empty() : jdbc.sql("SELECT * FROM users WHERE email = ?").param(e)
            .query((rs, i) -> new Row(DbUser.MAPPER.mapRow(rs, i), rs.getString("password_hash"), rs.getString("password_salt"))).optional();
        // 카카오·토스로 만든 계정은 비밀번호가 없다 (password_hash NULL). 없는 이메일과 똑같이 다룬다
        boolean hasPassword = row.isPresent() && row.get().hash() != null && row.get().salt() != null;
        String computed = boundedHash(password, hasPassword ? row.get().salt() : DUMMY_SALT);
        if (!hasPassword || !MessageDigest.isEqual(computed.getBytes(StandardCharsets.UTF_8), row.get().hash().getBytes(StandardCharsets.UTF_8))) {
            recordLoginFailure(e);
            throw ApiException.badRequest(LOGIN_FAILED);
        }
        loginFailures.remove(e);
        DbUser user = row.get().user();
        inTx(() -> { rotateSession(req, res, user.id()); return null; });
        return user;
    }

    /* ---------- 로그인 실패 제한 (이메일별, 메모리) ---------- */

    private void checkLoginThrottle(String email) {
        long[] w = loginFailures.get(email);
        if (w == null) return;
        long now = System.currentTimeMillis();
        synchronized (w) {
            if (now - w[1] < LOGIN_WINDOW_MS && w[0] >= LOGIN_MAX_FAILURES) throw new ApiException(429, LOGIN_THROTTLED);
        }
    }

    private void recordLoginFailure(String email) {
        long now = System.currentTimeMillis();
        if (loginFailures.size() >= FAILURE_MAP_LIMIT) {
            loginFailures.entrySet().removeIf(en -> now - en.getValue()[1] >= LOGIN_WINDOW_MS);
            if (loginFailures.size() >= FAILURE_MAP_LIMIT) loginFailures.clear(); // 그래도 넘치면 메모리를 먼저 지킨다
        }
        long[] w = loginFailures.computeIfAbsent(email, k -> new long[]{0, now});
        synchronized (w) {
            if (now - w[1] >= LOGIN_WINDOW_MS) { w[0] = 0; w[1] = now; }
            w[0]++;
        }
    }

    /** 동시에 도는 scrypt 수를 묶는다. 3초 안에 자리가 나지 않으면 503 */
    static String boundedHash(String password, String saltHex) {
        boolean acquired;
        try {
            acquired = HASH_SLOTS.tryAcquire(3, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            acquired = false;
        }
        if (!acquired) throw ApiException.unavailable("잠시 후 다시 시도해 주세요.");
        try {
            return hashPassword(password, saltHex);
        } finally {
            HASH_SLOTS.release();
        }
    }

    @Transactional
    public void signOut(HttpServletRequest req, HttpServletResponse res) {
        String token = cookieToken(req);
        if (token != null) jdbc.sql("DELETE FROM auth_sessions WHERE token_hash = ?").param(sha256(token)).update();
        clearSessionCookie(res);
    }

    public String updateNick(DbUser user, String nick) {
        String err = nickError(nick);
        if (err != null) return err;
        jdbc.sql("UPDATE users SET nick = ? WHERE id = ?").param(nick.strip()).param(user.id()).update();
        return null;
    }

    /** 공개 가입이나 계정 수와 관계없이 명시적으로 부여된 관리자 권한만 인정한다. */
    public boolean isAdmin(DbUser user) {
        return user != null && "admin".equals(user.role()) && !user.anonymous() && !user.blocked();
    }

    /* ---------- 해시 ---------- */

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Node 의 crypto.scryptSync(pw, saltHex, 64) 와 같은 결과 (소금은 hex 문자열의 바이트를 그대로 씀) */
    static String hashPassword(String password, String saltHex) {
        byte[] out = SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), saltHex.getBytes(StandardCharsets.UTF_8), 16384, 8, 1, 64);
        return HexFormat.of().formatHex(out);
    }
}
