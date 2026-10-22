package kr.co.shuim.upload;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UploadValidationTest {
    private final S3Service configured = new S3Service("ap-northeast-2", "test-bucket", "feed", "test-key", "test-secret", "", null);

    @Test
    void unsupportedEmptyAndOversizedPhotosAreRejectedBeforeSigningOrPersistence() {
        assertEquals(400, assertThrows(ApiException.class, () -> configured.presignUpload("user", "image/svg+xml", 100)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> configured.presignUpload("user", "image/jpeg", 0)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> configured.presignUpload("user", "image/jpeg", -1)).status());
        ApiException large = assertThrows(ApiException.class, () -> configured.presignUpload("user", "image/jpeg", S3Service.MAX_UPLOAD_BYTES + 1));
        assertEquals(400, large.status());
        assertTrue(large.getMessage().contains("5MB"));
    }

    @Test
    void unavailableAttachmentDoesNotCreateAnAccountOrExposeConfiguration() {
        AuthService auth = mock(AuthService.class);
        CommunityConsentService consent = mock(CommunityConsentService.class);
        S3Service unavailable = new S3Service("", "", "feed", "", "", "", null);
        UploadController controller = new UploadController(auth, unavailable, consent);
        assertEquals(false, controller.info().get("configured"));
        ApiException error = assertThrows(ApiException.class, () -> controller.presign(Map.of("contentType", "image/jpeg", "size", 20), new MockHttpServletRequest(), new MockHttpServletResponse()));
        assertEquals(503, error.status());
        assertTrue(error.getMessage().contains("사진"));
        assertFalse(error.getMessage().matches(".*(S3|서버|버킷|CORS).*"));
        verifyNoInteractions(auth, consent);
        assertEquals(error.getMessage(), assertThrows(ApiException.class, () -> unavailable.presignUpload("user", "image/jpeg", 20)).getMessage());
    }
}
