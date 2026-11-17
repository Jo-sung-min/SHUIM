package kr.co.shuim.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 계정을 지우면 카카오 쪽 앱 연결도 끊는다 (POST kapi.kakao.com/v1/user/unlink, 어드민 키).
 * KAKAO_ADMIN_KEY(app.kakao.admin-key) 가 비어 있으면 아무것도 하지 않는다. 최선 노력: 실패해도 삭제는 그대로이고, 키는 로그에 남기지 않는다.
 */
@Component
public class KakaoUnlinkClient {
    private static final Logger log = LoggerFactory.getLogger(KakaoUnlinkClient.class);
    static final String UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";

    private final String adminKey;
    private final RestClient http;

    public KakaoUnlinkClient(RestClient.Builder builder, @Value("${app.kakao.admin-key:}") String adminKey) {
        this.adminKey = adminKey == null ? "" : adminKey.strip();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.http = builder.requestFactory(factory).build();
    }

    public boolean configured() { return !adminKey.isBlank(); }

    /** 삭제 트랜잭션이 끝난 뒤 따로 부른다 (DB 연결을 잡은 채 외부 요청을 기다리지 않게 가상 스레드에서) */
    public void unlinkLater(String kakaoId) {
        if (!configured() || kakaoId == null || kakaoId.isBlank()) return;
        Thread.ofVirtual().name("kakao-unlink").start(() -> unlink(kakaoId));
    }

    void unlink(String kakaoId) {
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("target_id_type", "user_id");
            form.add("target_id", kakaoId);
            http.post().uri(UNLINK_URL)
                .header("Authorization", "KakaoAK " + adminKey)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().toBodilessEntity();
        } catch (RuntimeException e) {
            // 회원번호·키는 남기지 않는다
            log.warn("kakao unlink failed ({})", e.getClass().getSimpleName());
        }
    }
}
