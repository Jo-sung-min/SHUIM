package kr.co.shuim.circle;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.CommunityConsentService;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/** 커뮤니티 소로우 API (/api/circles). 사연의 읽기·힘내요·댓글은 기존 /api/community 를 그대로 쓴다 */
@RestController
public class CircleController {
    private final AuthService auth;
    private final CircleService circles;
    private final CommunityConsentService consent;

    public CircleController(AuthService auth, CircleService circles, CommunityConsentService consent) {
        this.auth = auth;
        this.circles = circles;
        this.consent = consent;
    }

    private static String s(Map<String, Object> b, String k) { return b != null && b.get(k) instanceof String str ? str : null; }
    private static Map<String, Object> body(Map<String, Object> b) { return b == null ? Map.of() : b; }

    /** GET /api/circles?kind=&q= — 둘러보기 (멤버 10명 이상) */
    @GetMapping("/api/circles")
    public Map<String, Object> browse(@RequestParam(required = false) String kind, @RequestParam(required = false) String q) {
        return Map.of("circles", circles.browse(kind, q));
    }

    /** GET /api/circles/warm — 이번 주 가장 따뜻한 소로우 (순위만) */
    @GetMapping("/api/circles/warm")
    public Map<String, Object> warm() {
        return Map.of("circles", circles.warmest());
    }

    /** GET /api/circles/mine — 내 소로우(대표 먼저)와 리스닝 중인 소로우 */
    @GetMapping("/api/circles/mine")
    public Map<String, Object> mine(HttpServletRequest req, HttpServletResponse res) {
        return circles.mine(auth.requireUser(req, res));
    }

    /** POST /api/circles { name, slug, kind, intro, joinMode, visibility, domain } — 소로우 열기 (가입한 계정만) */
    @PostMapping("/api/circles")
    public Map<String, Object> create(@RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        consent.requireAccepted(me);
        return circles.create(me, new CircleService.CreateInput(s(b, "name"), s(b, "slug"), s(b, "kind"), s(b, "intro"), s(b, "joinMode"), s(b, "visibility"), s(b, "domain")));
    }

    /** GET /api/circles/{slug} — 소로우 하나 + 나와의 관계 */
    @GetMapping("/api/circles/{slug}")
    public Map<String, Object> detail(@PathVariable String slug, HttpServletRequest req) {
        return circles.detail(auth.currentUser(req).orElse(null), slug);
    }

    /** PUT /api/circles/{slug} { notice?, intro?, visibility?, joinMode?, regenerateInvite? } */
    @PutMapping("/api/circles/{slug}")
    public Map<String, Object> update(@PathVariable String slug, @RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        return circles.update(auth.requireUser(req, res), slug, body(b));
    }

    /** POST /api/circles/{slug}/join { code? } */
    @PostMapping("/api/circles/{slug}/join")
    public Map<String, Object> join(@PathVariable String slug, @RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        consent.requireAccepted(me);
        return circles.join(me, slug, s(b, "code"));
    }

    @PostMapping("/api/circles/{slug}/leave")
    public Map<String, Object> leave(@PathVariable String slug, HttpServletRequest req, HttpServletResponse res) {
        return circles.leave(auth.requireUser(req, res), slug);
    }

    @PostMapping("/api/circles/{slug}/primary")
    public Map<String, Object> primary(@PathVariable String slug, HttpServletRequest req, HttpServletResponse res) {
        return circles.setPrimary(auth.requireUser(req, res), slug);
    }

    /** POST /api/circles/{slug}/follow — 리스닝 켜기/끄기 */
    @PostMapping("/api/circles/{slug}/follow")
    public Map<String, Object> follow(@PathVariable String slug, HttpServletRequest req, HttpServletResponse res) {
        return circles.toggleFollow(auth.requireUser(req, res), slug);
    }

    /** POST /api/circles/{slug}/verify/start { email } — 학교·회사 메일로 인증 코드 보내기 */
    @PostMapping("/api/circles/{slug}/verify/start")
    public Map<String, Object> verifyStart(@PathVariable String slug, @RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        consent.requireAccepted(me);
        return circles.verifyStart(me, slug, s(b, "email"));
    }

