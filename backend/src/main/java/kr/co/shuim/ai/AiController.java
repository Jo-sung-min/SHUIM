package kr.co.shuim.ai;

import jakarta.servlet.http.HttpServletRequest;
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

    /** 위로 지침 없이 (시험용) */
    public AiController(TodayService today, SummarizeService summarize, PolicyConsentService policies) {
        this(today, summarize, policies, null);
    }

    @Autowired
    public AiController(TodayService today, SummarizeService summarize, PolicyConsentService policies, MbtiComfortService comfort) {
        this.today = today;
        this.summarize = summarize;
        this.policies = policies;
        this.comfort = comfort;
    }

    /** POST /api/today — mode: briefing | praise | love | review */
    @PostMapping("/api/today")
    public Map<String, Object> today(@RequestBody TodayDtos.Request body, HttpServletRequest req) {
        policies.requireAiConsent(req);
        // 칭찬받기·사랑받기는 이 계정이 프로필에 적어 둔 MBTI 의 위로 방향을 지침으로 받는다 (없으면 지금까지와 같다)
        boolean moment = body != null && ("praise".equals(body.mode()) || "love".equals(body.mode()));
        MbtiComfortService.Guide guide = moment && comfort != null ? comfort.guideFor(req).orElse(null) : null;
        return guide == null ? today.run(body) : today.run(body, guide);
    }

    /** POST /api/summarize — 최근 N일 흐름 정리 */
    @PostMapping("/api/summarize")
    public Map<String, Object> summarize(@RequestBody SummarizeService.Request body, HttpServletRequest req) {
        policies.requireAiConsent(req);
        return summarize.run(body);
    }
}
