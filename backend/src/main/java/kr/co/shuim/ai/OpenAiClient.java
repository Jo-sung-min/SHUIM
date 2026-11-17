package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.JsonNode;
import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Server-only OpenAI Responses API client. Missing keys retain local fallbacks. */
@Service
public class OpenAiClient {
    static final int DEFAULT_MAX_CONCURRENT = 4;
    static final long DEFAULT_ACQUIRE_MS = 2000;

    private final RestClient client;
    private final String apiKey;
    private final AiModelSettings settings;
    /*
     * 동시에 OpenAI 를 기다리는 요청 수 상한. 백엔드 인스턴스가 하나라 메모리 Semaphore 로 충분하다.
     * 자리가 나지 않으면 잠깐만 기다리고 503 으로 돌려보내 Tomcat 스레드·DB 연결이 묶이지 않게 한다
     */
    private final Semaphore slots;
    private final long acquireMs;
    /** safety_identifier 를 만드는 서버 비밀값 (비어 있으면 API 키로 대신한다) */
    private final String safetySalt;
    private final boolean sendSafetyIdentifier;

    @Autowired
    public OpenAiClient(RestClient.Builder builder,
                        @Value("${app.ai.base-url:https://api.openai.com}") String baseUrl,
                        @Value("${app.ai.api-key:}") String apiKey,
                        AiModelSettings settings,
                        @Value("${app.ai.max-concurrent:4}") int maxConcurrent,
                        @Value("${app.ai.acquire-timeout-ms:2000}") long acquireMs,
                        @Value("${app.ai.connect-timeout-seconds:5}") int connectTimeoutSeconds,
                        @Value("${app.ai.read-timeout-seconds:90}") int readTimeoutSeconds,
                        @Value("${app.ai.safety-salt:}") String safetySalt,
                        @Value("${app.ai.safety-identifier:true}") boolean sendSafetyIdentifier) {
        this(buildClient(builder, baseUrl, connectTimeoutSeconds, readTimeoutSeconds), apiKey, settings,
            maxConcurrent, acquireMs, safetySalt, sendSafetyIdentifier);
    }

    OpenAiClient(RestClient client, String apiKey, AiModelSettings settings) {
        this(client, apiKey, settings, DEFAULT_MAX_CONCURRENT, DEFAULT_ACQUIRE_MS, "", true);
    }

    OpenAiClient(RestClient client, String apiKey, AiModelSettings settings, int maxConcurrent, long acquireMs,
                 String safetySalt, boolean sendSafetyIdentifier) {
        this.client = client;
        this.apiKey = apiKey == null ? "" : apiKey.strip();
        this.settings = settings;
        this.slots = new Semaphore(Math.max(1, maxConcurrent), true);
        this.acquireMs = Math.max(0, acquireMs);
        this.safetySalt = safetySalt == null ? "" : safetySalt.strip();
        this.sendSafetyIdentifier = sendSafetyIdentifier;
    }

    private static RestClient buildClient(RestClient.Builder builder, String baseUrl, int connectSeconds, int readSeconds) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(Math.max(1, connectSeconds))).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(Math.max(1, readSeconds)));
        return builder.baseUrl(baseUrl.replaceAll("/+$", "")).requestFactory(factory).build();
    }

    public boolean configured() { return !apiKey.isBlank(); }

    /** Ignore old browser overrides: only administrators may select the shared model. */
    public String resolveModel(String ignored) { return settings.model(); }

    public String complete(String model, int maxTokens, String system, String user) {
        return complete(model, maxTokens, system, user, null);
    }

    /** userId 가 있으면 되돌릴 수 없는 가명 식별자를 safety_identifier 로 함께 보낸다 (남용 추적용, 조직 전체 제재 방지) */
    public String complete(String model, int maxTokens, String system, String user, String userId) {
        if (!Prompts.isAllowedModel(model)) throw new IllegalArgumentException("Unsupported AI model");
        boolean acquired;
        try {
            acquired = slots.tryAcquire(acquireMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            acquired = false;
        }
        if (!acquired) throw ApiException.unavailable(AiQuota.BUSY_MESSAGE);
        try {
            return send(model, maxTokens, system, user, userId);
        } finally {
            slots.release();
        }
    }

    private String send(String model, int maxTokens, String system, String user, String userId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("max_output_tokens", maxTokens);
        body.put("instructions", system);
        body.put("input", user);
        body.put("store", false);
        body.put("reasoning", Map.of("effort", "low"));
        String safetyId = sendSafetyIdentifier ? safetyIdentifier(userId) : null;
        if (safetyId != null) body.put("safety_identifier", safetyId);
        JsonNode res = client.post().uri("/v1/responses")
            .headers(headers -> headers.setBearerAuth(apiKey))
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve().body(JsonNode.class);
        if (res == null || !"completed".equals(res.path("status").asText()))
            throw new IllegalStateException("OpenAI response was not completed");
        StringBuilder text = new StringBuilder();
        for (JsonNode item : res.path("output")) {
            if (!"message".equals(item.path("type").asText())) continue;
            for (JsonNode content : item.path("content")) {
                if ("refusal".equals(content.path("type").asText()))
                    throw new IllegalStateException("OpenAI response refused");
                if ("output_text".equals(content.path("type").asText())) {
                    if (!text.isEmpty()) text.append('\n');
                    text.append(content.path("text").asText());
                }
            }
        }
        if (text.toString().isBlank()) throw new IllegalStateException("OpenAI returned no text");
        return text.toString();
    }

    /** HMAC-SHA256(서버 비밀값, 사용자 id) 의 앞 32자리 hex. 사용자가 없으면 null */
    String safetyIdentifier(String userId) {
        if (userId == null || userId.isBlank()) return null;
        String key = safetySalt.isEmpty() ? apiKey : safetySalt;
        if (key.isEmpty()) return null;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(("sorow-ai:" + userId).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, 32);
        } catch (java.security.GeneralSecurityException e) {
            return null;
        }
    }
}
