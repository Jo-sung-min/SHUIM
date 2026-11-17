package kr.co.shuim.ai;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.auth.PolicyConsentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 개인 기록은 브라우저가 들고 있는 것(로그인 계정은 /api/records 에서 받은 것)을 요청 본문으로 받아 그 자리에서 정리하고, 여기서는 저장하지 않는다 */
@RestController
public class AiController {
    private final TodayService today;
    private final SummarizeService summarize;
    private final PolicyConsentService policies;
    private final MbtiComfortService comfort;
    private final AuthService auth;
    private final AiQuota quota;

    /** 위로 지침·관리자 확인·한도 없이 (시험용) */
    public AiController(TodayService today, SummarizeService summarize, PolicyConsentService policies) {
        this(today, summarize, policies, null, null, null);
    }

    /** 관리자 확인·한도 없이 (시험용) */
    public AiController(TodayService today, SummarizeService summarize, PolicyConsentService policies, MbtiComfortService comfort) {
        this(today, summarize, policies, comfort, null, null);
    }

    @Autowired
    public AiController(TodayService today, SummarizeService summarize, PolicyConsentService policies, MbtiComfortService comfort,
                        AuthService auth, AiQuota quota) {
        this.today = today;
        this.summarize = summarize;
        this.policies = policies;
        this.comfort = comfort;
        this.auth = auth;
        this.quota = quota;
    }

    /** POST /api/today — mode: briefing | praise | love | review */
    @PostMapping("/api/today")
    public Map<String, Object> today(@RequestBody TodayDtos.Request body, HttpServletRequest req) {
        policies.requireAiConsent(req);
        DbUser user = currentUser(req);
        if (quota != null) quota.acquire("today", quotaKey(user, req), user == null || user.anonymous());
        // 작성 지침(prompts) 덮어쓰기는 관리자 기기의 미리보기용이다. 관리자가 아니면 오류 없이 버리고 서버 기본 지침을 쓴다
        TodayDtos.Request safe = body == null || (auth != null && auth.isAdmin(user)) ? body : body.withoutPrompts();
        // 칭찬받기·사랑받기는 이 계정이 프로필에 적어 둔 MBTI 의 위로 방향을 지침으로 받는다 (없으면 지금까지와 같다)
        boolean moment = safe != null && ("praise".equals(safe.mode()) || "love".equals(safe.mode()));
        MbtiComfortService.Guide guide = moment && comfort != null ? comfort.guideFor(req).orElse(null) : null;
        return today.run(safe, guide, user == null ? null : user.id());
    }

    /** POST /api/summarize — 최근 N일 흐름 정리 */
    @PostMapping("/api/summarize")
    public Map<String, Object> summarize(@RequestBody SummarizeService.Request body, HttpServletRequest req) {
        policies.requireAiConsent(req);
        DbUser user = currentUser(req);
        if (quota != null) quota.acquire("summarize", quotaKey(user, req), user == null || user.anonymous());
        return summarize.run(body, user == null ? null : user.id());
    }

    private DbUser currentUser(HttpServletRequest req) {
        return auth == null ? null : auth.currentUser(req).orElse(null);
    }

    /** 동의 확인을 지나왔다면 세션이 있다. 그래도 없으면 접속 주소로 센다 */
    private static String quotaKey(DbUser user, HttpServletRequest req) {
        return user != null ? "u:" + user.id() : "ip:" + req.getRemoteAddr();
    }
}
