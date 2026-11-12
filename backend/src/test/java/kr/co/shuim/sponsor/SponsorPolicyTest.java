package kr.co.shuim.sponsor;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class SponsorPolicyTest {
    @Test void contributionsChargeOneFireworkPerThousandWonWithinBounds() {
        assertEquals(1_000, SponsorPolicy.fireworksFor(1_000_000));
        assertEquals(1, SponsorPolicy.fireworksFor(1_999));
        assertEquals(100_000, SponsorPolicy.fireworksFor(SponsorPolicy.MAX_CONTRIBUTION_WON));
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.fireworksFor(999)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.fireworksFor(SponsorPolicy.MAX_CONTRIBUTION_WON + 1)).status());
    }

    @Test void linksMustBeWebAddresses() {
        assertEquals("https://example.com/a?b=1", SponsorPolicy.link("  https://example.com/a?b=1 ", true));
        assertNull(SponsorPolicy.link(" ", false));
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.link("", true)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.link("javascript:alert(1)", true)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.link("ftp://example.com", false)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.link("https://" + "a".repeat(500), false)).status());
    }

    @Test void textLimitsAndDefaultsApply() {
        assertEquals("소로우", SponsorPolicy.name(" 소로우 "));
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.name("   ")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.name("가".repeat(41))).status());
        assertEquals("", SponsorPolicy.tagline(null));
        assertNull(SponsorPolicy.note(""));
        assertEquals(SponsorPolicy.DEFAULT_CONTACT_EMAIL, SponsorPolicy.email(""));
        assertEquals("ads@sorow.co.kr", SponsorPolicy.email(" ads@sorow.co.kr "));
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.email("not-an-email")).status());
        assertEquals(SponsorPolicy.DEFAULT_PRICE_LABEL, SponsorPolicy.priceLabel(null));
        assertEquals("30일 20만원", SponsorPolicy.priceLabel("30일 20만원"));
    }

    @Test void bannerStatusFollowsThePublishingWindow() {
        assertEquals("hidden", SponsorPolicy.status(false, 10, 20, 15));
        assertEquals("scheduled", SponsorPolicy.status(true, 10, 20, 9));
        assertEquals("live", SponsorPolicy.status(true, 10, 20, 10));
        assertEquals("ended", SponsorPolicy.status(true, 10, 20, 20));
        assertTrue(SponsorPolicy.live(true, 10, 20, 19));
        assertFalse(SponsorPolicy.live(true, 10, 20, 20));
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.period(20, 20)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.period(0, 20)).status());
    }

    @Test void framesAreLimitedToTheKnownLists() {
        var frame = new SponsorPolicy.Frame("gold", "teal", "star");
        assertEquals(frame, SponsorPolicy.frame("gold", "teal", "star"));
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.frame("hologram", "teal", "star")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.frame("gold", null, "star")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.frame("gold", "teal", "crown")).status());
        // 저장된 값이 목록에서 빠졌어도 화면은 기본 액자로 뜬다
        assertEquals(SponsorPolicy.Frame.DEFAULT, SponsorPolicy.frameOrDefault(null, "beige", ""));
        assertEquals(new SponsorPolicy.Frame("wood", "violet", "leaf"), SponsorPolicy.frameOrDefault("wood", "beige", "leaf"));
        assertEquals(SponsorPolicy.Frame.DEFAULT, SponsorPolicy.frame(SponsorPolicy.FRAME_STYLES.get(0), SponsorPolicy.FRAME_COLORS.get(0), SponsorPolicy.FRAME_DECOS.get(0)));
    }

    @Test void studioKeysAreRandomAndMatchedOnlyByHash() {
        String a = SponsorPolicy.newStudioKey(), b = SponsorPolicy.newStudioKey();
        assertEquals(43, a.length());
        assertTrue(a.matches("[A-Za-z0-9_-]+"));
        assertNotEquals(a, b);
        assertEquals(64, SponsorPolicy.studioKeyHash(a).length());
        assertEquals(SponsorPolicy.studioKeyHash(a), SponsorPolicy.studioKeyHash(a));
        assertNotEquals(SponsorPolicy.studioKeyHash(a), SponsorPolicy.studioKeyHash(b));
        assertNotEquals(a, SponsorPolicy.studioKeyHash(a));
        assertNull(SponsorPolicy.studioKeyHash(null));
        assertNull(SponsorPolicy.studioKeyHash(""));
        assertNull(SponsorPolicy.studioKeyHash(a + "x"));
        assertNull(SponsorPolicy.studioKeyHash(a.substring(1) + "!"));
    }

    @Test void imagesAreDecodedAndBounded() {
        String png = "data:image/png;base64," + Base64.getEncoder().encodeToString(new byte[]{1, 2, 3});
        var image = SponsorPolicy.decodeImage(png);
        assertEquals("image/png", image.type());
        assertEquals(3, image.bytes());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.decodeImage("data:image/svg+xml;base64,AAAA")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.decodeImage("https://example.com/logo.png")).status());
        String large = "data:image/webp;base64," + Base64.getEncoder().encodeToString(new byte[SponsorPolicy.IMAGE_MAX_BYTES + 1]);
        assertEquals(400, assertThrows(ApiException.class, () -> SponsorPolicy.decodeImage(large)).status());
    }
}
