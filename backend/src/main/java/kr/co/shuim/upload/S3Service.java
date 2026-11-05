package kr.co.shuim.upload;

import jakarta.annotation.PreDestroy;
import kr.co.shuim.common.Ids;
import kr.co.shuim.config.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.simple.JdbcClient;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.utils.SdkAutoCloseable;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.time.Duration;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
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
    private final String sessionToken;
    private final String cdn;
    private final JdbcClient jdbc;
    private S3Client client;
    private S3Presigner presigner;
    private AwsCredentialsProvider credentials;

    @Autowired
    public S3Service(@Value("${app.s3.region:ap-northeast-2}") String region,
                     @Value("${app.s3.bucket:}") String bucket,
                     @Value("${app.s3.prefix:feed}") String prefix,
                     @Value("${app.s3.access-key-id:}") String accessKeyId,
                     @Value("${app.s3.secret-access-key:}") String secretAccessKey,
                     @Value("${app.s3.session-token:}") String sessionToken,
                     @Value("${app.s3.cdn-base-url:}") String cdn, JdbcClient jdbc) {
        this.region = region.strip();
        this.bucket = bucket.strip();
        this.prefix = prefix.strip().replaceAll("^/+|/+$", "");
        this.accessKeyId = accessKeyId.strip();
        this.secretAccessKey = secretAccessKey.strip();
        this.sessionToken = sessionToken.strip();
        this.cdn = cdn.strip().replaceAll("/+$", "");
        this.jdbc = jdbc;
    }

    public S3Service(String region, String bucket, String prefix, String accessKeyId, String secretAccessKey, String cdn, JdbcClient jdbc) {
        this(region, bucket, prefix, accessKeyId, secretAccessKey, "", cdn, jdbc);
    }

    public boolean configured() {
        boolean explicitCredentials = !accessKeyId.isBlank() || !secretAccessKey.isBlank() || !sessionToken.isBlank();
        return !region.isBlank() && !bucket.isBlank()
            && (!explicitCredentials || (!accessKeyId.isBlank() && !secretAccessKey.isBlank()));
    }

    /** Empty keys use the runtime IAM role/profile chain; temporary explicit keys keep their session token. */
    synchronized AwsCredentialsProvider credentialsProvider() {
        if (credentials == null) {
            if (accessKeyId.isBlank() && secretAccessKey.isBlank() && sessionToken.isBlank()) {
                credentials = DefaultCredentialsProvider.builder().build();
            } else {
                credentials = StaticCredentialsProvider.create(sessionToken.isBlank()
                    ? AwsBasicCredentials.create(accessKeyId, secretAccessKey)
                    : AwsSessionCredentials.create(accessKeyId, secretAccessKey, sessionToken));
            }
        }
        return credentials;
    }

    private synchronized S3Client client() {
        if (client == null) client = S3Client.builder().region(Region.of(region)).credentialsProvider(credentialsProvider()).build();
        return client;
    }

    /** Load a bounded, KMS-encrypted recording only for the application's own versioned inventory. */
    public byte[] readPrivateRecording(String key, int size, String sha256) {
        if (!key.matches("private/room-music/[a-z0-9-]+-v[0-9]+\\.m4a") || size <= 0 || size > 6 * 1024 * 1024)
            throw new IllegalArgumentException("Invalid room music inventory");
        String unavailable = "지금은 음악을 불러올 수 없어요. 잠시 후 다시 들어 주세요.";
        if (!configured()) throw ApiException.unavailable(unavailable);
        var request = GetObjectRequest.builder().bucket(bucket).key(key).build();
        try (var stream = client().getObject(request)) {
            var response = stream.response();
            if (response.serverSideEncryption() != ServerSideEncryption.AWS_KMS || response.contentLength() != size) {
                stream.abort();
                throw new IOException("Unexpected recording metadata");
            }
            byte[] data = stream.readNBytes(size + 1);
            String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
            if (data.length != size || !digest.equals(sha256)) throw new IOException("Unexpected recording content");
            return data;
        } catch (IOException | SdkException e) {
            log.warn("Room recording unavailable for {} ({})", key, e.getClass().getSimpleName());
            throw ApiException.unavailable(unavailable);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private synchronized S3Presigner presigner() {
        if (presigner == null) presigner = S3Presigner.builder().region(Region.of(region)).credentialsProvider(credentialsProvider()).build();
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

    /** A user may reference another person's public URL; never delete its underlying object. */
    public String ownedKeyFromUrl(String url, String userId) {
        String key = keyFromUrl(url);
        if (key == null || userId == null) return null;
        String file = key.substring(key.lastIndexOf('/') + 1);
        return key.startsWith(prefix + "/") && file.startsWith(userId + "-") ? key : null;
    }

    /** 프리사인 PUT URL 발급. Content-Type·Content-Length·Cache-Control 을 서명에 넣어 그 조건으로만 올릴 수 있게 한다. */
    public Presigned presignUpload(String userId, String contentType, long size) {
        if (!configured()) throw ApiException.unavailable("지금은 사진을 첨부할 수 없어요. 잠시 후 다시 시도해 주세요.");
        String ext = ALLOWED_TYPES.get(contentType);
        if (ext == null) throw ApiException.badRequest("JPG, PNG, WebP, GIF 사진을 선택해 주세요.");
        if (size <= 0) throw ApiException.badRequest("비어 있는 사진은 첨부할 수 없어요. 다른 사진을 선택해 주세요.");
        if (size > MAX_UPLOAD_BYTES) throw ApiException.badRequest("사진은 한 장당 " + (MAX_UPLOAD_BYTES / 1024 / 1024) + "MB 이하여야 해요. 크기를 줄인 뒤 다시 선택해 주세요.");
        String day = LocalDate.now(java.time.ZoneOffset.UTC).toString().replace('-', '/');
        String key = prefix + "/" + day + "/" + userId + "-" + Ids.randomHex(8) + "." + ext;
        String cacheControl = "public, max-age=300";
        PutObjectRequest put = PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).contentLength(size).cacheControl(cacheControl).build();
        PresignedPutObjectRequest p;
        try {
            p = presigner().presignPutObject(PutObjectPresignRequest.builder().signatureDuration(PRESIGN_TTL).putObjectRequest(put).build());
        } catch (SdkClientException e) {
            // Credential-chain diagnostics can contain infrastructure details; keep them out of the response.
            throw ApiException.unavailable("지금은 사진을 첨부할 수 없어요. 잠시 후 다시 시도해 주세요.");
        }
        jdbc.sql("INSERT INTO uploaded_objects (object_key, user_id) VALUES (?, ?)").param(key).param(userId).update();
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

    /** Durable cleanup jobs call this method; failures must propagate so the job is retried. */
    public void deleteObject(String key) {
        if (!configured()) throw ApiException.unavailable("사진을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
        client().deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    @PreDestroy
    public synchronized void close() {
        if (client != null) { client.close(); client = null; }
        if (presigner != null) { presigner.close(); presigner = null; }
        if (credentials instanceof SdkAutoCloseable owned) owned.close();
        credentials = null;
    }
}
