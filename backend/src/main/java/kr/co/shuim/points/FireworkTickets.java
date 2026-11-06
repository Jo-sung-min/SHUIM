package kr.co.shuim.points;

import java.util.function.Supplier;

/** Ticket custody for firework launches. The room launch runs inside the consumption so a cooldown never costs a ticket. */
public interface FireworkTickets {
    record Consumed<T>(T result, int tickets) {}

    /** Current balance; unknown wallets are empty. */
    int balance(String userId);

    /**
     * Spends one ticket for the launch the supplier performs. A repeated request id runs the supplier again
     * (the room answers with its earlier event) without charging twice; an empty wallet is 402 before any launch.
     */
    <T> Consumed<T> consume(String userId, String requestId, String communityId, String mapId, String variant, Supplier<T> launcher);
}
