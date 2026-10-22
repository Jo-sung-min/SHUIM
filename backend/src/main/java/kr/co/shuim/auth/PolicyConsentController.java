package kr.co.shuim.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.config.ApiException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import java.util.Objects;

@RestController
public class PolicyConsentController {
    private final AuthService auth;
    private final PolicyConsentService policies;

    public PolicyConsentController(AuthService auth, PolicyConsentService policies) {
        this.auth = auth;
        this.policies = policies;
    }

    public record Request(String signupConsentVersion, Boolean aiDisclosureAccepted,
                          @JsonProperty(required = true) String expectedUserId) {}

    @GetMapping("/api/auth/consent")
    public PolicyConsentService.State get(HttpServletRequest req) {
        return policies.state(auth.currentUser(req).orElse(null));
    }

    @PostMapping("/api/auth/consent")
    @Transactional
    public PolicyConsentService.State post(@RequestBody Request body, HttpServletRequest req, HttpServletResponse res) {
        policies.validateVersion(body.signupConsentVersion());
        if (body.aiDisclosureAccepted() == null) throw ApiException.badRequest("AI 정보 제공 동의 여부를 선택해 주세요.");
        DbUser current = auth.currentUser(req).orElse(null);
        if (!Objects.equals(body.expectedUserId(), current == null ? null : current.id())) {
            throw new ApiException(409, "다른 탭에서 계정이 변경되었어요. 안내를 다시 확인한 뒤 동의해 주세요.");
        }
        DbUser user = current == null ? auth.requireUser(req, res) : current;
        return policies.accept(user, body.signupConsentVersion(), body.aiDisclosureAccepted());
    }
}
