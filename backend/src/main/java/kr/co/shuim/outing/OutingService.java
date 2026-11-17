package kr.co.shuim.outing;

import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class OutingService {
    private final JdbcClient jdbc;
    private final Clock clock;
    @Autowired public OutingService(JdbcClient jdbc) { this(jdbc, Clock.system(OutingRules.ZONE)); }
    OutingService(JdbcClient jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock.withZone(OutingRules.ZONE); }
    record Progress(int days, LocalDate lastReward, String token, String action, Instant started, String completed) {}
    public record Memory(String day, String actionId, String note) {}
    public record Companion(String name, String appearance) {}
    public record View(int days, int affinity, int xp, int level, String date, boolean rewardedToday,
                       List<String> unlocked, List<String> completedToday, List<Memory> memories,
                       int rewardAffinity, int rewardXp, Companion companion) {}
    public record Session(String token, String actionId, long readyAt, long serverTime) {}
    public record StartInput(String actionId) {}
    public record CompleteInput(String token, String note) {}

    private Progress lock(String uid) {
        jdbc.sql("INSERT INTO outing_progress(user_id) VALUES (?) ON CONFLICT DO NOTHING").param(uid).update();
        return jdbc.sql("SELECT * FROM outing_progress WHERE user_id=? FOR UPDATE").param(uid).query((rs, i) ->
            new Progress(rs.getInt("days"), rs.getObject("last_reward_date", LocalDate.class),
                rs.getString("active_token"), rs.getString("active_action"),
                rs.getTimestamp("active_started_at") == null ? null : rs.getTimestamp("active_started_at").toInstant(),
                rs.getString("last_completed_token"))).single();
    }
    private View view(String uid, Progress p, boolean rewarded) {
        LocalDate today = LocalDate.now(clock);
        List<String> unlocked = OutingRules.ACTIVITIES.stream()
            .filter(a -> OutingRules.unlocked(a, p.days() * 10, p.days() * 20)).map(OutingRules.Activity::id).toList();
        List<String> completed = jdbc.sql("SELECT action_id FROM outing_memories WHERE user_id=? AND day=? ORDER BY created_at")
            .param(uid).param(today).query(String.class).list();
        List<Memory> memories = jdbc.sql("SELECT day, action_id, note FROM outing_memories WHERE user_id=? ORDER BY created_at DESC, action_id LIMIT 30")
            .param(uid).query((rs, i) -> new Memory(rs.getString("day"), rs.getString("action_id"), rs.getString("note"))).list();
        Companion companion = jdbc.sql("SELECT name, appearance FROM user_pets WHERE user_id=?").param(uid)
            .query((rs, i) -> new Companion(rs.getString("name"), rs.getString("appearance"))).optional().orElse(new Companion("모루", "moru"));
        return new View(p.days(), p.days() * 10, p.days() * 20, OutingRules.level(p.days()), today.toString(),
            today.equals(p.lastReward()), unlocked, completed, memories, rewarded ? 10 : 0, rewarded ? 20 : 0, companion);
    }
    @Transactional public View get(String uid) { return view(uid, lock(uid), false); }
    @Transactional public Session start(String uid, StartInput input) {
        var action = OutingRules.activity(input == null ? null : input.actionId());
        var p = lock(uid);
        if (!OutingRules.unlocked(action, p.days() * 10, p.days() * 20))
            throw ApiException.forbidden("함께한 " + action.day() + "일에 열리는 활동이에요.");
        Instant now = clock.instant();
        // Retrying a timed-out start never resets an already running activity.
        if (action.id().equals(p.action()) && p.token() != null && p.started() != null
                && !now.isBefore(p.started()) && now.isBefore(p.started().plusSeconds(1800)))
            return new Session(p.token(), action.id(), p.started().plusSeconds(action.seconds()).toEpochMilli(), now.toEpochMilli());
        String token = UUID.randomUUID().toString();
        jdbc.sql("UPDATE outing_progress SET active_token=?, active_action=?, active_started_at=? WHERE user_id=?")
            .param(token).param(action.id()).param(OffsetDateTime.ofInstant(now, ZoneOffset.UTC)).param(uid).update();
        return new Session(token, action.id(), now.plusSeconds(action.seconds()).toEpochMilli(), now.toEpochMilli());
    }
    @Transactional public View complete(String uid, CompleteInput input) {
        if (input == null || input.token() == null || input.token().length() != 36)
            throw ApiException.badRequest("외출을 다시 시작해 주세요.");
        String note = OutingRules.note(input.note());
        var p = lock(uid);
        // Lost responses can be retried safely, including after the midnight boundary.
        if (input.token().equals(p.completed())) return view(uid, p, false);
        if (!input.token().equals(p.token())) throw ApiException.gone("다른 외출이 시작됐어요. 이 활동을 다시 골라 주세요.");
        var action = OutingRules.activity(p.action());
        if (!OutingRules.unlocked(action, p.days() * 10, p.days() * 20)) throw ApiException.forbidden("아직 열리지 않은 활동이에요.");
        OutingRules.requireReady(action, p.started(), clock.instant());
        LocalDate today = LocalDate.now(clock);
        var growth = OutingRules.complete(p.days(), p.lastReward(), today);
        jdbc.sql("INSERT INTO outing_memories(user_id,day,action_id,note) VALUES (?,?,?,?) ON CONFLICT (user_id,day,action_id) DO UPDATE SET note=CASE WHEN EXCLUDED.note<>'' THEN EXCLUDED.note ELSE outing_memories.note END")
            .param(uid).param(today).param(action.id()).param(note).update();
        jdbc.sql("UPDATE outing_progress SET days=?, last_reward_date=?, active_token=NULL, active_action=NULL, active_started_at=NULL, last_completed_token=? WHERE user_id=?")
            .param(growth.days()).param(growth.lastRewardDate()).param(input.token()).param(uid).update();
        return view(uid, new Progress(growth.days(), growth.lastRewardDate(), null, null, null, input.token()), growth.rewarded());
    }
}
