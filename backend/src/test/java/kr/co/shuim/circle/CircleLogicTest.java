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
    void groupLabelsAreShortPlainAndMergeBySpacing() {
        assertEquals("캠핑하는 중", CircleLogic.normalizeGroupLabel("  캠핑하는   중 "));
        assertEquals("사랑·혼자", CircleLogic.normalizeGroupLabel("사랑 ㆍ 혼자"));
        assertEquals("캠핑", CircleLogic.normalizeGroupLabel("캠핑 소로우"));
        assertEquals("K-POP", CircleLogic.normalizeGroupLabel("K-POP"));
        assertEquals(CircleLogic.groupKey("K-POP"), CircleLogic.groupKey("kpop"));
        assertNull(CircleLogic.normalizeGroupLabel("-캠핑"));
        assertNull(CircleLogic.normalizeGroupLabel("가"));
        assertNull(CircleLogic.normalizeGroupLabel("가".repeat(11)));
        assertNull(CircleLogic.normalizeGroupLabel("123"));
        assertNull(CircleLogic.normalizeGroupLabel("·캠핑"));
        assertNull(CircleLogic.normalizeGroupLabel("캠핑!!"));
        assertEquals(CircleLogic.groupKey("사랑·혼자"), CircleLogic.groupKey("사랑 혼자"));
        assertEquals("즐기는중", CircleLogic.groupKey("즐기는 중"));
        assertEquals(CircleLogic.groupKey("K pop"), CircleLogic.groupKey("kpop"));
        assertTrue(CircleLogic.isGroupId("enjoy"));
        assertTrue(CircleLogic.isGroupId(CircleLogic.newGroupId(new Random(1))));
        assertFalse(CircleLogic.isGroupId("캠핑"));
        assertFalse(CircleLogic.isGroupId("a".repeat(13)));
    }

    @Test
    void offensiveAndAffiliationNamesAreRefused() {
        assertTrue(CircleLogic.offensive("시 1 발"));
        assertTrue(CircleLogic.offensive("ㅅㅂ 모임"));
        assertTrue(CircleLogic.offensive("Fuck"));
        assertFalse(CircleLogic.offensive("새끼 고양이"));
        assertFalse(CircleLogic.offensive("시바견 산책"));
        assertFalse(CircleLogic.offensive("보지 않아도 돼"));
        assertFalse(CircleLogic.offensive("메갈로돈"));
        assertFalse(CircleLogic.offensive(null));
        assertTrue(CircleLogic.affiliationLabel("고려 대학교"));
        assertTrue(CircleLogic.affiliationLabel("한빛 초등학교"));
        assertFalse(CircleLogic.affiliationLabel("대학원생"));
        assertFalse(CircleLogic.affiliationLabel("자취하는 중"));
    }

    @Test
    void iconsAcceptLegacyIdsAndListedFluentNamesOnly() {
        assertEquals("coffee", CircleLogic.normalizeIcon("coffee"));
        assertEquals("fl:food_cake", CircleLogic.normalizeIcon("fl:food_cake"));
        assertNull(CircleLogic.normalizeIcon("fl:not_a_real_icon"));
        assertNull(CircleLogic.normalizeIcon("fl:../../etc"));
        assertNull(CircleLogic.normalizeIcon("food_cake"));
        assertNull(CircleLogic.normalizeIcon(null));
    }

    @Test
    void reservedSlugsCollideWithRoutes() {
        assertNull(CircleLogic.normalizeSlug("groups"));
        assertNull(CircleLogic.normalizeSlug("Warm"));
        assertNull(CircleLogic.normalizeSlug("new"));
        assertEquals("groups-2", CircleLogic.normalizeSlug("groups-2"));
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
