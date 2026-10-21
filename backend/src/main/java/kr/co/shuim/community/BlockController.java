package kr.co.shuim.community;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/blocks")
public class BlockController {
    private final AuthService auth;
    private final BlockService blocks;
    public BlockController(AuthService auth, BlockService blocks) { this.auth = auth; this.blocks = blocks; }

    private DbUser current(HttpServletRequest req) {
        return auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인이 필요해요"));
    }

    @GetMapping
    public Map<String, List<String>> list(HttpServletRequest req) {
        return Map.of("userIds", blocks.blockedIds(current(req).id()));
    }

    @PostMapping
    public Map<String, List<String>> block(@RequestBody Map<String, String> body, HttpServletRequest req) {
        return Map.of("userIds", blocks.block(current(req), body.getOrDefault("userId", "")));
    }

    @DeleteMapping("/{userId}")
    public Map<String, List<String>> unblock(@PathVariable String userId, HttpServletRequest req) {
        return Map.of("userIds", blocks.unblock(current(req), userId));
    }
}
