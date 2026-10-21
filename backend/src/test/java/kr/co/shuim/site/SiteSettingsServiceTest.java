package kr.co.shuim.site;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/** 관리자가 올리는 파비콘·공유 이미지 data URL 검사 */
class SiteSettingsServiceTest {
    private static String dataUrl(String type, byte[] bytes) {
        return "data:" + type + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    @Test
    void acceptsPngAndKeepsBase64() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0, 1, 2, 3};
        SiteSettingsService.Decoded d = SiteSettingsService.decode("favicon", dataUrl("image/PNG", png));
        assertEquals("image/png", d.type());
        assertEquals(png.length, d.bytes());
        assertArrayEquals(png, Base64.getDecoder().decode(d.base64()));
    }

    @Test
    void rejectsNonImageAndMalformed() {
        ApiException svg = assertThrows(ApiException.class, () -> SiteSettingsService.decode("favicon", dataUrl("image/svg+xml", new byte[]{1})));
        assertEquals(400, svg.status());
        assertThrows(ApiException.class, () -> SiteSettingsService.decode("favicon", "https://example.com/a.png"));
        assertThrows(ApiException.class, () -> SiteSettingsService.decode("favicon", "data:image/png;base64,"));
        assertThrows(ApiException.class, () -> SiteSettingsService.decode("favicon", "data:image/png;base64,%%%"));
    }

    @Test
    void enforcesSizeLimitPerKind() {
        byte[] big = new byte[SiteSettingsService.FAVICON_MAX_BYTES + 1];
        assertThrows(ApiException.class, () -> SiteSettingsService.decode("favicon", dataUrl("image/png", big)));
        assertDoesNotThrow(() -> SiteSettingsService.decode("og", dataUrl("image/jpeg", big))); // 공유 이미지 한도는 더 크다
        byte[] tooBigForOg = new byte[SiteSettingsService.OG_MAX_BYTES + 1];
        assertThrows(ApiException.class, () -> SiteSettingsService.decode("og", dataUrl("image/jpeg", tooBigForOg)));
    }
}
