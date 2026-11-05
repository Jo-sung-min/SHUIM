package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;

/** A map is part of the room identity, never a freely supplied room-key suffix. */
public enum BeachMap {
    BEACH("beach"), UYUNI("uyuni"), BAMBOO("bamboo");

    private final String id;
    BeachMap(String id) { this.id = id; }
    public String id() { return id; }
    /** Hotels face -Z; the salt-flat promenade is about three times the original frontward reach. The forest trail only needs a little room behind its entrance. */
    public double minZ() {
        return switch (this) {
            case UYUNI -> -50;
            case BAMBOO -> -4;
            default -> BeachRoom.MIN_Z;
        };
    }
    public boolean hasBeachFacilities() { return this == BEACH; }
    /** The shared starlight circle belongs to the open maps; the forest rests in its pavilions instead. */
    public boolean hasStarlight() { return this != BAMBOO; }
    public boolean hasBeds() { return this != BAMBOO; }
    public boolean hasPavilions() { return this == BAMBOO; }
    boolean supportsRestSpot(String spotId) {
        return switch (spotId) {
            case BeachRoom.REST_SPOT -> hasStarlight();
            case "hut-pine", "hut-wave", "hut-sunset", BeachRoom.BENCH_SPOT,
                 BeachRoom.ONSEN_BENCH_SPOT, BeachRoom.ONSEN_FLOAT_SPOT -> this == BEACH;
            case BeachRoom.HOTEL_DAWN_SPOT, BeachRoom.HOTEL_DUSK_SPOT -> this == UYUNI;
            default -> hasPavilions() && BeachRoom.isPavilionSpot(spotId);
        };
    }

    public static BeachMap from(String id) {
        if (id == null || "beach".equals(id)) return BEACH;
        if ("uyuni".equals(id)) return UYUNI;
        if ("bamboo".equals(id)) return BAMBOO;
        throw ApiException.badRequest("이용할 지도를 다시 골라 주세요.");
    }
}
