package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class AccountController {
    private final AuthService auth;
    private final AccountDeletionService accounts;

    public AccountController(AuthService auth, AccountDeletionService accounts) {
        this.auth = auth;
        this.accounts = accounts;
    }

    @DeleteMapping(value = "/api/auth/account", consumes = "application/json")
    public Map<String, Object> delete(@RequestBody Map<String, String> body, HttpServletRequest req, HttpServletResponse res) {
        // Never call requireUser: deletion must not create a replacement anonymous account.
        DbUser user = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인이 필요해요"));
        if (!user.id().equals(body.get("expectedUserId"))) {
            throw new ApiException(409, "로그인 계정이 변경됐어요. 화면을 새로고침하고 삭제할 계정을 다시 확인해 주세요.");
        }
        accounts.delete(user, body.get("confirmation"));
        auth.signOut(req, res);
        return Map.of("ok", true);
    }
}
