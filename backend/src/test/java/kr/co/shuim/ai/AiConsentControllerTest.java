package kr.co.shuim.ai;

import kr.co.shuim.auth.PolicyConsentService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiConsentControllerTest {
    @Test
    void missingConsentBlocksBothAiEndpointsBeforeAnyProcessing() {
        TodayService today = mock(TodayService.class);
        SummarizeService summarize = mock(SummarizeService.class);
        PolicyConsentService policies = mock(PolicyConsentService.class);
        MockHttpServletRequest request = new MockHttpServletRequest();
        doThrow(ApiException.forbidden("동의 필요")).when(policies).requireAiConsent(request);
        AiController controller = new AiController(today, summarize, policies);
        assertEquals(403, assertThrows(ApiException.class, () -> controller.today(null, request)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.summarize(null, request)).status());
        verifyNoInteractions(today, summarize);
    }

    @Test
    void acceptedConsentIsCheckedBeforeCallingTheSelectedService() {
        TodayService today = mock(TodayService.class);
        SummarizeService summarize = mock(SummarizeService.class);
        PolicyConsentService policies = mock(PolicyConsentService.class);
        MockHttpServletRequest request = new MockHttpServletRequest();
        Map<String, Object> expected = Map.of("source", "ai");
        when(today.run(null)).thenReturn(expected);
        when(summarize.run(null)).thenReturn(expected);
        AiController controller = new AiController(today, summarize, policies);
        assertEquals(expected, controller.today(null, request));
        assertEquals(expected, controller.summarize(null, request));
        var order = inOrder(policies, today, summarize);
        order.verify(policies).requireAiConsent(request);
        order.verify(today).run(null);
        order.verify(policies).requireAiConsent(request);
        order.verify(summarize).run(null);
    }
}
