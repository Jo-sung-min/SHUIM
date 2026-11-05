package kr.co.shuim.beach;

import com.fasterxml.jackson.annotation.JsonInclude;
import kr.co.shuim.config.ApiException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Short-lived shared moments. The owning room serializes access and supplies trusted actor coordinates. */
final class BeachUyuniMoments {
    static final int SPARKLER_DURATION_MS = 12_000, LANTERN_DURATION_MS = 40_000;
    static final long SPARKLER_COOLDOWN_MS = 4_000, LANTERN_COOLDOWN_MS = 8_000;
    static final long REQUEST_TTL_MS = 120_000;
    static final int MAX_PER_KIND = 32, MAX_REQUESTS = 1_024;
    static final Cooldowns NO_COOLDOWNS = new Cooldowns(0, 0);

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Event(String id, String kind, String fromPid, String fromNick, double x, double z, double yaw,
                        long startedAt, int durationMs, String letter, String color, String wish) {}
    public record Cooldowns(long sparkler, long lantern) {}
    public record State(List<Event> events, Cooldowns cooldowns, long serverTime) {}
    public record Launch(Event event, long serverTime, Cooldowns cooldowns) {}
    private record Payload(String kind, String letter, String color, String wish) {}
    private record RequestKey(String userId, UUID requestId) {}
    private record Saved(String userId, Set<String> excluded, Payload payload, Event event) {}

    private final LinkedHashMap<String, Saved> active = new LinkedHashMap<>();
    private final LinkedHashMap<RequestKey, Saved> requests = new LinkedHashMap<>();
    private final Map<String, Cooldowns> cooldowns = new LinkedHashMap<>();

    void refreshExclusions(String userId, Set<String> excluded) {
        Set<String> frozen = Set.copyOf(excluded);
        active.replaceAll((id, saved) -> saved.userId().equals(userId)
            ? new Saved(userId, frozen, saved.payload(), saved.event()) : saved);
    }

    State snapshot(String userId, Set<String> excluded, Set<String> blockedSenders, long now) {
        prune(now);
        List<Event> events = active.values().stream()
            .filter(saved -> saved.event().startedAt() <= now && !excluded.contains(saved.userId())
                && !saved.excluded().contains(userId) && !blockedSenders.contains(saved.userId()))
            .map(Saved::event).toList();
        return new State(events, cooldowns.getOrDefault(userId, NO_COOLDOWNS), now);
    }

    Launch launch(BeachRoom.Presence actor, String requestId, String kind, String letter, String color, String wish, long now) {
        RequestKey key = new RequestKey(actor.userId(), requestUuid(requestId));
        Payload payload = payload(kind, letter, color, wish);
        prune(now);
        Saved retry = requests.get(key);
        if (retry != null) {
            if (!retry.payload().equals(payload)) throw new ApiException(409, "같은 요청의 내용을 바꿀 수 없어요. 다시 골라 주세요.");
            return new Launch(retry.event(), now, cooldowns.getOrDefault(actor.userId(), NO_COOLDOWNS));
        }
        Cooldowns previous = cooldowns.getOrDefault(actor.userId(), NO_COOLDOWNS);
        boolean sparkler = "sparkler".equals(kind);
        if (now < (sparkler ? previous.sparkler() : previous.lantern()))
            throw new ApiException(429, "잠시 뒤에 다시 함께 띄워 주세요.");
        if (active.values().stream().filter(saved -> saved.event().kind().equals(kind)).count() >= MAX_PER_KIND
            || requests.size() >= MAX_REQUESTS || (!cooldowns.containsKey(actor.userId()) && cooldowns.size() >= MAX_REQUESTS))
            throw new ApiException(429, "지금은 하늘이 가득해요. 잠시 뒤 다시 띄워 주세요.");
        Event event = new Event(UUID.randomUUID().toString(), kind, actor.pid(), actor.nick(), actor.x(), actor.z(), Math.atan2(Math.sin(actor.yaw()), Math.cos(actor.yaw())),
            now, sparkler ? SPARKLER_DURATION_MS : LANTERN_DURATION_MS, payload.letter(), payload.color(), payload.wish());
        Saved saved = new Saved(actor.userId(), Set.copyOf(actor.excluded()), payload, event);
        active.put(event.id(), saved);
        requests.put(key, saved);
        Cooldowns next = new Cooldowns(sparkler ? now + SPARKLER_COOLDOWN_MS : previous.sparkler(),
            sparkler ? previous.lantern() : now + LANTERN_COOLDOWN_MS);
        cooldowns.put(actor.userId(), next);
        return new Launch(event, now, next);
    }

    private void prune(long now) {
        active.values().removeIf(saved -> now - saved.event().startedAt() >= saved.event().durationMs());
        requests.values().removeIf(saved -> now - saved.event().startedAt() >= REQUEST_TTL_MS);
        cooldowns.values().removeIf(value -> now >= Math.max(value.sparkler(), value.lantern()));
    }

    private static UUID requestUuid(String value) {
        try {
            if (value == null || value.length() != 36) throw new IllegalArgumentException();
            UUID uuid = UUID.fromString(value);
            if (!uuid.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return uuid;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("함께 띄울 요청을 다시 확인해 주세요.");
        }
    }

    private static Payload payload(String kind, String letter, String color, String wish) {
        if ("sparkler".equals(kind)) {
            if (letter == null || !Set.of("L", "O", "V", "E", "heart", "star").contains(letter) || color != null || wish != null)
                throw ApiException.badRequest("스파클러로 그릴 L, O, V, E, 하트, 별 중에서 골라 주세요.");
            return new Payload(kind, letter, null, null);
        }
        if (!"lantern".equals(kind) || letter != null || color == null
            || !Set.of("amber", "rose", "mint", "sky", "violet").contains(color))
            throw ApiException.badRequest("풍등의 색을 다시 골라 주세요.");
        if (wish == null || wish.length() > 640) throw invalidWish();
        // Plain text only: the client renders JSON strings as text, never HTML.
        // Keep emoji joiners, but reject invisible direction overrides and control characters.
        if (wish.codePoints().anyMatch(cp -> Character.isISOControl(cp) || Character.getType(cp) == Character.SURROGATE
            || Character.getType(cp) == Character.LINE_SEPARATOR || Character.getType(cp) == Character.PARAGRAPH_SEPARATOR
            || (Character.getType(cp) == Character.FORMAT && cp != 0x200c && cp != 0x200d))) throw invalidWish();
        int start = 0, end = wish.length();
        while (start < end && space(wish.codePointAt(start))) start += Character.charCount(wish.codePointAt(start));
        while (end > start && space(wish.codePointBefore(end))) end -= Character.charCount(wish.codePointBefore(end));
        String text = wish.substring(start, end);
        int length = text.codePointCount(0, text.length());
        if (length < 1 || length > 80) throw invalidWish();
        return new Payload(kind, null, color, text);
    }

    private static boolean space(int codePoint) { return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint); }
    private static ApiException invalidWish() { return ApiException.badRequest("소원은 줄바꿈 없이 1~80자로 적어 주세요."); }
}
