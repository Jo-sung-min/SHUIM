package kr.co.shuim.community;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class CommunityConsentController {
    private final AuthService auth;
    private final CommunityConsentService consent;
    public CommunityConsentController(AuthService auth, CommunityConsentService consent) { this.auth = auth; this.consent = consent; }

    @PostMapping("/api/community/consent")
    public Map<String, Object> accept(@RequestBody Map<String, String> body, HttpServletRequest req, HttpServletResponse res) {
        consent.accept(auth.requireUser(req, res), body.get("version"));
        return Map.of("ok", true, "version", CommunityConsentService.CURRENT_VERSION);
    }
}
