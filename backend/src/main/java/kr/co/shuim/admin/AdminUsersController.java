package kr.co.shuim.admin;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class AdminUsersController {
    private final AuthService auth;
    private final AdminUsersService users;

    public AdminUsersController(AuthService auth, AdminUsersService users) { this.auth = auth; this.users = users; }
    public record MemberTypeBody(String memberType) {}

    private void requireAdmin(HttpServletRequest request) {
        if (!auth.isAdmin(auth.currentUser(request).orElse(null)))
            throw ApiException.forbidden("관리자만 가입 사용자를 확인하고 설정할 수 있어요");
    }

    @GetMapping("/api/admin/users")
    public ResponseEntity<AdminUsersService.Page> list(@RequestParam(defaultValue = "") String q,
                                       @RequestParam(defaultValue = "0") String page, HttpServletRequest request) {
        requireAdmin(request);
        int number;
        try { number = Integer.parseInt(page); }
        catch (NumberFormatException ignored) { throw ApiException.badRequest("목록의 페이지를 다시 확인해 주세요"); }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(users.list(q, number));
    }

    @PatchMapping("/api/admin/users/{id}/member-type")
    public ResponseEntity<Map<String, AdminUsersService.User>> memberType(@PathVariable String id,
            @RequestBody(required = false) MemberTypeBody body, HttpServletRequest request) {
        requireAdmin(request);
        if (body == null) throw ApiException.badRequest("회원 유형을 선택해 주세요");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("user", users.setMemberType(id, body.memberType())));
    }
}
