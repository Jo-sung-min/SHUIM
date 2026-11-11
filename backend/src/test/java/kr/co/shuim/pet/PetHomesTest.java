package kr.co.shuim.pet;

import java.util.List;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PetHomesTest {
    @Test void appearancesAreRestrictedToSupportedCharacters() {
        for (var id : List.of("moru", "noa", "leo", "lumi")) assertEquals(id, PetService.validateAppearance(id));
        assertThrows(ApiException.class, () -> PetService.validateAppearance(null));
        assertThrows(ApiException.class, () -> PetService.validateAppearance("other"));
        assertThrows(ApiException.class, () -> PetService.validateAppearance("../noa"));
    }
    @Test void purchasesRequireBothLevelAndPoints() {
        assertThrows(ApiException.class, () -> PetHomes.check(1, 2, 1000, List.of(0)));
        assertThrows(ApiException.class, () -> PetHomes.check(1, 3, 59, List.of(0)));
        assertEquals(60, PetHomes.check(1, 3, 60, List.of(0)).cost());
    }
    @Test void cannotSkipHomesOrBuyUnavailableContent() {
        assertThrows(ApiException.class, () -> PetHomes.check(2, 50, 10000, List.of(0)));
        assertThrows(ApiException.class, () -> PetHomes.check(3, 50, 10000, List.of(0,1,2)));
        assertThrows(ApiException.class, () -> PetHomes.check(-1, 50, 10000, List.of(0)));
        assertThrows(ApiException.class, () -> PetHomes.check(9, 50, 10000, List.of(0)));
    }
    @Test void ownedSpacesCanBeSelectedWithoutPayingAgain() {
        assertEquals(1, PetHomes.check(1, 3, 0, List.of(0,1)).id());
        assertEquals(0, PetHomes.check(0, 1, 0, List.of(0)).id());
    }
}
