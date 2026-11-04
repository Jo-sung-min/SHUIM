package kr.co.shuim.quote;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class PhilosophyQuoteServiceTest {
    static PhilosophyQuoteService.Content content(String text, String url, String kind) {
        return new PhilosophyQuoteService.Content(text, "저자", "원문 1장", url, "오늘의 삶", kind);
    }

    @Test
    void contentIsTrimmedAndOnlySupportedEditorialKindsAreAccepted() {
        var c = PhilosophyQuoteService.validate(new PhilosophyQuoteService.Content("  문구  ", " 저자 ", " 1장 ",
            " https://example.org/source#chapter-1 ", " 나만의 주제 ", " paraphrase "));
        assertEquals(new PhilosophyQuoteService.Content("문구", "저자", "1장", "https://example.org/source#chapter-1", "나만의 주제", "paraphrase"), c);
        assertDoesNotThrow(() -> PhilosophyQuoteService.validate(content("문구", "http://example.org", "translation")));
        for (String kind : new String[]{null, "", "quote", "PARAPHRASE"})
            assertEquals(400, assertThrows(ApiException.class, () -> PhilosophyQuoteService.validate(content("문구", "https://example.org", kind))).status());
    }

    @Test
    void allFieldsAreRequiredAndLengthsUseUnicodeCharacters() {
        assertThrows(ApiException.class, () -> PhilosophyQuoteService.validate(null));
        String[] valid = {"문구", "저자", "1장", "https://example.org", "삶", "paraphrase"};
        for (int i = 0; i < valid.length; i++) {
            var fields = valid.clone(); fields[i] = " \t ";
            assertEquals(400, assertThrows(ApiException.class, () -> PhilosophyQuoteService.validate(
                new PhilosophyQuoteService.Content(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5]))).status());
        }
        int[] maximum = {600, 100, 300, 2048, 60};
        for (int i = 0; i < maximum.length; i++) {
            var fields = valid.clone(); fields[i] = "가".repeat(maximum[i] + 1);
            assertThrows(ApiException.class, () -> PhilosophyQuoteService.validate(
                new PhilosophyQuoteService.Content(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5])));
        }
        assertDoesNotThrow(() -> PhilosophyQuoteService.validate(content("🌱".repeat(600), "https://example.org", "paraphrase")));
        assertThrows(ApiException.class, () -> PhilosophyQuoteService.validate(content("문구\u0000", "https://example.org", "paraphrase")));
    }

    @Test
    void sourceUrlsRejectExecutableRelativeMalformedAndCredentialBearingValues() {
        for (String url : new String[]{"javascript:alert(1)", "data:text/plain,hi", "/source", "//example.org", "https:///missing", "https://a b.org", "https://name:secret@example.org"})
            assertEquals(400, assertThrows(ApiException.class, () -> PhilosophyQuoteService.validate(content("문구", url, "paraphrase"))).status());
    }

    @Test
    void lookupFailureIsOptionalForAiButVisibleToTheAdminApi() {
        JdbcClient jdbc = mock(JdbcClient.class);
        when(jdbc.sql(anyString())).thenThrow(new DataAccessResourceFailureException("test database unavailable"));
        var service = new PhilosophyQuoteService(jdbc);
        assertTrue(service.randomApproved().isEmpty());
        assertThrows(DataAccessResourceFailureException.class, service::list);
    }

    @Test
    void reviewNeedsAnActorAndTheVersionThatWasActuallyViewed() {
        JdbcClient jdbc = mock(JdbcClient.class);
        var service = new PhilosophyQuoteService(jdbc);
        assertEquals(403, assertThrows(ApiException.class, () -> service.setUsage("id", true, null, 1L)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.setUsage("id", true, "admin", null)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.setUsage("id", true, "admin", -1L)).status());
        verifyNoInteractions(jdbc);
    }

    @Test
    void springUsesTheProductionConstructorWithTheOptionalQuoteDependency() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcClient.class, () -> mock(JdbcClient.class));
            context.register(PhilosophyQuoteService.class);
            context.refresh();
            assertNotNull(context.getBean(PhilosophyQuoteService.class));
        }
    }
}
