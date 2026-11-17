package kr.co.shuim.circle;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;

/** 사연 가리기 정규식이 긴(악의적인) 입력에서도 빨리 끝나고, 본문은 정규식·AI 전에 상한으로 잘리는지 */
class CircleMaskInputTest {
    @Test
    void mailMaskStaysLinearOnAdversarialInput() {
        // 예전 식([..]+@[..]+\.[..]{2,})은 이런 입력에서 시작 위치마다 끝까지 다시 훑어 이차 시간이 걸렸다
        String noAt = "a".repeat(200_000);
        String manyAt = "a@".repeat(100_000);
        String dots = "a@" + "a.".repeat(100_000) + "1";
        String mixed = ("abc.def+" + "x".repeat(70) + "@").repeat(2_000);
        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            CircleLogic.mask(noAt);
            CircleLogic.mask(manyAt);
            CircleLogic.mask(dots);
            CircleLogic.mask(mixed);
            CircleLogic.tidy(" ".repeat(200_000) + "x");
        });
    }

    @Test
    void mailIsStillMasked() {
        CircleLogic.Masked m = CircleLogic.mask("연락은 hong.gil-dong+1@example.co.kr 로 주세요");
        assertEquals("연락은 ○○○@○○○ 로 주세요", m.text());
        assertTrue(m.found().contains("메일 주소"));
        CircleLogic.Masked k = CircleLogic.mask("메일은test@sorow.kr이에요");
        assertEquals("메일은○○○@○○○이에요", k.text());
    }

    @Test
    void storyIsClippedBeforeMasking() {
        assertEquals("", CircleLogic.clipStory(null));
        assertEquals(CircleLogic.STORY_MAX, CircleLogic.clipStory("가".repeat(500_000)).length());
        assertEquals("짧은 사연", CircleLogic.clipStory("짧은 사연"));
    }

    @Test
    void localDraftNeverExceedsTheCap() {
        var service = new CircleService(null, null, null, null, null);
        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            CircleService.Draft d = service.localDraft("a@".repeat(300_000));
            assertTrue(d.text().length() <= CircleLogic.STORY_MAX + 32);
            assertEquals("local", d.source());
        });
    }
}
