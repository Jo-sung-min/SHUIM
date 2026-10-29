package kr.co.shuim.circle;

import org.junit.jupiter.api.Test;

import java.util.Random;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class CircleLogicTest {
    @Test
    void namesGetTheSorowSuffixAndKeysIgnoreSpaces() {
        assertEquals("고려대 소로우", CircleLogic.normalizeName("  고려대 "));
        assertEquals("삼성전자 소로우", CircleLogic.normalizeName("삼성전자 소로우"));
        assertNull(CircleLogic.normalizeName(" "));
        assertNull(CircleLogic.normalizeName("가".repeat(40)));
        assertEquals(CircleLogic.nameKey("고려대 소로우"), CircleLogic.nameKey("고려대소로우"));
    }

    @Test
    void slugsAndDomainsAreStrict() {
        assertEquals("korea-univ", CircleLogic.normalizeSlug("Korea-Univ"));
        assertNull(CircleLogic.normalizeSlug("-bad"));
        assertNull(CircleLogic.normalizeSlug("고려대"));
        assertNull(CircleLogic.normalizeSlug("ab"));
        assertEquals("korea.ac.kr", CircleLogic.normalizeDomain("@Korea.ac.kr"));
        assertNull(CircleLogic.normalizeDomain("localhost"));
    }

    @Test
    void emailMustBelongToTheDomainOrItsSubdomain() {
        assertTrue(CircleLogic.emailMatchesDomain("a@korea.ac.kr", "korea.ac.kr"));
        assertTrue(CircleLogic.emailMatchesDomain(" A@Student.Korea.ac.kr ", "korea.ac.kr"));
        assertFalse(CircleLogic.emailMatchesDomain("a@notkorea.ac.kr", "korea.ac.kr"));
        assertFalse(CircleLogic.emailMatchesDomain("a@korea.ac.kr.evil.com", "korea.ac.kr"));
        assertFalse(CircleLogic.emailMatchesDomain("not-an-email", "korea.ac.kr"));
        assertEquals(CircleLogic.emailHash("A@korea.ac.kr"), CircleLogic.emailHash("a@korea.ac.kr "));
    }

    @Test
    void maskHidesContactsNumbersAndTitledNames() {
        CircleLogic.Masked m = CircleLogic.mask("김철수 교수님이 010-1234-5678 로 연락하래요. 학번 2021123456, 메일 kim@korea.ac.kr 이영희 씨도");
        assertFalse(m.text().contains("김철수"));
        assertFalse(m.text().contains("1234"));
        assertFalse(m.text().contains("2021123456"));
        assertFalse(m.text().contains("kim@korea.ac.kr"));
        assertFalse(m.text().contains("이영희"));
        assertTrue(m.text().contains("○○교수님"));
        assertTrue(m.found().containsAll(java.util.List.of("전화번호", "메일 주소", "학번·사번 같은 번호", "실명으로 보이는 이름")));
        assertTrue(CircleLogic.mask("오늘 너무 힘들었어요").found().isEmpty());
    }

    @Test
    void tidyCollapsesSpacesAndBlankLines() {
        assertEquals("안녕 하세요\n\n둘째", CircleLogic.tidy("  안녕   하세요 \r\n\r\n\r\n\r\n 둘째 "));
    }

    @Test
    void membersOnlyAndDelayedPostsStayHidden() {
        long now = 1_000;
        assertTrue(CircleLogic.canSee(null, null, Set.of(), false, false, 5_000, now));
        assertTrue(CircleLogic.canSee("c1", "public", Set.of(), false, false, 500, now));
        assertFalse(CircleLogic.canSee("c1", "public", Set.of(), false, false, 2_000, now));
        assertTrue(CircleLogic.canSee("c1", "public", Set.of(), false, true, 2_000, now));
        assertFalse(CircleLogic.canSee("c1", "members", Set.of(), false, false, 500, now));
        assertTrue(CircleLogic.canSee("c1", "members", Set.of("c1"), false, false, 500, now));
        assertTrue(CircleLogic.canSee("c1", "members", Set.of(), true, false, 2_000, now));
    }

    @Test
    void publishDelayStaysInRange() {
        Random r = new Random(1);
        for (int i = 0; i < 500; i++) {
            int d = CircleLogic.publishDelayMinutes(r);
            assertTrue(d >= 10 && d <= 90);
        }
    }
}
