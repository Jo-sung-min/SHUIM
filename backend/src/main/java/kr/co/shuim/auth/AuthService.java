package kr.co.shuim.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.common.Ids;
import kr.co.shuim.community.CommunityLogic;
import kr.co.shuim.config.ApiException;
import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 세션 인증. 쿠키(shuim_session)에 토큰을 두고 DB(auth_sessions)에는 SHA-256 해시만 저장.
 * 비밀번호는 Node 시절과 같은 scrypt(N=16384, r=8, p=1, 64바이트, 소금은 hex 문자열 그대로)라 기존 계정이 그대로 로그인된다.
 */
@Service
public class AuthService {
    public static final String COOKIE = "shuim_session";
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final JdbcClient jdbc;
    private final boolean secureCookie;
    private final Duration ttl;

    public AuthService(JdbcClient jdbc,
                       @Value("${app.auth.secure-cookie:false}") boolean secureCookie,
                       @Value("${app.auth.session-days:90}") long sessionDays) {
        this.jdbc = jdbc;
        this.secureCookie = secureCookie;
        this.ttl = Duration.ofDays(Math.max(1, Math.min(sessionDays, 365)));
    }

    /* ---------- 세션 ---------- */

    private static String cookieToken(HttpServletRequest req) {
        Cookie[] cs = req.getCookies();
        if (cs == null) return null;
        for (Cookie c : cs) if (COOKIE.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) return c.getValue();
        return null;
    }

    private void setSessionCookie(HttpServletResponse res, String userId) {
        String token = Ids.randomHex(32);
        LocalDateTime expires = LocalDateTime.now(ZoneOffset.UTC).plus(ttl);
        jdbc.sql("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .param(sha256(token)).param(userId).param(expires).update();
        ResponseCookie c = ResponseCookie.from(COOKIE, token)
            .httpOnly(true).sameSite("Lax").secure(secureCookie).path("/").maxAge(ttl).build();
        res.addHeader(HttpHeaders.SET_COOKIE, c.toString());
    }

    private void clearSessionCookie(HttpServletResponse res) {
        ResponseCookie c = ResponseCookie.from(COOKIE, "").httpOnly(true).sameSite("Lax").secure(secureCookie).path("/").maxAge(0).build();
        res.addHeader(HttpHeaders.SET_COOKIE, c.toString());
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
        String id = Ids.uid();
        DbUser u = jdbc.sql("INSERT INTO users (id, nick, role, is_anonymous) VALUES (?, ?, 'user', TRUE) RETURNING *")
            .param(id).param(CommunityLogic.randomNick()).query(DbUser.MAPPER).single();
        setSessionCookie(res, id);
        return u;
    }

    /* ---------- 가입 · 로그인 ---------- */

    public static String validateSignup(String email, String nick, String password) {
        if (!EMAIL.matcher(email.strip()).matches()) return "이메일 형식을 확인해요.";
        String n = nick.strip();
        if (n.length() < 2 || n.length() > 12) return "닉네임은 2~12자로 해요.";
        if (password.length() < 6) return "비밀번호는 6자 이상으로 해요.";
        return null;
    }

    /** 가입: 현재 익명 유저가 있으면 그 행을 승격, 아니면 새로 만든다. 비밀번호를 가진 첫 계정이 관리자. */
    @Transactional
    public DbUser signUp(HttpServletRequest req, HttpServletResponse res, String email, String nick, String password) {
        String err = validateSignup(email, nick, password);
        if (err != null) throw ApiException.badRequest(err);
        String e = email.strip().toLowerCase();
        if (jdbc.sql("SELECT count(*) FROM users WHERE email = ?").param(e).query(Long.class).single() > 0) throw ApiException.badRequest("이미 가입한 이메일이에요.");
        boolean firstReal = jdbc.sql("SELECT count(*) FROM users WHERE password_hash IS NOT NULL").query(Long.class).single() == 0;
        String salt = Ids.randomHex(16);
        String hash = hashPassword(password, salt);
        String role = firstReal ? "admin" : "user";
        Optional<DbUser> cur = currentUser(req);
        if (cur.isPresent() && cur.get().anonymous()) {
            return jdbc.sql("UPDATE users SET email = ?, nick = ?, password_hash = ?, password_salt = ?, role = ?, is_anonymous = FALSE WHERE id = ? RETURNING *")
                .param(e).param(nick.strip()).param(hash).param(salt).param(role).param(cur.get().id()).query(DbUser.MAPPER).single();
        }
        DbUser u = jdbc.sql("INSERT INTO users (id, email, nick, password_hash, password_salt, role, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, FALSE) RETURNING *")
            .param(Ids.uid()).param(e).param(nick.strip()).param(hash).param(salt).param(role).query(DbUser.MAPPER).single();
        setSessionCookie(res, u.id());
        return u;
    }

    @Transactional
    public DbUser signIn(HttpServletRequest req, HttpServletResponse res, String email, String password) {
        String e = email.strip().toLowerCase();
        record Row(DbUser user, String hash, String salt) {}
        Optional<Row> row = jdbc.sql("SELECT * FROM users WHERE email = ?").param(e)
            .query((rs, i) -> new Row(DbUser.MAPPER.mapRow(rs, i), rs.getString("password_hash"), rs.getString("password_salt"))).optional();
        if (row.isEmpty() || row.get().hash() == null) throw ApiException.badRequest("가입되지 않은 이메일이에요.");
        String hash = hashPassword(password, row.get().salt());
        if (!MessageDigest.isEqual(hash.getBytes(StandardCharsets.UTF_8), row.get().hash().getBytes(StandardCharsets.UTF_8))) throw ApiException.badRequest("비밀번호가 맞지 않아요.");
        signOut(req, res);
        setSessionCookie(res, row.get().user().id());
        return row.get().user();
    }

    @Transactional
    public void signOut(HttpServletRequest req, HttpServletResponse res) {
        String token = cookieToken(req);
        if (token != null) jdbc.sql("DELETE FROM auth_sessions WHERE token_hash = ?").param(sha256(token)).update();
        clearSessionCookie(res);
    }

    public String updateNick(DbUser user, String nick) {
        String n = nick.strip();
        if (n.length() < 2 || n.length() > 12) return "닉네임은 2~12자로 해요.";
        jdbc.sql("UPDATE users SET nick = ? WHERE id = ?").param(n).param(user.id()).update();
        return null;
    }

    /** 관리자 여부. 비밀번호를 가진 계정이 하나도 없으면(순수 데모) 누구나 관리자 화면을 볼 수 있다. */
    public boolean isAdmin(DbUser user) {
        if (user != null && "admin".equals(user.role()) && !user.anonymous()) return true;
        return jdbc.sql("SELECT count(*) FROM users WHERE password_hash IS NOT NULL").query(Long.class).single() == 0;
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
