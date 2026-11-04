package kr.co.shuim.upload;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkClientException;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class S3ConfigurationTest {
    private JdbcClient database() {
        JdbcClient jdbc = mock(JdbcClient.class);
        JdbcClient.StatementSpec statement = mock(JdbcClient.StatementSpec.class);
        when(jdbc.sql(anyString())).thenReturn(statement);
        when(statement.param(any())).thenReturn(statement);
        when(statement.update()).thenReturn(1);
        return jdbc;
    }

    private Map<String, String> query(String url) {
        return Arrays.stream(URI.create(url).getRawQuery().split("&")).map(part -> part.split("=", 2))
            .collect(Collectors.toMap(parts -> parts[0], parts -> URLDecoder.decode(parts[1], StandardCharsets.UTF_8)));
    }

    @Test
    void completeStorageCoordinatesAllowTheRuntimeRoleWithoutResolvingCredentialsDuringStatusChecks() {
        var s3 = new S3Service("ap-northeast-2", "sorow-aws-s3", "upload", "", "", "", "https://cdn.sorow.co.kr", null);
        assertTrue(s3.configured());
        assertInstanceOf(DefaultCredentialsProvider.class, s3.credentialsProvider());
        assertSame(s3.credentialsProvider(), s3.credentialsProvider());
        assertEquals("https://cdn.sorow.co.kr/upload/photo.webp", s3.publicUrlFor("upload/photo.webp"));
        s3.close(); s3.close();
    }

    @Test
    void incompleteExplicitCredentialsCannotSilentlyFallBackToAnotherAccount() {
        for (String[] values : new String[][]{{"key", "", ""}, {"", "secret", ""}, {"", "", "token"}, {"key", "", "token"}}) {
            var s3 = new S3Service("ap-northeast-2", "sorow-aws-s3", "upload", values[0], values[1], values[2], "https://cdn.sorow.co.kr", null);
            assertFalse(s3.configured());
            assertEquals(503, assertThrows(ApiException.class, () -> s3.presignUpload("user", "image/webp", 100)).status());
        }
        assertFalse(new S3Service("", "sorow-aws-s3", "upload", "", "", "", "", null).configured());
        assertFalse(new S3Service("ap-northeast-2", "", "upload", "", "", "", "", null).configured());
    }

    @Test
    void staticKeysStillSignDirectS3UploadsAndReturnTheNewCdnAddress() {
        JdbcClient jdbc = database();
        var s3 = new S3Service(" ap-northeast-2 ", " sorow-aws-s3 ", " /upload/ ", "unit-key", "unit-secret", "", " https://cdn.sorow.co.kr/ ", jdbc);
        var result = s3.presignUpload("unit-user", "image/webp", 300);
        assertEquals("sorow-aws-s3.s3.ap-northeast-2.amazonaws.com", URI.create(result.uploadUrl()).getHost());
        assertTrue(result.key().matches("upload/\\d{4}/\\d{2}/\\d{2}/unit-user-[0-9a-f]+\\.webp"));
        assertEquals("https://cdn.sorow.co.kr/" + result.key(), result.publicUrl());
        assertEquals(60, result.expiresIn());
        assertEquals("image/webp", result.headers().get("Content-Type"));
        assertEquals("public, max-age=300", result.headers().get("Cache-Control"));
        assertFalse(query(result.uploadUrl()).containsKey("X-Amz-Security-Token"));
        assertTrue(query(result.uploadUrl()).get("X-Amz-SignedHeaders").contains("content-type"));
        verify(jdbc).sql("INSERT INTO uploaded_objects (object_key, user_id) VALUES (?, ?)");
        s3.close();
    }

    @Test
    void temporaryKeysPreserveTheirSessionTokenInTheSignedRequest() {
        var s3 = new S3Service("ap-northeast-2", "sorow-aws-s3", "upload", "unit-key", "unit-secret", "unit-session-token", "https://cdn.sorow.co.kr", database());
        assertTrue(s3.configured());
        var credentials = assertInstanceOf(AwsSessionCredentials.class, s3.credentialsProvider().resolveCredentials());
        assertEquals("unit-session-token", credentials.sessionToken());
        assertEquals("unit-session-token", query(s3.presignUpload("unit-user", "image/png", 200).uploadUrl()).get("X-Amz-Security-Token"));
        s3.close();
    }

    @Test
    void missingRuntimeCredentialsReturnAFriendlyUnavailableResponseBeforePersistence() {
        JdbcClient jdbc = mock(JdbcClient.class);
        var s3 = new S3Service("ap-northeast-2", "sorow-aws-s3", "upload", "", "", "", "https://cdn.sorow.co.kr", jdbc) {
            @Override synchronized AwsCredentialsProvider credentialsProvider() {
                return () -> { throw SdkClientException.create("private runtime credential detail"); };
            }
        };
        var error = assertThrows(ApiException.class, () -> s3.presignUpload("unit-user", "image/webp", 100));
        assertEquals(503, error.status());
        assertFalse(error.getMessage().contains("credential"));
        assertFalse(error.getMessage().contains("private"));
        verifyNoInteractions(jdbc);
        s3.close();
    }

    @Test
    void roleModeRetainsOwnedUploadDeletionChecksForBothCdnAndS3Urls() {
        var s3 = new S3Service("ap-northeast-2", "sorow-aws-s3", "upload", "", "", "", "https://cdn.sorow.co.kr", null);
        String key = "upload/2026/11/04/owner-123.webp";
        assertEquals(key, s3.ownedKeyFromUrl("https://cdn.sorow.co.kr/" + key, "owner"));
        assertEquals(key, s3.ownedKeyFromUrl("https://sorow-aws-s3.s3.ap-northeast-2.amazonaws.com/" + key, "owner"));
        assertNull(s3.ownedKeyFromUrl("https://cdn.sorow.co.kr/" + key, "other"));
        assertNull(s3.ownedKeyFromUrl("https://cdn.sorow.co.kr/beach/owner-123.webp", "owner"));
        assertNull(s3.ownedKeyFromUrl("https://cdn.sorow.co.kr.other.example/" + key, "owner"));
        s3.close();
    }
}
