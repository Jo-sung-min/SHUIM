package kr.co.shuim.sponsor;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SponsorAdminControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final SponsorService sponsors = mock(SponsorService.class);
    private final SponsorAdminController controller = new SponsorAdminController(auth, sponsors);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private static DbUser user(String role, boolean anonymous) { return new DbUser("u", null, "닉", role, anonymous, null, null, 0); }

    @Test void everyEndpointRequiresAnAuthenticatedAdministrator() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        for (DbUser actor : new DbUser[]{null, user("user", false), user("admin", true)}) {
            when(auth.currentUser(any())).thenReturn(Optional.ofNullable(actor));
            assertEquals(403, assertThrows(ApiException.class, () -> controller.banners(request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.list(request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.settings(request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.deleteSponsor("x", request)).status());
        }
        verifyNoInteractions(sponsors);
        when(auth.currentUser(any())).thenReturn(Optional.of(user("admin", false)));
        when(sponsors.contact()).thenReturn(new SponsorService.Contact("a@b.co", "30일 30만원"));
        assertEquals(Map.of("contactEmail", "a@b.co", "priceLabel", "30일 30만원"), controller.settings(request).getBody());
        assertEquals("no-store", controller.settings(request).getHeaders().getCacheControl());
    }

    @Test void bannerBodiesAreValidatedBeforeReachingTheService() {
        Map<String, Object> body = new HashMap<>(Map.of("title", " 소로우 ", "tagline", "함께", "linkUrl", "https://sorow.co.kr", "position", 2,
            "startsAt", 1_000, "endsAt", 2_000, "published", false, "sponsorId", ""));
        var input = SponsorAdminController.bannerInput(body);
        assertEquals("소로우", input.title());
        assertEquals(2, input.position());
        assertFalse(input.published());
        assertNull(input.sponsorId());
        assertFalse(input.image().change());

        body.put("image", null);
        assertTrue(SponsorAdminController.bannerInput(body).image().change());
        assertNull(SponsorAdminController.bannerInput(body).image().dataUrl());

        body.put("linkUrl", "mailto:x@y.z");
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.bannerInput(body)).status());
        body.put("linkUrl", "https://sorow.co.kr");
        body.put("title", "");
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.bannerInput(body)).status());
        body.put("title", "소로우");
        body.put("position", -1);
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.bannerInput(body)).status());
        body.put("position", 1.5);
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.bannerInput(body)).status());
        body.put("position", 0);
        body.put("startsAt", "soon");
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.bannerInput(body)).status());
    }

    @Test void sponsorBodiesKeepOptionalLinksAndLogos() {
        var input = SponsorAdminController.sponsorInput(Map.of("name", "청우헌", "linkUrl", "", "published", true));
        assertEquals("청우헌", input.name());
        assertNull(input.linkUrl());
        assertEquals(0, input.position());
        assertFalse(input.logo().change());
        var withLogo = SponsorAdminController.sponsorInput(Map.of("name", "청우헌", "logo", "data:image/png;base64,AAAA"));
        assertTrue(withLogo.logo().change());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.sponsorInput(Map.of("name", ""))).status());
    }

    @Test void sponsorFramesAreOptionalButNeverPartlyUnknown() {
        assertNull(SponsorAdminController.sponsorInput(Map.of("name", "청우헌")).frame());
        var framed = SponsorAdminController.sponsorInput(Map.of("name", "청우헌", "frame", Map.of("style", "neon", "color", "pink", "deco", "heart")));
        assertEquals(new SponsorPolicy.Frame("neon", "pink", "heart"), framed.frame());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.sponsorInput(Map.of("name", "청우헌", "frame", "neon"))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.sponsorInput(Map.of("name", "청우헌", "frame", Map.of("style", "neon", "color", "pink")))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorAdminController.sponsorInput(Map.of("name", "청우헌", "frame", Map.of("style", "url(x)", "color", "pink", "deco", "heart")))).status());
    }

    @Test void studioLinksAreIssuedAndClosedByAdministratorsOnly() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        when(auth.currentUser(any())).thenReturn(Optional.of(user("user", false)));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.issueStudioKey("x", request)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.revokeStudioKey("x", request)).status());
        verifyNoInteractions(sponsors);

        when(auth.currentUser(any())).thenReturn(Optional.of(user("admin", false)));
        var sponsor = new SponsorService.AdminSponsor("id", "청우헌", "", null, null, 0, 0, 0, 0, 0, true, 0, 1, 2, java.util.List.of(), SponsorPolicy.Frame.DEFAULT, 2L);
        when(sponsors.issueStudioKey("id")).thenReturn(new SponsorService.StudioKey("k".repeat(43), 2L, sponsor));
        var issued = controller.issueStudioKey("id", request);
        assertEquals(Map.of("key", "k".repeat(43), "issuedAt", 2L, "sponsor", sponsor), issued.getBody());
        assertEquals("no-store", issued.getHeaders().getCacheControl());
    }
}
