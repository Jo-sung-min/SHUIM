package kr.co.shuim.ai;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OpenAiClientTest {
    @Test void sendsResponsesRequestAndCollectsOnlyText() {
        var settings = mock(AiModelSettings.class);
        when(settings.model()).thenReturn(Prompts.DEFAULT_MODEL);
        var mockBuilder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(mockBuilder).build();
        var mockHttpClient = mockBuilder.build();
        var client = new OpenAiClient(mockHttpClient, "test-key", settings);
        server.expect(requestTo("/v1/responses"))
            .andExpect(header("Authorization", "Bearer test-key"))
            .andExpect(jsonPath("$.model").value(Prompts.DEFAULT_MODEL))
            .andExpect(jsonPath("$.store").value(false))
            .andExpect(jsonPath("$.instructions").value("system"))
            .andExpect(jsonPath("$.max_output_tokens").value(5000))
            .andRespond(withSuccess("""
                {"status":"completed","output":[
                  {"type":"reasoning","summary":[]},
                  {"type":"message","content":[{"type":"output_text","text":"hello"},{"type":"output_text","text":"world"}]}]}
                """, MediaType.APPLICATION_JSON));
        assertEquals(Prompts.DEFAULT_MODEL, client.resolveModel("gpt-6-astra"));
        assertEquals("hello\nworld", client.complete(Prompts.DEFAULT_MODEL, 5000, "system", "user"));
        server.verify();
    }

    @Test void missingKeyAndUnsupportedModelAreHandled() {
        var client = new OpenAiClient(mock(RestClient.class), " ", mock(AiModelSettings.class));
        assertFalse(client.configured());
        assertThrows(IllegalArgumentException.class, () -> client.complete("invalid", 500, "", ""));
    }

    @Test void incompleteAndEmptyResponsesFailForCallerFallback() {
        for (String body : new String[]{"{\"status\":\"incomplete\",\"output\":[]}", "{\"status\":\"completed\",\"output\":[]}"}) {
            var builder = RestClient.builder();
            var server = MockRestServiceServer.bindTo(builder).build();
            var client = new OpenAiClient(builder.build(), "test", mock(AiModelSettings.class));
            server.expect(requestTo("/v1/responses")).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            assertThrows(IllegalStateException.class, () -> client.complete(Prompts.DEFAULT_MODEL, 500, "", ""));
            server.verify();
        }
    }
}
