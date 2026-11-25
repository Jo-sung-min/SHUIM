package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;

/** A map is part of the room identity, never a freely supplied room-key suffix. */
public enum BeachMap {
    BEACH("beach", BeachRoom.MIN_X, BeachRoom.MAX_X, BeachRoom.MIN_Z, BeachRoom.ONSEN_MAX_Z, 2.8, 4),
    UYUNI("uyuni", BeachRoom.MIN_X, BeachRoom.MAX_X, -50, BeachRoom.MAX_Z, 2.8, 4),
    BAMBOO("bamboo", -55, 44, -4, 115, 2.8, 4),
    GARDEN("garden", -60, 60, -30, 100, -11.5, -10),
    CLOUDSPA("cloudspa", -76, 76, -98, 130, 90.5, 91.5),
    BAIKAL("baikal", -120, 120, -240, 70, 39.5, 40.5),
    SEA_HIDEOUT("seahideout", -15, 27, -13, 15, -6, -6);

    private final String id;
    private final double minX, maxX, minZ, maxZ, spawnMinZ, spawnMaxZ;

    BeachMap(String id, double minX, double maxX, double minZ, double maxZ, double spawnMinZ, double spawnMaxZ) {
        this.id = id;
        this.minX = minX;
        this.maxX = maxX;
        this.minZ = minZ;
        this.maxZ = maxZ;
        this.spawnMinZ = spawnMinZ;
        this.spawnMaxZ = spawnMaxZ;
    }
    public String id() { return id; }
    public double minX() { return minX; }
    public double maxX() { return maxX; }
    public double minZ() { return minZ; }
    public double maxZ() { return maxZ; }
    public double spawnMinZ() { return spawnMinZ; }
    public double spawnMaxZ() { return spawnMaxZ; }
    public boolean hasBeachFacilities() { return this == BEACH; }
    /** The shared starlight circle belongs to the open maps; the forest, the garden, the cloud spa and the Baikal cabin rest in their pavilion-style seats instead. */
    public boolean hasStarlight() { return this == BEACH || this == UYUNI; }
    public boolean hasBeds() { return this == BEACH || this == UYUNI; }
    public boolean hasPavilions() { return this == BAMBOO || this == GARDEN || this == CLOUDSPA || this == BAIKAL || this == SEA_HIDEOUT; }
    boolean supportsRestSpot(String spotId) {
        return switch (spotId) {
            case BeachRoom.REST_SPOT -> hasStarlight();
            case "hut-pine", "hut-wave", "hut-sunset", BeachRoom.BENCH_SPOT,
                 BeachRoom.ONSEN_BENCH_SPOT, BeachRoom.ONSEN_FLOAT_SPOT -> this == BEACH;
            case BeachRoom.HOTEL_DAWN_SPOT, BeachRoom.HOTEL_DUSK_SPOT, BeachRoom.HOTEL_DAWN_CHAISE, BeachRoom.HOTEL_DUSK_CHAISE,
                "bunker-dawn-sofa", "bunker-dusk-sofa" -> this == UYUNI;
            default -> hasPavilions() && BeachRoom.pavilionOn(this, spotId);
        };
    }

    public static BeachMap from(String id) {
        if (id == null) return BEACH;
        for (BeachMap map : values()) if (map.id.equals(id)) return map;
        throw ApiException.badRequest("이용할 지도를 다시 골라 주세요.");
    }
}
