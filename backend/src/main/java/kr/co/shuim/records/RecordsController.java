package kr.co.shuim.records;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.records.RecordsDtos.*;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 개인 기록 API. 로그인한 계정만 쓸 수 있고(익명 유저는 401, 익명 행을 새로 만들지도 않는다) 익명 상태의 기록은 브라우저에만 남는다.
 * 변경 요청은 저장 후 아무것도 돌려주지 않는다 — 화면이 이미 최신 상태를 들고 있다.
 */
@RestController
@RequestMapping("/api/records")
public class RecordsController {
    private final AuthService auth;
    private final RecordsService records;

    public RecordsController(AuthService auth, RecordsService records) {
        this.auth = auth;
        this.records = records;
    }

    private DbUser me(HttpServletRequest req) {
        return auth.currentUser(req).filter(u -> !u.anonymous())
            .orElseThrow(() -> ApiException.unauthorized("로그인이 필요해요"));
    }

    /** GET /api/records — 기록·오늘 한 일·메모·목표·일정·사용자 카테고리·카드 순서 전체 */
    @GetMapping
    public Snapshot all(HttpServletRequest req) {
        return records.load(me(req).id());
    }

    /** PUT /api/records — 본문에 있는 부분만 통째로 교체 */
    @PutMapping
    public Map<String, Boolean> replace(@RequestBody Snapshot body, HttpServletRequest req) {
        records.replace(me(req).id(), body);
        return Map.of("ok", true);
    }

    /** POST /api/records/import — 게스트 데이터를 계정의 비어 있는 부분에만 넣는다 */
    @PostMapping("/import")
    public Map<String, Object> importGuest(@RequestBody Snapshot body, HttpServletRequest req) {
        List<String> filled = records.importIfEmpty(me(req).id(), body);
        return Map.of("ok", true, "filled", filled);
    }

    /** DELETE /api/records — 이 계정의 개인 기록 전체 삭제 */
    @DeleteMapping
    public Map<String, Boolean> clear(HttpServletRequest req) {
        records.clear(me(req).id());
        return Map.of("ok", true);
    }

    /** PUT /api/records/journal/{date} { record?: {cat: {score, delta?, note}}, did?: string[] } */
    @PutMapping("/journal/{date}")
    public Map<String, Boolean> day(@PathVariable String date, @RequestBody(required = false) DayInput body, HttpServletRequest req) {
        LocalDate d = RecordsLogic.date(date);
        if (d == null) throw ApiException.badRequest("날짜는 YYYY-MM-DD 로 보내요");
        records.saveDay(me(req).id(), d, body == null ? new DayInput(null, null) : body);
        return Map.of("ok", true);
    }

    /** PUT /api/records/memos [Memo] — 메모 목록 교체 */
    @PutMapping("/memos")
    public Map<String, Boolean> memos(@RequestBody List<Memo> body, HttpServletRequest req) {
        records.replaceMemos(me(req).id(), body);
        return Map.of("ok", true);
    }

    /** PUT /api/records/goals [Goal] — 목표(단계 포함) 목록 교체 */
    @PutMapping("/goals")
    public Map<String, Boolean> goals(@RequestBody List<Goal> body, HttpServletRequest req) {
        records.replaceGoals(me(req).id(), body);
        return Map.of("ok", true);
    }

    /** PUT /api/records/schedule [ScheduleItem] — 일정 목록 교체 */
    @PutMapping("/schedule")
    public Map<String, Boolean> schedule(@RequestBody List<ScheduleItem> body, HttpServletRequest req) {
        records.replaceSchedule(me(req).id(), body);
        return Map.of("ok", true);
    }

    /** PUT /api/records/categories { categories?: [Category], order?: [id] } */
    @PutMapping("/categories")
    public Map<String, Boolean> categories(@RequestBody CategoriesInput body, HttpServletRequest req) {
        records.saveCategories(me(req).id(), body.categories(), body.order());
        return Map.of("ok", true);
    }
}
