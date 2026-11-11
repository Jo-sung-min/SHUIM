package kr.co.shuim.ai;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AiModelSettingsTest {
    @Test void savedModelWinsAndInvalidOrMissingValuesUseTerra() {
        var jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        when(jdbc.sql(anyString()).query(String.class).optional()).thenReturn(Optional.empty(), Optional.of("gpt-6.1-sol"), Optional.of("claude-old"));
        var settings = new AiModelSettings(jdbc, "invalid");
        assertEquals("gpt-6.1-terra", settings.model());
        assertEquals("gpt-6.1-sol", settings.model());
        assertEquals("gpt-6.1-terra", settings.model());
    }

    @Test void unsupportedSelectionDoesNotWrite() {
        var jdbc = mock(JdbcClient.class);
        var settings = new AiModelSettings(jdbc, Prompts.DEFAULT_MODEL);
        assertThrows(ApiException.class, () -> settings.save("claude-old"));
        assertThrows(ApiException.class, () -> settings.save(null));
        verifyNoInteractions(jdbc);
    }
}