    /** POST /api/circles/{slug}/verify/confirm { code } */
    @PostMapping("/api/circles/{slug}/verify/confirm")
    public Map<String, Object> verifyConfirm(@PathVariable String slug, @RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        return circles.verifyConfirm(auth.requireUser(req, res), slug, s(b, "code"));
    }

    /** GET /api/circles/{slug}/members — 소로우지기 */
    @GetMapping("/api/circles/{slug}/members")
    public Map<String, Object> members(@PathVariable String slug, HttpServletRequest req, HttpServletResponse res) {
        return Map.of("members", circles.members(auth.requireUser(req, res), slug));
    }

    /** POST /api/circles/{slug}/members/{userId} { action: approve|remove|keeper|unkeeper } */
    @PostMapping("/api/circles/{slug}/members/{userId}")
    public Map<String, Object> memberAction(@PathVariable String slug, @PathVariable String userId, @RequestBody(required = false) Map<String, Object> b,
                                            HttpServletRequest req, HttpServletResponse res) {
        return Map.of("members", circles.memberAction(auth.requireUser(req, res), slug, userId, s(b, "action")));
    }

    /** POST /api/circles/{slug}/preview { text } — 보내기 전 AI 정리·가림 미리보기 */
    @PostMapping("/api/circles/{slug}/preview")
    public CircleService.Draft preview(@PathVariable String slug, @RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        return circles.preview(auth.requireUser(req, res), slug, s(b, "text"));
    }

    /** POST /api/circles/{slug}/submissions { cat, text } — 사연 보내기 */
    @PostMapping("/api/circles/{slug}/submissions")
    public Map<String, Object> submit(@PathVariable String slug, @RequestBody(required = false) Map<String, Object> b, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        consent.requireAccepted(me);
        return circles.submit(me, slug, s(b, "cat"), s(b, "text"));
    }

    /** GET /api/circles/{slug}/submissions?status=pending|held|done — 소로우지기 검토 큐 */
    @GetMapping("/api/circles/{slug}/submissions")
    public Map<String, Object> queue(@PathVariable String slug, @RequestParam(defaultValue = "pending") String status, HttpServletRequest req, HttpServletResponse res) {
        return Map.of("submissions", circles.queue(auth.requireUser(req, res), slug, status));
    }

    /** POST /api/circles/{slug}/submissions/{id}/draft — AI 정리본 만들기 */
    @PostMapping("/api/circles/{slug}/submissions/{id}/draft")
    public CircleService.Draft draft(@PathVariable String slug, @PathVariable String id, HttpServletRequest req, HttpServletResponse res) {
        return circles.draft(auth.requireUser(req, res), slug, id);
    }

    /** POST /api/circles/{slug}/submissions/{id}/decide { action: publish|hold|reject, text?, reason?, reply? } */
    @PostMapping("/api/circles/{slug}/submissions/{id}/decide")
    public Map<String, Object> decide(@PathVariable String slug, @PathVariable String id, @RequestBody(required = false) Map<String, Object> b,
                                      HttpServletRequest req, HttpServletResponse res) {
        return Map.of("submissions", circles.decide(auth.requireUser(req, res), slug, id, s(b, "action"), s(b, "text"), s(b, "reason"), s(b, "reply")));
    }

    /** POST /api/circles/{slug}/posts/{postId}/hide — 소로우지기가 게시된 사연 가리기/되돌리기 */
    @PostMapping("/api/circles/{slug}/posts/{postId}/hide")
    public Map<String, Object> hide(@PathVariable String slug, @PathVariable String postId, HttpServletRequest req, HttpServletResponse res) {
        return circles.toggleHidden(auth.requireUser(req, res), slug, postId);
    }

    /** GET /api/submissions/mine — 내 사연함 */
    @GetMapping("/api/submissions/mine")
    public Map<String, Object> mySubmissions(HttpServletRequest req, HttpServletResponse res) {
        return Map.of("submissions", circles.mySubmissions(auth.requireUser(req, res)));
    }
}
