package kr.co.shuim.beach;

import com.fasterxml.jackson.annotation.JsonInclude;
import kr.co.shuim.common.Ids;
import kr.co.shuim.config.ApiException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * 소로우 바닷가에 "지금 있는 사람들". 전부 메모리에만 둔다 (서버가 다시 뜨면 비어 있는 게 맞다).
 * 브라우저는 /api/beach/tick 을 폴링하며 내 위치를 보내고, 다른 사람들의 위치와 받은 위로를 받아 간다.
 * 티켓이 곧 자격증명이라 tick 에서는 DB 도 세션도 보지 않는다. {@link #IDLE_MS} 동안 tick 이 없으면 나간 것으로 본다.
 * 시계를 주입받아 테스트에서 시간을 돌릴 수 있고, 정리는 스케줄러 대신 요청이 들어올 때 게으르게 한다.
 * 같은 유저가 탭을 둘 열면 presence 도 둘이고(티켓마다 하나) 서로에게도 보인다.
 */
public class BeachRoom {
    /** 세계 경계 (m). 물가는 z = 0, 바다는 z 가 음수 쪽. 들어오는 위치는 전부 이 안으로 자른다 */
    public static final double MIN_X = -22, MAX_X = 22, MIN_Z = -1, MAX_Z = 55;
    /** 각 소로우의 해변에 동시에 머물 수 있는 최대 방문 수 */
    public static final int CAPACITY = 100;
    /** 이만큼 tick 이 없으면 나간 것 */
    public static final long IDLE_MS = 10_000;
    /** 게으른 정리는 아무리 자주 와도 이 간격으로만 */
    static final long SWEEP_EVERY_MS = 2_000;
    /** 위로·안아주기 쿨다운: 누구에게든 1초, 같은 사람에게는 3초 */
    public static final long CARE_GLOBAL_MS = 1_000;
    public static final long CARE_TARGET_MS = 3_000;
    /** 받는 사람으로부터 이 거리 안에 있는 사람도 효과를 본다 */
    public static final double CARE_RADIUS = 20;
    /** 한 번에 내려주는 다른 사람 수 (가까운 순) */
    public static final int MAX_PLAYERS = 40;
    public static final Set<String> CARE_KINDS = Set.of("comfort", "hug", "wave");
    public static final String REST_SPOT = "starlight";
    public static final int REST_SLOTS = 8;
    public static final double REST_X = 7, REST_Z = 7, REST_FEET_RADIUS = 2.65, REST_REACH = 5.5;
    public static final int BED_SLOTS = 3;
    /** Beds sit deeper inside the enlarged shelters; matches the frontend bed-slot anchor. */
    public static final double BED_FEET_OFFSET_Z = 1.5;
    public static final String BENCH_SPOT = "fire-benches";
    public static final int BENCH_SLOTS = 12;
    public static final double BENCH_REACH = 2.25;
    public static final String ONSEN_BENCH_SPOT = "onsen-benches", ONSEN_FLOAT_SPOT = "onsen-float";
    public static final int ONSEN_BENCH_SLOTS = 6, ONSEN_FLOAT_SLOTS = 3;
    public static final double ONSEN_X = 0, ONSEN_Z = 45, ONSEN_REACH = 2.2, ONSEN_BENCH_RADIUS = 3.55;
    private record RestSpot(String id, double x, double z, int capacity, boolean bed) {
        boolean bench() { return BENCH_SPOT.equals(id); }
        boolean onsen() { return ONSEN_BENCH_SPOT.equals(id) || ONSEN_FLOAT_SPOT.equals(id); }
        boolean sitting() { return bench() || ONSEN_BENCH_SPOT.equals(id); }
    }
    private record BenchSeat(double x, double z, double yaw) {}
    private static final Map<String, RestSpot> REST_SPOTS = Map.of(
        REST_SPOT, new RestSpot(REST_SPOT, REST_X, REST_Z, REST_SLOTS, false),
        "hut-pine", new RestSpot("hut-pine", -13, 24.8, BED_SLOTS, true),
        "hut-wave", new RestSpot("hut-wave", 0, 26.8, BED_SLOTS, true),
        "hut-sunset", new RestSpot("hut-sunset", 13, 24.8, BED_SLOTS, true),
        BENCH_SPOT, new RestSpot(BENCH_SPOT, 0, 12, BENCH_SLOTS, false),
        ONSEN_BENCH_SPOT, new RestSpot(ONSEN_BENCH_SPOT, ONSEN_X, ONSEN_Z, ONSEN_BENCH_SLOTS, false),
        ONSEN_FLOAT_SPOT, new RestSpot(ONSEN_FLOAT_SPOT, ONSEN_X, ONSEN_Z, ONSEN_FLOAT_SLOTS, false));

    /** 가짜 방문자: 아이디 bot-1..3, 느리게 정해진 길을 오간다. 위로는 받지만 보내지는 않고, 나가지도 않는다 */
    private static final String[] BOT_NICKS = {"바람", "파도", "조개"};
    private static final int[] BOT_SKINS = {1, 0, 0};
    private static final double[][] BOT_CENTERS = {{-5, 8}, {5, 11}, {0, 16}};

    private static final long NEVER = Long.MIN_VALUE / 4;

    /** 위로해주기·안아주기 한 번. 받는 사람(presence 마다 하나), 보낸 사람, 근처 사람의 inbox 에 들어간다 */
    public record CareEvent(String kind, String fromPid, String fromId, String fromNick, String toPid, String toId, String toNick, long at) {}

    /** 다른 사람에게 보여 주는 모습. id 는 유저 id (위로를 보낼 때 쓴다), pid 는 이번 방문의 공개 id */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PlayerView(String pid, String id, String nick, int skin, double x, double z, double yaw, boolean moving,
                             String pose, String spotId, Integer slot) {
        public PlayerView(String pid, String id, String nick, int skin, double x, double z, double yaw, boolean moving) {
            this(pid, id, nick, skin, x, z, yaw, moving, "standing", null, null);
        }
        static PlayerView of(Presence p) {
            synchronized (p) {
                return new PlayerView(p.pid, p.userId, p.nick, p.skin, round2(p.x), round2(p.z), round2(p.yaw), p.moving,
                    restPose(p), p.restSpot, p.restSlot);
            }
        }
    }

    /** Position and pose are returned together so clients can recover the authoritative resting state. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record RestPresence(String pose, String spotId, Integer slot, double x, double z, double yaw) {
        static RestPresence of(Presence p) {
            synchronized (p) {
                return new RestPresence(restPose(p), p.restSpot,
                    p.restSlot, p.x, p.z, p.yaw);
            }
        }
    }

    private static String restPose(Presence p) {
        return p.restSlot == null ? "standing" : BENCH_SPOT.equals(p.restSpot) || ONSEN_BENCH_SPOT.equals(p.restSpot) ? "sitting" : "lying";
    }

    private static BenchSeat benchSeat(int slot) {
        double angle = Math.PI / 6 + (slot / 2) * Math.PI / 3;
        double offset = slot % 2 == 0 ? -.5 : .5;
        return new BenchSeat(Math.sin(angle) * 4 + Math.cos(angle) * offset,
            12 + Math.cos(angle) * 4 - Math.sin(angle) * offset, angle);
    }

    private static BenchSeat onsenSlot(RestSpot spot, int slot) {
        if (ONSEN_FLOAT_SPOT.equals(spot.id())) return new BenchSeat((slot - 1) * 2.4, 43.3, 0);
        double angle = Math.toRadians(15 + slot * 30);
        return new BenchSeat(Math.cos(angle) * ONSEN_BENCH_RADIUS, ONSEN_Z + Math.sin(angle) * ONSEN_BENCH_RADIUS, 0);
    }

    private static int nearestOnsenSlot(Presence me, RestSpot spot, boolean[] used) {
        boolean nearby = false;
        int closest = -1;
        double closestDistance = Double.POSITIVE_INFINITY;
        for (int slot = 0; slot < spot.capacity(); slot++) {
            BenchSeat place = onsenSlot(spot, slot);
            double distance = Math.hypot(me.x - place.x(), me.z - place.z());
            if (distance > ONSEN_REACH + 1e-9) continue;
            nearby = true;
            if (!used[slot] && distance < closestDistance) { closest = slot; closestDistance = distance; }
        }
        if (!nearby) throw ApiException.badRequest("온천의 쉴 자리 가까이에서 이용해 주세요.");
        if (closest < 0) throw new ApiException(409, "가까운 자리가 모두 차 있어요. 다른 자리로 다가가 주세요.");
        return closest;
    }

    /** A full nearby bench must not send the visitor to a different, distant bench. */
    private static int nearestBenchSlot(Presence me, boolean[] used) {
        boolean nearby = false;
        int closest = -1;
        double closestDistance = Double.POSITIVE_INFINITY;
        for (int slot = 0; slot < BENCH_SLOTS; slot++) {
            BenchSeat seat = benchSeat(slot);
            double distance = Math.hypot(me.x - seat.x(), me.z - seat.z());
            if (distance > BENCH_REACH) continue;
            nearby = true;
            if (!used[slot] && distance < closestDistance) {
                closest = slot;
                closestDistance = distance;
            }
        }
        if (!nearby) throw ApiException.badRequest("모닥불 벤치 가까이에서 앉아 주세요.");
        if (closest < 0) throw new ApiException(409, "가까운 벤치가 모두 차 있어요. 다른 벤치로 다가가 주세요.");
        return closest;
    }

    /** 이번 방문에서 받은 위로·안아주기 수 */
    public record Received(int comfort, int hug, int wave) {
        public Received(int comfort, int hug) { this(comfort, hug, 0); }
    }
    public record CareCapabilities(boolean wave, boolean hug) {}
    /** Room-wide, in-memory lighting. Null hour resumes the real time of day. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Lighting(String mode, Integer hour, long version) {}
    public static final Lighting AUTO_LIGHTING = new Lighting("auto", null, 0);
    private volatile Lighting lighting = AUTO_LIGHTING;

    public Lighting lighting() { return lighting; }

    public static final int FIREWORK_DURATION_MS = 12_000;
    public static final long FIREWORK_COOLDOWN_MS = 15_000;
    private static final long FIREWORK_REQUEST_TTL_MS = 24 * 60 * 60 * 1_000L;
    public record FireworkEvent(String id, int seed, long startedAt, int durationMs) {}
    public record FireworksState(List<FireworkEvent> events, long cooldownUntil, long serverTime) {}
    public record FireworkLaunch(FireworkEvent event, long serverTime, long cooldownUntil) {}
    private final LinkedHashMap<UUID, FireworkEvent> fireworkRequests = new LinkedHashMap<>();
    private FireworkEvent activeFirework;
    private long fireworksCooldownUntil;

    public synchronized FireworksState fireworks() {
        long now = clock.getAsLong();
        boolean active = activeFirework != null && now >= activeFirework.startedAt()
            && now - activeFirework.startedAt() < activeFirework.durationMs();
        return new FireworksState(active ? List.of(activeFirework) : List.of(), fireworksCooldownUntil, now);
    }

    /** Session role and membership are checked by the controller; the room lock rechecks ticket ownership. */
    synchronized FireworkLaunch launchFireworks(String ticket, String userId, String requestId) {
        long now = clock.getAsLong();
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        if (!me.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        UUID key;
        try {
            if (requestId == null || requestId.length() != 36) throw new IllegalArgumentException();
            key = UUID.fromString(requestId);
            if (!key.toString().equalsIgnoreCase(requestId)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("불꽃놀이 요청을 다시 시도해 주세요.");
        }
        // Keep retry identities beyond the animation lifetime without growing indefinitely.
        // At one launch per 15 seconds this holds at most 5,761 entries per room.
        var previous = fireworkRequests.entrySet().iterator();
        while (previous.hasNext()) {
            if (now - previous.next().getValue().startedAt() < FIREWORK_REQUEST_TTL_MS) break;
            previous.remove();
        }
        FireworkEvent retried = fireworkRequests.get(key);
        if (retried != null) return new FireworkLaunch(retried, now, fireworksCooldownUntil);
        if (now < fireworksCooldownUntil) throw new ApiException(429, "불꽃놀이가 끝난 뒤 잠시 기다려 주세요.");
        FireworkEvent event = new FireworkEvent(UUID.randomUUID().toString(), ThreadLocalRandom.current().nextInt(1, Integer.MAX_VALUE), now, FIREWORK_DURATION_MS);
        activeFirework = event;
        fireworksCooldownUntil = now + FIREWORK_COOLDOWN_MS;
        fireworkRequests.put(key, event);
        return new FireworkLaunch(event, now, fireworksCooldownUntil);
    }

    /** Called only after the controller verifies the current administrator and owned visit. */
    synchronized Lighting setLighting(String mode) {
        if (mode == null) throw ApiException.badRequest("낮, 노을, 밤, 자동 중에서 골라 주세요.");
        Integer hour = switch (mode) {
            case "auto" -> null;
            case "day" -> 12;
            case "sunset" -> 18;
            case "night" -> 20;
            default -> throw ApiException.badRequest("낮, 노을, 밤, 자동 중에서 골라 주세요.");
        };
        // Repeated clicks/retries preserve the version; every actual change advances it.
        if (!mode.equals(lighting.mode())) lighting = new Lighting(mode, hour, lighting.version() + 1);
        return lighting;
    }

    /** tick 응답. care 는 위로를 보내지 않았으면 null ("sent" | "cooldown" | "gone") */
    public record TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                             BeachFireService.FireView fire, long serverTime, RestPresence selfRest,
                             @JsonInclude(JsonInclude.Include.NON_NULL) CareCapabilities careCapabilities, Lighting lighting,
                             List<FireworkEvent> fireworks, long fireworksCooldownUntil) {
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                          BeachFireService.FireView fire, long serverTime, RestPresence selfRest,
                          CareCapabilities careCapabilities, Lighting lighting) {
            this(players, events, count, received, care, fire, serverTime, selfRest, careCapabilities, lighting, List.of(), 0);
        }
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care) {
            this(players, events, count, received, care, null, 0, null, null, AUTO_LIGHTING);
        }
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                          BeachFireService.FireView fire, long serverTime) {
            this(players, events, count, received, care, fire, serverTime, null, null, AUTO_LIGHTING);
        }
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                          BeachFireService.FireView fire, long serverTime, RestPresence selfRest) {
            this(players, events, count, received, care, fire, serverTime, selfRest, null, AUTO_LIGHTING);
        }
        public TickResult withFire(BeachFireService.FireView value) {
            return new TickResult(players, events, count, received, care, value, serverTime > 0 ? serverTime : value.serverTime(), selfRest, careCapabilities, lighting, fireworks, fireworksCooldownUntil);
        }
        public TickResult withCareCapabilities(CareCapabilities capabilities, boolean denied) {
            return new TickResult(players, events, count, received, denied ? "forbidden" : care, fire, serverTime, selfRest, capabilities, lighting, fireworks, fireworksCooldownUntil);
        }
    }

    /**
     * 바닷가에 있는 한 사람. ticket 은 비밀(본인만), pid 는 다른 사람에게 보여 주는 공개 id.
     * excluded 는 서로 차단한 유저 id: 서로 보이지도, 위로를 주고받지도 못한다.
     */
    public static final class Presence {
        private final String pid, ticket, userId, nick;
        private volatile int skin;
        private final int botIndex; // 0 = 사람, 1..3 = 가짜 방문자
        private final Set<String> excluded;
        private volatile double x, z, yaw;
        private volatile boolean moving;
        private volatile Integer restSlot;
        private volatile String restSpot;
        private double standingX, standingZ, standingYaw;
        private volatile long lastSeen;
        private volatile long lastCareAt = NEVER;
        private final Map<String, Long> lastCareTo = new ConcurrentHashMap<>();
        private final ConcurrentLinkedQueue<CareEvent> inbox = new ConcurrentLinkedQueue<>();
        private final AtomicInteger receivedComfort = new AtomicInteger();
        private final AtomicInteger receivedHug = new AtomicInteger();
        private final AtomicInteger receivedWave = new AtomicInteger();

        private Presence(String pid, String ticket, String userId, String nick, int skin, int botIndex, Set<String> excluded,
                         double x, double z, double yaw, long now) {
            this.pid = pid;
            this.ticket = ticket;
            this.userId = userId;
            this.nick = nick;
            this.skin = skin;
            this.botIndex = botIndex;
            this.excluded = excluded;
            this.x = x;
            this.z = z;
            this.yaw = yaw;
            this.lastSeen = now;
        }

        public String pid() { return pid; }
        public String ticket() { return ticket; }
        public String userId() { return userId; }
        public String nick() { return nick; }
        public int skin() { return skin; }
        public boolean bot() { return botIndex > 0; }
        public Set<String> excluded() { return excluded; }
        public double x() { return x; }
        public double z() { return z; }
        public double yaw() { return yaw; }
        public boolean moving() { return moving; }
        public long lastSeen() { return lastSeen; }
        public long lastCareAt() { return lastCareAt; }
        public Map<String, Long> lastCareTo() { return Collections.unmodifiableMap(lastCareTo); }
        public int receivedComfort() { return receivedComfort.get(); }
        public int receivedHug() { return receivedHug.get(); }
        /** 아직 가져가지 않은 이벤트 수 (테스트용) */
        public int pendingEvents() { return inbox.size(); }

        /** 상대가 나를 보지 못하게(또는 내가 상대를) 차단한 사이가 아닌지 */
        boolean sees(Presence other) { return !excluded.contains(other.userId); }
    }

    /** 선택이 없는 기존 방문은 3D 남자 0 · 픽셀 여자 1 중 같은 기본 모습으로 입장한다. */
    public static int skinOf(String userId) { return Math.floorMod(userId.hashCode(), 2); }

    static Integer selectedSkin(String character) {
        if (character == null) return null;
        return switch (character) {
            case "male" -> 0;
            case "female" -> 1;
            case "pixel-male" -> 2;
            case "female-3d" -> 3;
            default -> throw ApiException.badRequest("캐릭터를 다시 골라 주세요.");
        };
    }

    private final LongSupplier clock;
    private final ConcurrentHashMap<String, Presence> byTicket = new ConcurrentHashMap<>();
    private final List<Presence> bots;
    private final AtomicLong lastSweep;

    /**
     * @param clock    현재 시각 (ms). 운영에서는 System::currentTimeMillis
     * @param simulate true 면 가짜 방문자 셋을 심어 둔다 (바닷가가 비어 보이지 않게)
     */
    public BeachRoom(LongSupplier clock, boolean simulate) {
        this.clock = clock;
        long now = clock.getAsLong();
        this.lastSweep = new AtomicLong(now);
        List<Presence> seeded = new ArrayList<>();
        if (simulate) {
            for (int i = 1; i <= BOT_NICKS.length; i++) {
                String id = "bot-" + i;
                Presence b = new Presence(Ids.randomHex(6), Ids.randomHex(16), id, BOT_NICKS[i - 1], BOT_SKINS[i - 1], i, Set.of(),
                    BOT_CENTERS[i - 1][0], BOT_CENTERS[i - 1][1], 0, now);
                byTicket.put(b.ticket, b);
                seeded.add(b);
            }
        }
        this.bots = List.copyOf(seeded);
        advanceBots(now);
    }

    /* ---------- 들어오기 · 나가기 ---------- */

    /** 물가에서 들어와 모닥불(0, 12)과 뒤편 절벽을 바라보며 시작 */
    public Presence enter(String userId, String nick, Set<String> excluded) {
        return enter(userId, nick, excluded, null);
    }

    public synchronized Presence enter(String userId, String nick, Set<String> excluded, String character) {
        Integer selectedSkin = selectedSkin(character);
        long now = clock.getAsLong();
        // 입장 확인과 추가를 같은 잠금 안에서 처리해 동시 입장에도 100명을 넘지 않는다.
        sweep(now);
        if (byTicket.size() >= CAPACITY) throw new ApiException(409, "바닷가에 100명이 함께 쉬고 있어요. 잠시 후 다시 와 주세요.");
        ThreadLocalRandom r = ThreadLocalRandom.current();
        double x = r.nextDouble(-1.5, 1.5), z = r.nextDouble(2.8, 4);
        Presence p = new Presence(Ids.randomHex(6), Ids.randomHex(16), userId, nick == null ? "" : nick,
            selectedSkin == null ? skinOf(userId) : selectedSkin, 0,
            excluded == null ? Set.of() : Set.copyOf(excluded), x, z, Math.atan2(x, z - BeachFireService.FIRE_Z), now);
        byTicket.put(p.ticket, p);
        return p;
    }

    /** 나간다. 모르는 티켓이어도 조용히 지나간다 */
    public synchronized void leave(String ticket) {
        if (ticket == null) return;
        Presence p = byTicket.get(ticket);
        if (p != null && !p.bot()) byTicket.remove(ticket, p);
    }

    /** 티켓으로 presence 를 찾는다 (살아 있는 것만). 모르거나 만료면 null */
    public Presence presence(String ticket) {
        if (ticket == null) return null;
        Presence p = byTicket.get(ticket);
        return p != null && live(p, clock.getAsLong()) ? p : null;
    }

    /** Slot assignment, release and expiry share the room lock. A ticket cannot reserve another room's slot. */
    public synchronized RestPresence rest(String ticket, String action, String spotId) {
        long now = clock.getAsLong();
        sweep(now);
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot()) throw ApiException.gone(BeachController.GONE);
        if (!"lie".equals(action) && !"sit".equals(action) && !"stand".equals(action)) throw ApiException.badRequest("앉기, 눕기, 일어나기 중에서 골라 주세요.");
        RestSpot spot = REST_SPOTS.get(spotId == null ? REST_SPOT : spotId);
        if (spot == null) throw ApiException.badRequest("쉴 자리를 다시 골라 주세요.");
        if (!"stand".equals(action) && "sit".equals(action) != spot.sitting())
            throw ApiException.badRequest("앉거나 누울 수 있는 자리를 다시 골라 주세요.");
        synchronized (me) {
            if ("stand".equals(action)) {
                if (me.restSlot != null) {
                    me.x = clamp(me.standingX, MIN_X, MAX_X, REST_X);
                    me.z = clamp(me.standingZ, MIN_Z, MAX_Z, REST_Z + REST_REACH);
                    me.yaw = me.standingYaw;
                    me.restSlot = null;
                    me.restSpot = null;
                }
                me.moving = false;
                me.lastSeen = now;
                return RestPresence.of(me);
            }
            if (me.restSlot != null) {
                if (!spot.id().equals(me.restSpot)) throw new ApiException(409, "먼저 일어난 뒤 다른 자리를 골라 주세요.");
                me.lastSeen = now;
                return RestPresence.of(me); // Lost responses can be retried without taking another slot.
            }
            double reachZ = spot.z() + (spot.bed() ? BED_FEET_OFFSET_Z : 0);
            if (!spot.bench() && !spot.onsen() && Math.hypot(me.x - spot.x(), me.z - reachZ) > REST_REACH) {
                throw ApiException.badRequest(spot.bed() ? "오두막 가까이에서 누워 주세요." : "별빛 자리 가까이에서 누워 주세요.");
            }
            boolean[] used = new boolean[spot.capacity()];
            for (Presence other : byTicket.values()) {
                Integer slot = other.restSlot;
                if (slot != null && spot.id().equals(other.restSpot) && live(other, now)) used[slot] = true;
            }
            int slot = spot.bench() ? nearestBenchSlot(me, used) : spot.onsen() ? nearestOnsenSlot(me, spot, used) : 0;
            if (!spot.bench() && !spot.onsen()) while (slot < spot.capacity() && used[slot]) slot++;
            if (slot == spot.capacity()) throw new ApiException(409, spot.bed() ? "이 오두막의 침구가 모두 사용 중이에요. 다른 오두막을 골라 주세요." : "별빛 자리가 모두 차 있어요. 잠시 뒤 다시 와 주세요.");
            me.standingX = me.x;
            me.standingZ = me.z;
            me.standingYaw = me.yaw;
            if (spot.onsen()) {
                // Keep the saved return point inside the water, clear of the rim and rear seat slabs.
                double radius = Math.hypot(me.x - ONSEN_X, me.z - ONSEN_Z);
                double scale = radius > 2.7 ? 2.7 / radius : 1;
                me.standingX = ONSEN_X + (me.x - ONSEN_X) * scale;
                me.standingZ = ONSEN_Z + (me.z - ONSEN_Z) * scale;
            }
            if (spot.bench() || spot.onsen()) {
                BenchSeat seat = spot.onsen() ? onsenSlot(spot, slot) : benchSeat(slot);
                me.x = seat.x();
                me.z = seat.z();
                me.yaw = seat.yaw();
            } else {
                double theta = spot.bed() ? Math.PI : slot * Math.PI * 2 / REST_SLOTS;
                me.x = spot.bed() ? spot.x() + (slot - 1) * 1.9 : spot.x() + Math.sin(theta) * REST_FEET_RADIUS;
                me.z = spot.bed() ? spot.z() + BED_FEET_OFFSET_Z : spot.z() + Math.cos(theta) * REST_FEET_RADIUS;
                me.yaw = theta;
            }
            me.restSpot = spot.id();
            me.restSlot = slot;
            me.moving = false;
            me.lastSeen = now;
            return RestPresence.of(me);
        }
    }

    /* ---------- tick ---------- */

    /**
     * 내 위치를 알리고 다른 사람들을 받아 온다. 위로를 보내려면 careTo(유저 id)·careKind 를 함께.
     * 티켓을 모르거나 만료됐으면 null — 컨트롤러가 410 으로 바꾼다.
     * x·z·yaw 가 NaN 이면 이전 값을 그대로 둔다.
     */
    public TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind) {
        return tick(ticket, x, z, yaw, moving, careTo, careKind, null);
    }

    public TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind, String character) {
        return tick(ticket, x, z, yaw, moving, careTo, careKind, character, false);
    }

    /** Privileged actions default to denied; only the authenticated controller may authorize a hug. */
    public TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind, String character, boolean hugAllowed) {
        long now = clock.getAsLong();
        maybeSweep(now);
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot()) return null;
        synchronized (me) {
            if (byTicket.get(ticket) != me || !live(me, now)) {
                byTicket.remove(ticket, me);
                return null;
            }
            Integer selectedSkin = selectedSkin(character);
            if (selectedSkin != null) me.skin = selectedSkin;
            if (me.restSlot == null) {
                me.x = clamp(x, MIN_X, MAX_X, me.x);
                me.z = clamp(z, MIN_Z, MAX_Z, me.z);
                if (Double.isFinite(yaw)) me.yaw = yaw;
                me.moving = moving;
            } else {
                me.moving = false;
            }
            me.lastSeen = now;
        }
        advanceBots(now);

        // 위로는 inbox 를 비우기 전에 보내서, 보낸 사람도 같은 응답에서 자기 효과를 본다
        String care = careTo == null || careTo.isBlank() ? null : care(me, careTo.strip(), careKind, now, hugAllowed);

        // Other ticks update Presence concurrently. Sort immutable coordinates so comparisons stay consistent.
        double originX = me.x, originZ = me.z;
        List<PlayerView> players = byTicket.values().stream()
            .filter(p -> p != me && live(p, now) && me.sees(p) && p.sees(me))
            .map(PlayerView::of)
            .sorted(Comparator.comparingDouble(p -> {
                double dx = p.x() - originX, dz = p.z() - originZ;
                return dx * dx + dz * dz;
            }))
            .limit(MAX_PLAYERS)
            .toList();
        List<CareEvent> events = new ArrayList<>();
        for (CareEvent e; (e = me.inbox.poll()) != null; ) events.add(e);
        FireworksState fireworks = fireworks();
        return new TickResult(players, events, liveCount(now), new Received(me.receivedComfort.get(), me.receivedHug.get(), me.receivedWave.get()),
            care, null, fireworks.serverTime(), RestPresence.of(me), null, lighting, fireworks.events(), fireworks.cooldownUntil());
    }

    /** "sent" | "cooldown" | "gone". 종류가 이상하면 400 */
    private String care(Presence me, String toId, String kind, long now, boolean hugAllowed) {
        if (kind == null || !CARE_KINDS.contains(kind)) throw ApiException.badRequest("인사, 위로, 포옹 중에서 골라 주세요.");
        if ("hug".equals(kind) && !hugAllowed) return "forbidden";
        if (me.userId.equals(toId)) return "gone";
        if (me.excluded.contains(toId)) return "gone";
        List<Presence> targets = byTicket.values().stream()
            .filter(p -> p != me && p.userId.equals(toId) && live(p, now) && p.sees(me))
            .toList();
        if (targets.isEmpty()) return "gone";
        if (now - me.lastCareAt < CARE_GLOBAL_MS) return "cooldown";
        Long last = me.lastCareTo.get(toId);
        if (last != null && now - last < CARE_TARGET_MS) return "cooldown";
        me.lastCareAt = now;
        me.lastCareTo.entrySet().removeIf(e -> now - e.getValue() >= CARE_TARGET_MS);
        me.lastCareTo.put(toId, now);
        for (Presence t : targets) {
            CareEvent ev = new CareEvent(kind, me.pid, me.userId, me.nick, t.pid, t.userId, t.nick, now);
            switch (kind) {
                case "hug" -> t.receivedHug.incrementAndGet();
                case "wave" -> t.receivedWave.incrementAndGet();
                default -> t.receivedComfort.incrementAndGet();
            }
            for (Presence r : byTicket.values()) {
                if (r.bot()) continue; // 가짜 방문자는 inbox 를 비우지 않으니 쌓아 두지 않는다
                boolean recipient = r == me || r.userId.equals(t.userId) || dist2(r, t) <= CARE_RADIUS * CARE_RADIUS;
                if (!recipient) continue;
                if (r != me && !(r.sees(me) && me.sees(r) && r.sees(t) && t.sees(r))) continue;
                if (!live(r, now)) continue;
                r.inbox.offer(ev);
                while (r.inbox.size() > 200) r.inbox.poll(); // 한참 안 가져가면 오래된 것부터 버린다
            }
        }
        return "sent";
    }

    /* ---------- 정리 ---------- */

    /** 지금 바닷가에 있는 수 (가짜 방문자 포함). 필요하면 정리부터 */
    public int count() {
        long now = clock.getAsLong();
        maybeSweep(now);
        return liveCount(now);
    }

    /** 오래 tick 이 없는 사람을 내보내고 가짜 방문자를 움직인다 */
    public void sweep() { sweep(clock.getAsLong()); }

    private void maybeSweep(long now) {
        long last = lastSweep.get();
        if (now - last >= SWEEP_EVERY_MS && lastSweep.compareAndSet(last, now)) sweep(now);
    }

    private synchronized void sweep(long now) {
        lastSweep.set(now);
        byTicket.values().removeIf(p -> {
            synchronized (p) { return !p.bot() && !live(p, now); }
        });
        advanceBots(now);
    }

    private int liveCount(long now) {
        int n = 0;
        for (Presence p : byTicket.values()) if (live(p, now)) n++;
        return n;
    }

    private static boolean live(Presence p, long now) { return p.bot() || now - p.lastSeen <= IDLE_MS; }

    /**
     * 가짜 방문자는 시계의 함수라 어느 tick 에서 계산해도 같은 자리: x = cx + 2 sin(t/9000 + i), z = cz + 1.5 sin(t/13000 + 2i).
     * yaw 는 진행 방향 (facing = (-sin yaw, -cos yaw) 이라 yaw 0 이 바다 쪽), 0.15 m/s 보다 빠르면 걷는 중
     */
    private void advanceBots(long now) {
        for (Presence b : bots) {
            int i = b.botIndex;
            double t = now;
            double ax = t / 9000 + i, az = t / 13000 + 2 * i;
            double vx = 2 * Math.cos(ax) / 9;   // m/s
            double vz = 1.5 * Math.cos(az) / 13;
            double speed = Math.hypot(vx, vz);
            b.x = clamp(BOT_CENTERS[i - 1][0] + 2 * Math.sin(ax), MIN_X, MAX_X, b.x);
            b.z = clamp(BOT_CENTERS[i - 1][1] + 1.5 * Math.sin(az), MIN_Z, MAX_Z, b.z);
            b.moving = speed > 0.15;
            if (speed > 0.01) b.yaw = Math.atan2(-vx, -vz);
            b.lastSeen = now;
        }
    }

    /* ---------- 계산 ---------- */

    private static double clamp(double v, double min, double max, double fallback) {
        if (!Double.isFinite(v)) return fallback;
        return Math.max(min, Math.min(max, v));
    }

    private static double dist2(Presence a, Presence b) {
        double dx = a.x - b.x, dz = a.z - b.z;
        return dx * dx + dz * dz;
    }

    private static double round2(double v) { return Math.round(v * 100) / 100.0; }
}
