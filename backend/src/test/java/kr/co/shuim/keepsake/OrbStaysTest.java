package kr.co.shuim.keepsake;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;

class OrbStaysTest {
    /** 손으로 돌리는 한국 시계 */
    static final class Hand extends Clock {
        Instant now;
        Hand(String start) { now = Instant.parse(start); }
        void pass(long ms) { now = now.plusMillis(ms); }
        @Override public ZoneId getZone() { return ZoneId.of("Asia/Seoul"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @Test
    void tenMinutesOfThirtySecondBeatsFillTheStay() {
        Hand hand = new Hand("2026-11-13T03:00:00Z");
        OrbStays stays = new OrbStays(hand);
        assertEquals(0, stays.beat("u"));
        for (int i = 0; i < 20; i++) { hand.pass(30_000); stays.beat("u"); }
        assertEquals(600_000, stays.stayed("u"));
        assertEquals(0, stays.stayed("someone-else"));
    }

    @Test
    void fastBeatsCannotOutrunTheClockAndLongSilencesDoNotCount() {
        Hand hand = new Hand("2026-11-13T03:00:00Z");
        OrbStays stays = new OrbStays(hand);
        stays.beat("u");
        for (int i = 0; i < 100; i++) { hand.pass(100); stays.beat("u"); }
        assertEquals(10_000, stays.stayed("u"));
        hand.pass(60_000); // 조금 늦은 신호는 45초까지만
        assertEquals(10_000 + OrbStays.MAX_STEP_MS, stays.beat("u"));
        hand.pass(OrbStays.GAP_MS + 1); // 가려진 탭: 세지 않는다
        assertEquals(10_000 + OrbStays.MAX_STEP_MS, stays.beat("u"));
        hand.pass(30_000);
        assertEquals(40_000 + OrbStays.MAX_STEP_MS, stays.beat("u"));
    }

    @Test
    void theStayAndTheFoundFlagStartOverAtKoreanMidnight() {
        Hand hand = new Hand("2026-11-13T14:59:00Z"); // 한국 23:59
        OrbStays stays = new OrbStays(hand);
        stays.beat("u");
        hand.pass(30_000);
        assertEquals(30_000, stays.beat("u"));
        assertNull(stays.found("u"));
        stays.remember("u", true);
        assertEquals(Boolean.TRUE, stays.found("u"));
        assertEquals(30_000, stays.stayed("u"));
        hand.pass(40_000); // 한국 00:00:10, 새 날
        assertEquals("2026-11-14", stays.today().toString());
        assertEquals(0, stays.stayed("u"));
        assertNull(stays.found("u"));
        assertEquals(0, stays.beat("u"));
        hand.pass(30_000);
        assertEquals(30_000, stays.beat("u"));
    }

    @Test
    void rememberingBeforeAnyBeatKeepsTheAnswerForTheDay() {
        Hand hand = new Hand("2026-11-13T03:00:00Z");
        OrbStays stays = new OrbStays(hand);
        stays.remember("u", false);
        assertEquals(Boolean.FALSE, stays.found("u"));
        hand.pass(30_000); // 보관함만 열어 본 시간은 머문 시간이 아니다
        assertEquals(0, stays.beat("u"));
        hand.pass(30_000);
        assertEquals(30_000, stays.beat("u"));
        assertEquals(Boolean.FALSE, stays.found("u"));
    }
}
