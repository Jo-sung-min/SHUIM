package kr.co.shuim.sponsor;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SponsorControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final SponsorService sponsors = mock(SponsorService.class);
    private final SponsorController controller = new SponsorController(auth, sponsors);
    private final SponsorService.StudioSponsor card = new SponsorService.StudioSponsor("id", "청우헌", "", null, 3_000_000, 2, SponsorPolicy.Frame.DEFAULT);

    @Test void studioOpensWithTheKeyAloneAndIsNeverCached() {
        when(sponsors.studio("k")).thenReturn(card);
        var opened = controller.studio(Map.of("key", "k"));
        assertEquals(Map.of("sponsor", card), opened.getBody());
        assertEquals("no-store", opened.getHeaders().getCacheControl());
        verifyNoInteractions(auth);

        // 키가 없거나 문자열이 아니면 서비스가 404 로 거절한다
        when(sponsors.studio(null)).thenThrow(ApiException.notFound("x"));
        assertEquals(404, assertThrows(ApiException.class, () -> controller.studio(null)).status());
        assertEquals(404, assertThrows(ApiException.class, () -> controller.studio(Map.of("key", 7))).status());
    }

    @Test void decoratingValidatesTheFrameBeforeTouchingTheSponsor() {
        var frame = new SponsorPolicy.Frame("gold", "teal", "star");
        when(sponsors.decorate("k", frame)).thenReturn(card);
        var saved = controller.decorate(Map.of("key", "k", "style", "gold", "color", "teal", "deco", "star"));
        assertEquals(Map.of("sponsor", card), saved.getBody());
        assertEquals("no-store", saved.getHeaders().getCacheControl());

        assertEquals(400, assertThrows(ApiException.class, () -> controller.decorate(Map.of("key", "k", "style", "gold"))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.decorate(Map.of("key", "k", "style", "gold", "color", "#fff", "deco", "star"))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.decorate(null)).status());
        verify(sponsors, times(1)).decorate(any(), any());
    }
}
