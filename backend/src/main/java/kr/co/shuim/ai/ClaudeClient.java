package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Anthropic Messages API 호출. 키가 없으면 configured() 가 false 이고, 호출자는 규칙 기반 대체 결과를 쓴다 */
@Service
public class ClaudeClient {
    private final RestClient client;
    private final String apiKey;
    private final String defaultModel;

    public ClaudeClient(RestClient.Builder builder,
                        @Value("${app.ai.base-url:https://api.anthropic.com}") String baseUrl,
                        @Value("${app.ai.api-key:}") String apiKey,
                        @Value("${app.ai.model:claude-haiku-5-5}") String model) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        factory.setReadTimeout(Duration.ofSeconds(120));
        this.client = builder.baseUrl(baseUrl.replaceAll("/+$", "")).requestFactory(factory).build();
        this.apiKey = apiKey == null ? "" : apiKey.strip();
        this.defaultModel = Prompts.isAllowedModel(model) ? model : Prompts.DEFAULT_MODEL;
    }

    public boolean configured() { return !apiKey.isBlank(); }

    /** 관리자가 고른 모델이 허용 목록에 있으면 그것, 아니면 환경변수 모델, 아니면 기본 */
    public String resolveModel(String requested) {
        return Prompts.isAllowedModel(requested) ? requested : defaultModel;
    }

    /** 응답의 text 블록을 이어 붙여 돌려준다 */
    public String complete(String model, int maxTokens, String system, String user) {
        JsonNode res = client.post().uri("/v1/messages")
            .header("x-api-key", apiKey)
            .header("anthropic-version", "2023-06-01")
            .contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("model", model, "max_tokens", maxTokens, "system", system, "messages", List.of(Map.of("role", "user", "content", user))))
            .retrieve()
            .body(JsonNode.class);
        StringBuilder sb = new StringBuilder();
        if (res != null && res.has("content")) {
            for (JsonNode b : res.get("content")) {
                if ("text".equals(b.path("type").asText())) {
                    if (!sb.isEmpty()) sb.append('\n');
                    sb.append(b.path("text").asText());
                }
            }
        }
        return sb.toString();
    }
}
