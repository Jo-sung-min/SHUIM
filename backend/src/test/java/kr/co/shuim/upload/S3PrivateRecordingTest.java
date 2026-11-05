package kr.co.shuim.upload;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

import java.io.ByteArrayInputStream;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class S3PrivateRecordingTest {
    @Test
    void onlyBoundedKmsObjectsWithTheInventoriedDigestCanBePlayed() throws Exception {
        String key = "private/room-music/morning-v1.m4a";
        byte[] fixture = {1, 4, 8};
        String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(fixture));
        S3Client client = mock(S3Client.class);
        S3Service s3 = new S3Service("ap-northeast-2", "unit-bucket", "feed", "", "", "", null);
        ReflectionTestUtils.setField(s3, "client", client);
        when(client.getObject(GetObjectRequest.builder().key(key).bucket("unit-bucket").build()))
            .thenReturn(stream(fixture, ServerSideEncryption.AWS_KMS, 3))
            .thenReturn(stream(fixture, ServerSideEncryption.AES256, 3))
            .thenReturn(stream(fixture, ServerSideEncryption.AWS_KMS, 4))
            .thenReturn(stream(fixture, ServerSideEncryption.AWS_KMS, 3));
        assertArrayEquals(fixture, s3.readPrivateRecording(key, 3, digest));
        assertEquals(503, assertThrows(ApiException.class, () -> s3.readPrivateRecording(key, 3, digest)).status());
        assertEquals(503, assertThrows(ApiException.class, () -> s3.readPrivateRecording(key, 3, digest)).status());
        assertEquals(503, assertThrows(ApiException.class, () -> s3.readPrivateRecording(key, 3, "incorrect")).status());
        assertThrows(IllegalArgumentException.class, () -> s3.readPrivateRecording("feed/public.mp3", 3, digest));
    }

    private static ResponseInputStream<GetObjectResponse> stream(byte[] bytes, ServerSideEncryption encryption, long size) {
        return new ResponseInputStream<>(GetObjectResponse.builder().serverSideEncryption(encryption).contentLength(size).build(),
            AbortableInputStream.create(new ByteArrayInputStream(bytes)));
    }
}
