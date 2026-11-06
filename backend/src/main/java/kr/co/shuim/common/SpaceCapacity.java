package kr.co.shuim.common;

import kr.co.shuim.config.ApiException;

/** Shared admission and display policy for every community map. */
public final class SpaceCapacity {
    public static final int MAX = 20;
    // Existing database rows allow up to 100; keep reading them without a migration.
    private static final int MAX_STORED = 100;

    private SpaceCapacity() {}

    public static int effective(int configured) {
        if (configured < 1 || configured > MAX_STORED) {
            throw ApiException.badRequest("입장 정원을 확인해 주세요.");
        }
        return Math.min(configured, MAX);
    }
}
