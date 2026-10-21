package kr.co.shuim.upload;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class UploadController {
    private final AuthService auth;
    private final S3Service s3;

    public UploadController(AuthService auth, S3Service s3) {
        this.auth = auth;
        this.s3 = s3;
    }

    /** GET /api/upload/presign — 업로드 가능 여부와 제한 */
    @GetMapping("/api/upload/presign")
    public Map<String, Object> info() {
        return Map.of("configured", s3.configured(), "maxBytes", S3Service.MAX_UPLOAD_BYTES, "types", List.copyOf(S3Service.ALLOWED_TYPES.keySet()));
    }

    /** POST /api/upload/presign { contentType, size } → { uploadUrl, key, publicUrl, headers, expiresIn } */
    @PostMapping("/api/upload/presign")
    public S3Service.Presigned presign(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
        if (!s3.configured()) throw ApiException.unavailable("S3 설정이 없어 사진 업로드는 꺼져 있어요");
        DbUser me = auth.requireUser(req, res);
        if (me.blocked()) throw ApiException.forbidden("차단된 계정은 올릴 수 없어요");
        Map<String, Object> b = body == null ? Map.of() : body;
        long size = b.get("size") instanceof Number n ? n.longValue() : 0;
        return s3.presignUpload(me.id(), String.valueOf(b.getOrDefault("contentType", "")), size);
    }
}
