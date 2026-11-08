package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;

/** A map is part of the room identity, never a freely supplied room-key suffix. */
public enum BeachMap {
    BEACH("beach"), UYUNI("uyuni"), BAMBOO("bamboo"), GARDEN("garden");

    private final String id;
    BeachMap(String id) { this.id = id; }
    public String id() { return id; }
    /** Hotels face -Z; the salt-flat promenade is about three times the original frontward reach. The forest trail only needs a little room behind its entrance; the garden keeps its moon gate behind the spawn. */
    public double minZ() {
        return switch (this) {
            case UYUNI -> -50;
            case BAMBOO -> -4;
            case GARDEN -> -30;
            default -> BeachRoom.MIN_Z;
        };
    }
    /** The bamboo mountain is twice as wide as the shore and climbs far beyond it; the garden's lake and hall need a wider, deeper field. */
    public double maxZ() { return this == BAMBOO ? 115 : this == GARDEN ? 100 : this == BEACH ? BeachRoom.ONSEN_MAX_Z : BeachRoom.MAX_Z; }
    public double minX() { return this == BAMBOO ? -55 : this == GARDEN ? -60 : BeachRoom.MIN_X; }
    public double maxX() { return this == BAMBOO ? 44 : this == GARDEN ? 60 : BeachRoom.MAX_X; }
    /** Newcomers arrive beside the fire on the open maps; in the garden they stand inside the south moon gate. */
    public double spawnMinZ() { return this == GARDEN ? -11.5 : 2.8; }
    public double spawnMaxZ() { return this == GARDEN ? -10 : 4; }
    public boolean hasBeachFacilities() { return this == BEACH; }
    /** The shared starlight circle belongs to the open maps; the forest and the garden rest in their pavilions and hall seats instead. */
    public boolean hasStarlight() { return this != BAMBOO && this != GARDEN; }
    public boolean hasBeds() { return this != BAMBOO && this != GARDEN; }
    public boolean hasPavilions() { return this == BAMBOO || this == GARDEN; }
    boolean supportsRestSpot(String spotId) {
        return switch (spotId) {
            case BeachRoom.REST_SPOT -> hasStarlight();
            case "hut-pine", "hut-wave", "hut-sunset", BeachRoom.BENCH_SPOT,
                 BeachRoom.ONSEN_BENCH_SPOT, BeachRoom.ONSEN_FLOAT_SPOT -> this == BEACH;
            case BeachRoom.HOTEL_DAWN_SPOT, BeachRoom.HOTEL_DUSK_SPOT -> this == UYUNI;
            default -> hasPavilions() && BeachRoom.pavilionOn(this, spotId);
        };
    }

    public static BeachMap from(String id) {
        if (id == null || "beach".equals(id)) return BEACH;
        if ("uyuni".equals(id)) return UYUNI;
        if ("bamboo".equals(id)) return BAMBOO;
        if ("garden".equals(id)) return GARDEN;
        throw ApiException.badRequest("이용할 지도를 다시 골라 주세요.");
    }
}
