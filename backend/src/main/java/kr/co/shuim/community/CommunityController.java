package kr.co.shuim.community;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.Model.Store;
import kr.co.shuim.community.Model.Target;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class CommunityController {
    private final AuthService auth;
    private final CommunityService community;
    private final CommunityConsentService consent;

    public CommunityController(AuthService auth, CommunityService community, CommunityConsentService consent) {
        this.auth = auth;
        this.community = community;
        this.consent = consent;
    }

    /** GET /api/community — 현재 유저(없으면 익명 유저 생성) 기준의 커뮤니티 전체 상태 */
    @GetMapping("/api/community")
    public Store get(HttpServletRequest req, HttpServletResponse res) {
        return community.loadStore(auth.requireUser(req, res));
    }

    private static Target target(Map<String, Object> b) {
        return new Target(String.valueOf(b.get("kind")), b.get("id") == null ? "" : String.valueOf(b.get("id")));
    }

    private static String str(Map<String, Object> b, String k) {
        Object v = b.get(k);
        return v instanceof String s ? s : "";
    }

    /** POST /api/community/{action} — 변경 후 최신 상태(Store)를 돌려준다 */
    @PostMapping("/api/community/{action}")
    public Store post(@PathVariable String action, @RequestBody(required = false) Map<String, Object> body,
                      HttpServletRequest req, HttpServletResponse res) {
        Map<String, Object> b = body == null ? Map.of() : body;
        DbUser me = auth.requireUser(req, res);
        if (java.util.Set.of("post.create", "comment.create", "feed.create", "bio", "donate").contains(action)) consent.requireAccepted(me);
        return switch (action) {
            case "post.create" -> community.createPost(me, b.get("cat"), b.get("text"), b.get("images"));
            case "post.delete" -> community.deletePost(me, str(b, "id"));
            case "comment.create" -> community.addComment(me, str(b, "postId"), b.get("text"), b.get("parentId") instanceof String p ? p : null);
            case "comment.delete" -> community.deleteComment(me, str(b, "id"));
            case "cheer" -> community.toggleCheer(me, target(b));
            case "report" -> community.report(me, target(b), b.get("reason"));
            case "feed.create" -> community.createFeedPost(me, b.get("text"), b.get("bg"), b.get("title"), b.containsKey("images") ? b.get("images") : b.get("image"), b.get("pages"), b.get("clientRequestId"));
            case "feed.delete" -> community.deleteFeedPost(me, str(b, "id"));
            case "bio" -> community.updateBio(me, b.get("bio"));
            case "follow" -> community.toggleFollow(me, str(b, "creatorId"));
            case "save" -> community.toggleSave(me, str(b, "feedId"));
            case "donate" -> community.donate(me, b.get("amount"), b.get("message"));
            case "weekly.refresh" -> community.refreshCurrentWeek(me);
            case "admin.hide", "admin.dismiss", "admin.block", "admin.unblock" -> {
                if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 할 수 있어요");
                yield switch (action) {
                    case "admin.hide" -> community.adminHide(me, target(b));
                    case "admin.dismiss" -> community.adminDismiss(me, target(b));
                    case "admin.block" -> community.adminBlock(me, str(b, "userId"), b.get("reason"));
                    default -> community.adminUnblock(me, str(b, "userId"));
                };
            }
            default -> throw ApiException.notFound("알 수 없는 동작: " + action);
        };
    }
}
