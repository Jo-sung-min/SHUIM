package kr.co.shuim.profile;

import kr.co.shuim.profile.Badges.Counts;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/** 위로 배지 판정: 조건 경계, 선반 순서, 공개되는 정보에 횟수 숫자가 없는지 */
class BadgesTest {
    private static Counts none() { return new Counts(0, 0, 0, false, 0, 0, 0, false); }

    @Test
    void noActivityEarnsNothing() {
        assertTrue(Badges.earned(none()).isEmpty());
    }

    @Test
    void thresholdsAreInclusive() {
        assertEquals(Set.of("first_comfort"), Badges.earned(new Counts(1, 9, 0, false, 0, 0, 9, false)));
        assertEquals(Set.of("first_comfort", "comfort_steady", "cheer_first", "listened"), Badges.earned(new Counts(10, 10, 0, false, 0, 0, 10, false)));
        Set<String> all = Badges.earned(new Counts(50, 100, 10, true, 1, 1, 10, true, true, 5));
        assertEquals(Badges.ALL.size(), all.size(), "모든 조건을 넘으면 모든 배지");
    }

    @Test
    void earnedFollowsShelfOrder() {
        List<String> order = Badges.ALL.stream().map(Badges.Badge::id).toList();
        List<String> got = List.copyOf(Badges.earned(new Counts(1, 0, 1, true, 1, 0, 0, true)));
        assertEquals(order.stream().filter(got::contains).toList(), got);
    }

    @Test
    void idsAreUniqueAndFitTheColumn() {
        Set<String> ids = new HashSet<>();
        for (Badges.Badge b : Badges.ALL) {
            assertTrue(ids.add(b.id()), "중복 id: " + b.id());
            assertTrue(b.id().length() <= 32, "badge_id 컬럼은 32자: " + b.id());
            assertTrue(Badges.byId(b.id()).isPresent());
        }
        assertTrue(Badges.byId("nope").isEmpty());
    }

    @Test
    void namesAndDescriptionsShowNoCounts() {
        // 배지는 이름만 보이고 위로한 횟수는 공개하지 않는다 ("Top 10" 은 랭킹 이름이라 예외)
        for (Badges.Badge b : Badges.ALL) {
            String shown = (b.name() + " " + b.desc()).replace("Top 10", "").replace("10위", "");
            assertFalse(shown.matches(".*\\d.*"), "숫자가 보이면 안 돼: " + b.name() + " / " + b.desc());
        }
    }
}
