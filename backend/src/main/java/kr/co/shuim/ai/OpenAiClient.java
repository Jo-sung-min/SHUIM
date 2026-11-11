package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import java.util.Map;

/** Server-only OpenAI Responses API client. Missing keys retain local fallbacks. */
@Service
public class OpenAiClient {
    private final RestClient client;
    private final String apiKey;
    private final AiModelSettings settings;

    @Autowired
    public OpenAiClient(RestClient.Builder builder,
                        @Value("${app.ai.base-url:https://api.openai.com}") String baseUrl,
                        @Value("${app.ai.api-key:}") String apiKey,
                        AiModelSettings settings) {
        this(buildClient(builder, baseUrl), apiKey, settings);
    }

    OpenAiClient(RestClient client, String apiKey, AiModelSettings settings) {
        this.client = client;
        this.apiKey = apiKey == null ? "" : apiKey.strip();
        this.settings = settings;
    }

    private static RestClient buildClient(RestClient.Builder builder, String baseUrl) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        factory.setReadTimeout(Duration.ofSeconds(120));
        return builder.baseUrl(baseUrl.replaceAll("/+$", "")).requestFactory(factory).build();
    }

    public boolean configured() { return !apiKey.isBlank(); }

    /** Ignore old browser overrides: only administrators may select the shared model. */
    public String resolveModel(String ignored) { return settings.model(); }

    public String complete(String model, int maxTokens, String system, String user) {
        if (!Prompts.isAllowedModel(model)) throw new IllegalArgumentException("Unsupported AI model");
        JsonNode res = client.post().uri("/v1/responses")
            .headers(headers -> headers.setBearerAuth(apiKey))
            .contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("model", model, "max_output_tokens", maxTokens,
                "instructions", system, "input", user, "store", false,
                "reasoning", Map.of("effort", "low")))
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
}
