package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;

/** A map is part of the room identity, never a freely supplied room-key suffix. */
public enum BeachMap {
    BEACH("beach"), UYUNI("uyuni");

    private final String id;
    BeachMap(String id) { this.id = id; }
    public String id() { return id; }
    public boolean hasBeachFacilities() { return this == BEACH; }
    boolean supportsRestSpot(String spotId) {
        return switch (spotId) {
            case BeachRoom.REST_SPOT -> true;
            case "hut-pine", "hut-wave", "hut-sunset", BeachRoom.BENCH_SPOT,
                 BeachRoom.ONSEN_BENCH_SPOT, BeachRoom.ONSEN_FLOAT_SPOT -> this == BEACH;
            case BeachRoom.HOTEL_DAWN_SPOT, BeachRoom.HOTEL_DUSK_SPOT -> this == UYUNI;
            default -> false;
        };
    }

    public static BeachMap from(String id) {
        if (id == null || "beach".equals(id)) return BEACH;
        if ("uyuni".equals(id)) return UYUNI;
        throw ApiException.badRequest("이용할 지도를 다시 골라 주세요.");
    }
}
