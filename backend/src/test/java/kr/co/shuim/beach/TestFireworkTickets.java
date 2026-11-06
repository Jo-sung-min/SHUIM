package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.FireworkTicketService;
import kr.co.shuim.points.FireworkTickets;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/** In-memory ticket custody with the production contract: launch inside, charge only after the room accepted. */
class TestFireworkTickets implements FireworkTickets {
    final Map<String, Integer> balances = new HashMap<>();
    final Set<String> spent = new HashSet<>();
    final List<String> launches = new ArrayList<>();

    void grant(String userId, int tickets) { balances.merge(userId, tickets, Integer::sum); }

    @Override public synchronized int balance(String userId) { return balances.getOrDefault(userId, 0); }

    @Override
    public synchronized <T> Consumed<T> consume(String userId, String requestId, String communityId, String mapId, String variant, Supplier<T> launcher) {
        try { UUID.fromString(requestId); } catch (RuntimeException e) { throw ApiException.badRequest("불꽃놀이 요청을 다시 시도해 주세요."); }
        int balance = balance(userId);
        if (spent.contains(userId + ":" + requestId)) return new Consumed<>(launcher.get(), balance);
        if (balance < 1) throw new ApiException(402, FireworkTicketService.NO_TICKET);
        T result = launcher.get();
        spent.add(userId + ":" + requestId);
        balances.put(userId, balance - 1);
        launches.add(communityId + "/" + mapId + "/" + variant);
        return new Consumed<>(result, balance - 1);
    }
}
