package kr.co.shuim.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 기동할 때 운영 DB 를 보는데 설정이 개발값으로 남아 있으면 WARN 으로 크게 알린다 (INFRA-05·AUTH-14).
 * 기동을 막지는 않는다. 운영 환경 속성 목록은 backend/.env.example 참고.
 */
@Component
public class StartupSafetyCheck {
    private static final Logger log = LoggerFactory.getLogger(StartupSafetyCheck.class);

    private final Environment env;
    @Value("${app.db.url:}") private String dbUrl;
    @Value("${app.origin:}") private String origin;
    @Value("${app.allowed-origins:}") private String allowedOrigins;
    @Value("${app.auth.secure-cookie:true}") private boolean secureCookie;
    @Value("${app.community.simulate:false}") private boolean simulate;
    @Value("${app.security.origin-secret:}") private String originSecret;

    public StartupSafetyCheck(Environment env) { this.env = env; }

    @EventListener(ApplicationReadyEvent.class)
    public void check() {
        List<String> w = warnings(dbUrl, origin, allowedOrigins, secureCookie, simulate,
            Arrays.asList(env.getActiveProfiles()).contains("prod"), originSecret != null && !originSecret.isBlank());
        for (String s : w) log.warn("[운영 설정 확인] {}", s);
    }

    static List<String> warnings(String dbUrl, String origin, String allowedOrigins, boolean secureCookie, boolean simulate,
                                 boolean prodProfile, boolean originSecretSet) {
        List<String> out = new ArrayList<>();
        if (!remoteDb(dbUrl)) return out; // 로컬 DB 면 개발 중이다
        if (local(origin)) out.add("DB 는 원격인데 APP_ORIGIN 이 localhost 예요 (" + origin + "). 카카오 Redirect·CORS 가 운영 주소와 어긋나요.");
        if (allowedOrigins != null && Arrays.stream(allowedOrigins.split(",")).map(String::strip).anyMatch(StartupSafetyCheck::local)) {
            out.add("DB 는 원격인데 APP_ALLOWED_ORIGINS 에 localhost 가 있어요. 운영은 https://www.sorow.co.kr 만 두세요.");
        }
        if (!secureCookie) out.add("DB 는 원격인데 AUTH_SECURE_COOKIE=false 예요. 세션 쿠키에 Secure 가 빠져요.");
        if (simulate && !prodProfile) out.add("DB 는 원격인데 COMMUNITY_SIMULATE=true 예요. 샘플 계정이 실제 글에 자동 답글을 달아요.");
        if (!prodProfile) out.add("DB 는 원격인데 SPRING_PROFILES_ACTIVE=prod 가 아니에요. 소속 인증 코드가 화면에 보일 수 있어요(메일 미설정 시).");
        if (!originSecretSet) log.info("ORIGIN_SHARED_SECRET 이 없어 백엔드 직접 호출을 막지 않아요 (Vercel 과 같은 값을 넣으면 켜져요).");
        return out;
    }

    static boolean local(String origin) {
        if (origin == null || origin.isBlank()) return false;
        try {
            String host = URI.create(origin.strip()).getHost();
            if (host == null) return false;
            host = host.toLowerCase(Locale.ROOT);
            return host.equals("localhost") || host.endsWith(".localhost") || host.startsWith("127.") || host.equals("[::1]");
        } catch (Exception e) {
            return false;
        }
    }

    static boolean remoteDb(String dbUrl) {
        if (dbUrl == null || dbUrl.isBlank()) return false;
        try {
            String u = dbUrl.strip();
            if (u.startsWith("jdbc:")) u = u.substring(5);
            return !DataSourceConfig.isLocalHost(URI.create(u).getHost());
        } catch (Exception e) {
            return false;
        }
    }
}
