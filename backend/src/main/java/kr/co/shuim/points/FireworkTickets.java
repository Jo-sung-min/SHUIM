package kr.co.shuim.points;

import kr.co.shuim.config.ApiException;

import java.util.function.Supplier;

/** Ticket custody for firework launches. The room launch runs inside the consumption so a cooldown never costs a ticket. */
public interface FireworkTickets {
    record Consumed<T>(T result, int tickets) {}

    String REUSED = "이미 사용한 요청이에요. 다시 눌러 주세요.";

    /** Current balance; unknown wallets are empty. */
    int balance(String userId);

    /**
     * Spends one ticket for the launch the supplier performs; an empty wallet is 402 before any launch.
     * A request id that already spent a ticket never launches again: only {@code replay} answers it (the room's
     * remembered event), and only for the same user, community and map. Any other reuse is 409.
     */
    <T> Consumed<T> consume(String userId, String requestId, String communityId, String mapId, String variant,
                            Supplier<T> launcher, Supplier<T> replay);

    /** 재시도 응답을 줄 방법이 없는 옛 호출: 이미 쓴 요청 번호는 언제나 409 */
    default <T> Consumed<T> consume(String userId, String requestId, String communityId, String mapId, String variant, Supplier<T> launcher) {
        return consume(userId, requestId, communityId, mapId, variant, launcher, () -> { throw new ApiException(409, REUSED); });
    }
}
