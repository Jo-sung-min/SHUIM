package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import java.util.List;
import java.util.ArrayList;

/** Authoritative mirror of uyuni-bunker-layout.ts. Floors share XZ but never a presence layer. */
final class BeachBunkers {
    static final double ENTRY_REACH = 1.8, SOFA_REACH = 2.2;
    static final int SOFA_SLOTS = 21;
    private static final List<BeachRoom.BenchSeat> SEATS = furnitureSeats();

    private static BeachRoom.BenchSeat atWall(double angle, double side, double out) {
        double nx = -Math.sin(angle) / 15, nz = -Math.cos(angle) / 18, length = Math.hypot(nx, nz);
        nx /= length; nz /= length;
        return new BeachRoom.BenchSeat(15 * Math.sin(angle) + nz * side + nx * out,
            9 + 18 * Math.cos(angle) - nx * side + nz * out, Math.atan2(nx, nz));
    }
    /** Stable slots match the furniture catalogue in uyuni-bunker-layout.ts. */
    private static List<BeachRoom.BenchSeat> furnitureSeats() {
        var seats = new ArrayList<BeachRoom.BenchSeat>();
        for (int side : new int[]{-1, 1}) for (double z : new double[]{-1.8, 0, 1.8})
            seats.add(new BeachRoom.BenchSeat(side * 5.5, z, side * Math.PI / 2));
        for (double side : new double[]{-1.05, 1.05}) {
            var at = atWall(-2.25, side, 2.6); double yaw = at.yaw() + side * .25;
            seats.add(new BeachRoom.BenchSeat(at.x(), at.z(), yaw));
        }
        for (double x : new double[]{-3.6, 3.6}) for (int side : new int[]{-1, 1})
            seats.add(new BeachRoom.BenchSeat(x + side * 1.15, 5.5, side * Math.PI / 2));
        for (double side : new double[]{-.85, 0, .85}) {
            var at = atWall(2.25, side, .95); double yaw = at.yaw() + Math.PI;
            seats.add(new BeachRoom.BenchSeat(at.x(), at.z(), Math.atan2(Math.sin(yaw), Math.cos(yaw))));
        }
        for (int side : new int[]{-1, 1}) for (double z : new double[]{-.8, 0, .8})
            seats.add(new BeachRoom.BenchSeat(side * 2.36, 23.4 + z, side * Math.PI / 2));
        return List.copyOf(seats);
    }
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
            if (slot < 0 || slot >= SOFA_SLOTS) throw ApiException.badRequest("앉을 자리를 다시 골라 주세요.");
            var seat = SEATS.get(slot);
            return new BeachRoom.BenchSeat(x + seat.x(), z + seat.z(), seat.yaw());
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
