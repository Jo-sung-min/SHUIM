package kr.co.shuim.pet;

import org.junit.jupiter.api.Test;
import java.util.HashSet;
import static org.junit.jupiter.api.Assertions.*;

class PetDecorTest {
    @Test void everySlotKindHasFurnitureAndIdsAreUnique() {
        var ids = new HashSet<String>();
        for (var item : PetDecor.ITEMS) {
            assertTrue(ids.add(item.id()), item.id());
            assertTrue(PetDecor.SLOTS.containsValue(item.kind()), item.id());
            assertTrue(item.cost() > 0 && item.id().length() <= 24);
        }
        for (var kind : PetDecor.SLOTS.values()) assertTrue(PetDecor.ITEMS.stream().anyMatch(i -> i.kind().equals(kind)), kind);
        for (var slot : PetDecor.SLOTS.keySet()) assertTrue(slot.length() <= 12);
    }
    @Test void furnitureOnlyGoesWhereItsKindFits() {
        assertEquals("frame", PetDecor.check("wallL", "frame").id());
        assertEquals("heart", PetDecor.check("bedL", "heart").id());
        assertThrows(Exception.class, () -> PetDecor.check("wallL", "heart"));
        assertThrows(Exception.class, () -> PetDecor.check("roof", "frame"));
        assertThrows(Exception.class, () -> PetDecor.check(null, "frame"));
        assertThrows(Exception.class, () -> PetDecor.check("wallL", "sofa"));
        assertThrows(Exception.class, () -> PetDecor.check("wallL", null));
    }
}
