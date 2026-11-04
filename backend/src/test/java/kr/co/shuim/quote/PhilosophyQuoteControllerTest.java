package kr.co.shuim.quote;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PhilosophyQuoteControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final PhilosophyQuoteService service = mock(PhilosophyQuoteService.class);
    private final PhilosophyQuoteController controller = new PhilosophyQuoteController(auth, service);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private static DbUser user(String role, boolean anonymous, Long blockedAt) {
        return new DbUser("admin-id", null, "관리자", role, anonymous, blockedAt, null, 0);
    }

    @Test
    void readsAndEveryMutationRequireARealUnblockedRegisteredAdministrator() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        for (DbUser user : Arrays.asList(null, user("user", false, null), user("admin", true, null), user("admin", false, 1L))) {
            when(auth.currentUser(request)).thenReturn(Optional.ofNullable(user));
            assertEquals(403, assertThrows(ApiException.class, () -> controller.list(request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.create(null, request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.update("id", null, request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.usage("id", null, request)).status());
        }
        verifyNoInteractions(service);
    }

    @Test
    void adminJsonContractPreservesNullReviewAndSendsTheAuthenticatedReviewer() throws Exception {
        when(auth.currentUser(any())).thenReturn(Optional.of(user("admin", false, null)));
        when(auth.isAdmin(any())).thenCallRealMethod();
        var quote = new PhilosophyQuoteService.Quote("quote-id", "문구", "저자", "원문 1장", "https://example.org/source", "삶", "paraphrase", false, null, 100, 100);
        when(service.list()).thenReturn(List.of(quote));
        when(service.create(any())).thenReturn(quote);
        when(service.update(eq("quote-id"), any())).thenReturn(quote);
        when(service.setUsage("quote-id", true, "admin-id", 100L)).thenReturn(quote);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String listing = mvc.perform(get("/api/admin/quotes")).andExpect(status().isOk())
            .andExpect(jsonPath("$.quotes[0].sourceUrl").value("https://example.org/source"))
            .andExpect(jsonPath("$.quotes[0].enabled").value(false)).andReturn().getResponse().getContentAsString();
        var tree = new com.fasterxml.jackson.databind.ObjectMapper().readTree(listing).path("quotes").get(0);
        assertTrue(tree.has("reviewedAt") && tree.get("reviewedAt").isNull());
        String body = "{\"text\":\"문구\",\"author\":\"저자\",\"source\":\"원문 1장\",\"sourceUrl\":\"https://example.org/source\",\"theme\":\"삶\",\"kind\":\"paraphrase\"}";
        mvc.perform(post("/api/admin/quotes").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.quote.id").value("quote-id"));
        mvc.perform(put("/api/admin/quotes/quote-id").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
        mvc.perform(patch("/api/admin/quotes/quote-id/usage").contentType(MediaType.APPLICATION_JSON)
            .content("{\"enabled\":true,\"expectedUpdatedAt\":100,\"reviewedBy\":\"forged-id\"}"))
            .andExpect(status().isOk());
        verify(service).setUsage("quote-id", true, "admin-id", 100L);
    }

    @Test
    void usageOnlyAcceptsJsonBooleans() throws Exception {
        when(auth.currentUser(any())).thenReturn(Optional.of(user("admin", false, null)));
        when(auth.isAdmin(any())).thenCallRealMethod();
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String enabled : List.of("null", "\"true\"", "1", "{}", "[]"))
            mvc.perform(patch("/api/admin/quotes/id/usage").contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":" + enabled + ",\"expectedUpdatedAt\":100}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").isString());
        verifyNoInteractions(service);
    }
}
