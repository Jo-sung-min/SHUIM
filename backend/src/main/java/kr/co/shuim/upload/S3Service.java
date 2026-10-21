package kr.co.shuim.upload;

import kr.co.shuim.common.Ids;
import kr.co.shuim.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * S3 업로드. 브라우저가 파일을 서버로 보내지 않고, 서버가 발급한 프리사인 PUT URL 로 S3 에 직접 올린다.
 * 공개 주소는 CDN_BASE_URL(CloudFront)이 있으면 그걸로, 없으면 S3 가상 호스트 주소로 만든다.
 */
@Service
public class S3Service {
    private static final Logger log = LoggerFactory.getLogger(S3Service.class);
    public static final Map<String, String> ALLOWED_TYPES = new LinkedHashMap<>(Map.of("image/jpeg", "jpg", "image/png", "png", "image/webp", "webp", "image/gif", "gif"));
    public static final long MAX_UPLOAD_BYTES = 5L * 1024 * 1024;
    private static final Duration PRESIGN_TTL = Duration.ofSeconds(60);

    private final String region;
    private final String bucket;
    private final String prefix;
    private final String accessKeyId;
    private final String secretAccessKey;
    private final String cdn;
    private S3Client client;
    private S3Presigner presigner;

    public S3Service(@Value("${app.s3.region:ap-northeast-2}") String region,
                     @Value("${app.s3.bucket:}") String bucket,
                     @Value("${app.s3.prefix:feed}") String prefix,
                     @Value("${app.s3.access-key-id:}") String accessKeyId,
                     @Value("${app.s3.secret-access-key:}") String secretAccessKey,
                     @Value("${app.s3.cdn-base-url:}") String cdn) {
        this.region = region;
        this.bucket = bucket;
        this.prefix = prefix.replaceAll("^/+|/+$", "");
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.cdn = cdn.replaceAll("/+$", "");
    }

    public boolean configured() {
        return !region.isBlank() && !bucket.isBlank() && !accessKeyId.isBlank() && !secretAccessKey.isBlank();
    }

    private StaticCredentialsProvider creds() {
        return StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey));
    }

    private synchronized S3Client client() {
        if (client == null) client = S3Client.builder().region(Region.of(region)).credentialsProvider(creds()).build();
        return client;
    }

    private synchronized S3Presigner presigner() {
        if (presigner == null) presigner = S3Presigner.builder().region(Region.of(region)).credentialsProvider(creds()).build();
        return presigner;
    }

    /** 키 → 공개 URL (CDN 우선) */
    public String publicUrlFor(String key) {
        return cdn.isBlank() ? "https://" + bucket + ".s3." + region + ".amazonaws.com/" + key : cdn + "/" + key;
    }

    /** 공개 URL → 우리 버킷의 키 (우리 주소가 아니면 null) */
    public String keyFromUrl(String url) {
        if (!configured() || url == null) return null;
        for (String b : List.of(cdn, "https://" + bucket + ".s3." + region + ".amazonaws.com", "https://" + bucket + ".s3.amazonaws.com")) {
            if (b.isBlank()) continue;
            if (url.startsWith(b + "/")) return url.substring(b.length() + 1);
        }
        return null;
    }

    public record Presigned(String uploadUrl, String key, String publicUrl, long expiresIn, Map<String, String> headers) {}

    /** 프리사인 PUT URL 발급. Content-Type·Content-Length·Cache-Control 을 서명에 넣어 그 조건으로만 올릴 수 있게 한다. */
    public Presigned presignUpload(String userId, String contentType, long size) {
        if (!configured()) throw ApiException.unavailable("S3 설정이 없어 사진 업로드는 꺼져 있어요");
        String ext = ALLOWED_TYPES.get(contentType);
        if (ext == null) throw ApiException.badRequest("jpg, png, webp, gif 이미지만 올릴 수 있어요");
        if (size <= 0 || size > MAX_UPLOAD_BYTES) throw ApiException.badRequest("파일은 " + (MAX_UPLOAD_BYTES / 1024 / 1024) + "MB 이하여야 해요");
        String day = LocalDate.now(java.time.ZoneOffset.UTC).toString().replace('-', '/');
        String key = prefix + "/" + day + "/" + userId + "-" + Ids.randomHex(8) + "." + ext;
        String cacheControl = "public, max-age=31536000, immutable";
        PutObjectRequest put = PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).contentLength(size).cacheControl(cacheControl).build();
        PresignedPutObjectRequest p = presigner().presignPutObject(PutObjectPresignRequest.builder().signatureDuration(PRESIGN_TTL).putObjectRequest(put).build());
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", contentType);
        headers.put("Cache-Control", cacheControl);
        return new Presigned(p.url().toString(), key, publicUrlFor(key), PRESIGN_TTL.getSeconds(), headers);
    }

    /** 글 삭제 때 우리 버킷의 이미지면 함께 지운다 (실패해도 글 삭제는 계속) */
    public void deleteUploadedImage(String url) {
        String key = keyFromUrl(url);
        if (key == null) return;
        try {
            client().deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (Exception e) {
            log.warn("S3 delete failed {}: {}", key, e.getMessage());
        }
    }
}
