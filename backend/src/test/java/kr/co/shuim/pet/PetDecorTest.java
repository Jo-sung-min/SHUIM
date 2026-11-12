package kr.co.shuim.pet;

import org.junit.jupiter.api.Test;
import java.util.HashSet;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class PetDecorTest {
    @Test void catalogIdsAreUniqueAndEveryKindIsKnown() {
        var ids = new HashSet<String>();
        var kinds = Set.of("wall", "hang", "soft", "plant", "light", "small", "floor");
        for (var item : PetDecor.ITEMS) {
            assertTrue(ids.add(item.id()), item.id());
            assertTrue(kinds.contains(item.kind()), item.id());
            assertTrue(item.cost() > 0 && item.id().length() <= 24, item.id());
        }
        assertEquals(36, PetDecor.ITEMS.size());
        // V47 에서 팔던 열두 점은 그대로 남는다 (이미 산 사람의 가구)
        for (var old : Set.of("frame", "clock", "wreath", "ivy", "mobile", "lantern", "heart", "bear", "yarn", "monstera", "mushroom", "books"))
            assertTrue(ids.contains(old), old);
    }
    @Test void unknownFurnitureIsRejectedAndPositionsStayOnScreen() {
        assertEquals("rug", PetDecor.item("rug").id());
        assertThrows(Exception.class, () -> PetDecor.item("sofa"));
        assertThrows(Exception.class, () -> PetDecor.item(null));
        assertEquals(PetDecor.X_MIN, PetDecor.clampX(-50));
        assertEquals(PetDecor.X_MAX, PetDecor.clampX(999));
        assertEquals(240, PetDecor.clampX(240));
        assertEquals(PetDecor.Y_MIN, PetDecor.clampY(0));
        assertEquals(PetDecor.Y_MAX, PetDecor.clampY(700));
    }
}
