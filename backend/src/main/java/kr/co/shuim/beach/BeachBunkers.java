package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import java.util.List;

/** Authoritative mirror of uyuni-bunker-layout.ts. Floors share XZ but never a presence layer. */
final class BeachBunkers {
    static final double ENTRY_REACH = 1.8, SOFA_REACH = 2.2;
    static final int SOFA_SLOTS = 6;
    record Bunker(String id, double x, double z) {
        String sofa() { return "bunker-" + id + "-sofa"; }
        double entryZ() { return z - 6.8; }
        double arrivalZ() { return z - 5.4; }
        // BUNKER_EXTENT in the layout, less the .4 a visitor keeps from each wall.
        double minX() { return x - 17.6; }
        double maxX() { return x + 17.6; }
        double minZ() { return z - 8.6; }
        double maxZ() { return z + 26.6; }
        BeachRoom.BenchSeat seat(int slot) {
            if (slot < 0 || slot >= SOFA_SLOTS) throw ApiException.badRequest("소파 자리를 다시 골라 주세요.");
            return new BeachRoom.BenchSeat(x + (slot < 3 ? -5.3 : 5.3), z + (slot % 3 - 1) * 1.8,
                slot < 3 ? -Math.PI / 2 : Math.PI / 2);
        }
    }
    static final List<Bunker> ALL = List.of(new Bunker("dawn", -12, 23), new Bunker("dusk", 12, 29));
    static Bunker find(String id) { return id == null ? null : ALL.stream().filter(b -> b.id().equals(id)).findFirst().orElse(null); }
    static Bunker forSofa(String spot) { return spot == null ? null : ALL.stream().filter(b -> b.sofa().equals(spot)).findFirst().orElse(null); }
    static void validate(BeachMap map, String id) {
        if (id != null && (map != BeachMap.UYUNI || find(id) == null)) throw ApiException.badRequest("이 지도에서 이용할 수 있는 지하 쉼터를 골라 주세요.");
    }
    private BeachBunkers() {}
}
