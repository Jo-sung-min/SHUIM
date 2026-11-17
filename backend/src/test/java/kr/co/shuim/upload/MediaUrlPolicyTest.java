package kr.co.shuim.upload;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** 피드 사진·릴스 표지·프로필 사진으로 받을 주소: 우리 CDN·버킷 또는 사이트 상대 경로만 */
class MediaUrlPolicyTest {
    @Test
    void onlyOurCdnBucketOrSiteRelativePathsAreAccepted() {
        var s3 = new S3Service("ap-northeast-2", "test-bucket", "upload", "test-key", "test-secret", "https://cdn.example.com", null);
        assertTrue(s3.isAllowedMediaUrl("https://cdn.example.com/upload/2026/11/17/u-1.webp"));
        assertTrue(s3.isAllowedMediaUrl("https://cdn.example.com/feed/curation/sky-v1.webp"));
        assertTrue(s3.isAllowedMediaUrl("https://test-bucket.s3.ap-northeast-2.amazonaws.com/upload/u-1.png"));
        assertTrue(s3.isAllowedMediaUrl("/feed/curation/sky-v1.webp"));
        assertFalse(s3.isAllowedMediaUrl("https://tracker.example.net/pixel.gif"));
        assertFalse(s3.isAllowedMediaUrl("https://cdn.example.com.evil.net/x.png"));
        assertFalse(s3.isAllowedMediaUrl("https://cdn.example.com@evil.net/x.png"));
        assertFalse(s3.isAllowedMediaUrl("//evil.net/x.png"));
        assertFalse(s3.isAllowedMediaUrl("/\\evil.net/x.png"));
        assertFalse(s3.isAllowedMediaUrl("http://cdn.example.com/upload/x.png"));
        assertFalse(s3.isAllowedMediaUrl("javascript:alert(1)"));
        assertFalse(s3.isAllowedMediaUrl("/feed/a b.png"));
        assertFalse(s3.isAllowedMediaUrl(""));
        assertFalse(s3.isAllowedMediaUrl(null));
    }

    @Test
    void localDevelopmentWithoutStorageStillAcceptsSiteRelativePaths() {
        var s3 = new S3Service("", "", "upload", "", "", "", null);
        assertTrue(s3.isAllowedMediaUrl("/feed/curation/sky-v1.webp"));
        assertFalse(s3.isAllowedMediaUrl("https://images.example/a.png"));
    }
}
