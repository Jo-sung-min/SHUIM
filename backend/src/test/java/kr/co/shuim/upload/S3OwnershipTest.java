package kr.co.shuim.upload;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class S3OwnershipTest {
    private final S3Service s3 = new S3Service("ap-northeast-2", "test-bucket", "feed", "test-key", "test-secret", "https://cdn.example.com", null);

    @Test
    void onlyOwnedKeysWithinConfiguredStoragePrefixMayBeDeleted() {
        assertEquals("feed/2026/10/21/abc-123.png", s3.ownedKeyFromUrl("https://cdn.example.com/feed/2026/10/21/abc-123.png", "abc"));
        assertNull(s3.ownedKeyFromUrl("https://cdn.example.com/feed/2026/10/21/other-123.png", "abc"));
        assertNull(s3.ownedKeyFromUrl("https://evil.example.com/feed/2026/10/21/abc-123.png", "abc"));
        assertNull(s3.ownedKeyFromUrl("https://cdn.example.com/other/abc-123.png", "abc"));
        assertNull(s3.ownedKeyFromUrl("https://cdn.example.com.evil.example.com/feed/abc-123.png", "abc"));
        assertNull(s3.ownedKeyFromUrl(null, "abc"));
    }
}
