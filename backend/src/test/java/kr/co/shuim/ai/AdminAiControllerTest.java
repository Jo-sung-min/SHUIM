package kr.co.shuim.ai;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminAiControllerTest {
    @Test void readAndWriteRequireAdministrator() {
        var auth = mock(AuthService.class);
        var settings = mock(AiModelSettings.class);
        var client = mock(OpenAiClient.class);
        var controller = new AdminAiController(auth, settings, client);
        var request = new MockHttpServletRequest();
        assertEquals(403, assertThrows(ApiException.class, () -> controller.get(request)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.update(new AdminAiController.ModelBody(Prompts.DEFAULT_MODEL), request)).status());
        verifyNoInteractions(settings, client);
    }

    @Test void administratorPersistsModelAndReceivesNoSecrets() {
        var auth = mock(AuthService.class);
        when(auth.isAdmin(any())).thenReturn(true);
        var settings = mock(AiModelSettings.class);
        when(settings.model()).thenReturn("gpt-6.1-sol");
        var client = mock(OpenAiClient.class);
        when(client.configured()).thenReturn(true);
        var result = new AdminAiController(auth, settings, client).update(
            new AdminAiController.ModelBody("gpt-6.1-sol"), new MockHttpServletRequest());
        verify(settings).save("gpt-6.1-sol");
        assertEquals(java.util.Map.of("model", "gpt-6.1-sol", "configured", true), result.getBody());
        assertEquals("no-store", result.getHeaders().getCacheControl());
    }
}
