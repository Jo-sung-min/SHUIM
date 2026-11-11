package kr.co.shuim.beach;

import com.fasterxml.jackson.annotation.JsonInclude;
import kr.co.shuim.common.Ids;
import kr.co.shuim.common.SpaceCapacity;
import kr.co.shuim.config.ApiException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
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
    /** 세계 경계 (m). 물가는 z = 0, 바다는 z 가 음수 쪽. 들어오는 위치는 전부 이 안으로 자른다.
     *  MIN_Z 는 바닷가 앞 얕은 물로 양쪽 바위 끝(z ≈ -16) 바로 앞까지 걸어 들어갈 수 있게 (프론트는 물속 모래 경사를 따라 걷는다). */
    public static final double MIN_X = -22, MAX_X = 22, MIN_Z = -15, MAX_Z = 55;
    /** 각 소로우의 해변에 동시에 머물 수 있는 최대 방문 수 */
    public static final int CAPACITY = SpaceCapacity.MAX;
    private int capacity = CAPACITY;

    /** Admission limits come from the community policy, never from the visitor's request. */
    public synchronized void setCapacity(int capacity) {
        this.capacity = SpaceCapacity.effective(capacity);
    }
    /** 이만큼 tick 이 없으면 나간 것 */
    public static final long IDLE_MS = 10_000;
    /** Position bookmarks do not reserve capacity or rest slots, and never survive a server restart. */
    public static final long RESUME_MS = 30 * 60_000L;
    /** A lost response after restart must not turn one retry into another visitor. */
    static final long UNKNOWN_RESUME_RETRY_MS = 30_000;
    static final int MAX_RESUME_TICKETS = 500;
    private static final long MAX_SEQUENCE = 9_007_199_254_740_990L;
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
    public static final String HOTEL_DAWN_SPOT = "hotel-dawn", HOTEL_DUSK_SPOT = "hotel-dusk";
    public static final String HOTEL_DAWN_CHAISE = "hotel-dawn-chaise", HOTEL_DUSK_CHAISE = "hotel-dusk-chaise";
    public static final int HOTEL_BED_SLOTS = 2;
    public static final String BENCH_SPOT = "fire-benches";
    public static final int BENCH_SLOTS = 12;
    public static final double BENCH_REACH = 2.25;
    public static final String ONSEN_BENCH_SPOT = "onsen-benches", ONSEN_FLOAT_SPOT = "onsen-float";
    /** Every bath owns one run of slots, in this order; frontend lib/beach/onsen-rest.ts numbers them the same way. */
    private static final double[][] ONSEN_BATHS = {{0, 45}, {-7.6, 55}, {7.6, 55}};
    private static final int ONSEN_BENCHES_PER_BATH = 9, ONSEN_FLOATS_PER_BATH = 3;
    public static final int ONSEN_BENCH_SLOTS = ONSEN_BATHS.length * ONSEN_BENCHES_PER_BATH, ONSEN_FLOAT_SLOTS = ONSEN_BATHS.length * ONSEN_FLOATS_PER_BATH;
    public static final double ONSEN_X = 0, ONSEN_Z = 45, ONSEN_REACH = 2.2, ONSEN_BENCH_RADIUS = 3.55;
    /** Floating starts anywhere in the water and drifts within the bath; frontend lib/beach/onsen-rest.ts uses the same radius. */
    public static final double ONSEN_FLOAT_RADIUS = 3.5, ONSEN_WATER_RADIUS = 4.25;
    /** The beach map reaches back to the upper baths behind and above the first. */
    public static final double ONSEN_MAX_Z = 63;
    /** Bamboo-trail pavilions: six edge seats each, mirrored by the frontend trail layout (lib/beach/bamboo-trail.ts). */
    public static final int PAVILION_SLOTS = 6;
    public static final double PAVILION_REACH = 2.4;
    /** Local seat (lx, lz, facing lx, facing lz): pavilions seat two beside the steps and two on each open side. */
    private static final double[][] PAVILION_SEAT_LOCAL = {
        {-1.7, 2.42, 0, 1}, {1.7, 2.42, 0, 1},
        {-2.42, -0.9, -1, 0}, {-2.42, 0.9, -1, 0},
        {2.42, -0.9, 1, 0}, {2.42, 0.9, 1, 0}};
    /** The summit viewing deck seats six in a row along its railing, all facing the city. */
    private static final double[][] DECK_SEAT_LOCAL = {
        {-3.75, 2.2, 0, 1}, {-2.25, 2.2, 0, 1}, {-0.75, 2.2, 0, 1},
        {0.75, 2.2, 0, 1}, {2.25, 2.2, 0, 1}, {3.75, 2.2, 0, 1}};
    /** The garden hall seats six per tier on a bench row, stairs in the middle, everyone facing the glass (lib/beach/garden-layout.ts HALL_SEAT_LX). */
    private static final double[][] HALL_SEAT_LOCAL = {
        {-10.8, 0, 0, 1}, {-7.2, 0, 0, 1}, {-3.6, 0, 0, 1}, {3.6, 0, 0, 1}, {7.2, 0, 0, 1}, {10.8, 0, 0, 1}};
    private static final double[][] POND_SEAT_LOCAL = {{-.6, 0, 0, 1}, {.6, 0, 0, 1}};
    private static final double[][] CLOUD_LOUNGE_SEAT_LOCAL = {
        {-10.5, 2, 1, 0}, {-10.5, 0, 1, 0}, {-10.5, -2, 1, 0},
        {10.5, 2, -1, 0}, {10.5, 0, -1, 0}, {10.5, -2, -1, 0}};
    /** Matches cloud-spa-layout.ts: six submerged places; those on the cloud-edge side face outward over the valley, the rest face the centre. */
    private static double[][] cloudPoolSeats(double radius, int... outwardSlots) {
        double[][] seats = new double[6][4];
        for (int slot = 0; slot < seats.length; slot++) {
            double angle = slot * Math.PI / 3;
            final int current = slot;
            double facing = java.util.Arrays.stream(outwardSlots).anyMatch(outward -> outward == current) ? -1 : 1;
            seats[slot] = new double[]{Math.sin(angle) * radius, -Math.cos(angle) * radius, -Math.sin(angle) * facing, Math.cos(angle) * facing};
        }
        return seats;
    }
    /** Baikal lakeside cabin: the long sofa seats four in a row, the side sofa three, the hearth stools two, one armchair and a two-seat porch bench; everyone faces along the piece's own axis. */
    private static final double[][] BAIKAL_SOFA_SEAT_LOCAL = {{-2.25, 0, 0, 1}, {-0.75, 0, 0, 1}, {0.75, 0, 0, 1}, {2.25, 0, 0, 1}};
    private static final double[][] BAIKAL_SIDE_SEAT_LOCAL = {{-1.6, 0, 0, 1}, {0, 0, 0, 1}, {1.6, 0, 0, 1}};
    private static final double[][] BAIKAL_HEARTH_SEAT_LOCAL = {{-1.2, 0, 0, 1}, {1.2, 0, 0, 1}};
    private static final double[][] BAIKAL_CHAIR_SEAT_LOCAL = {{0, 0, 0, 1}};
    private static final double[][] BAIKAL_PORCH_SEAT_LOCAL = {{-.8, 0, 0, 1}, {.8, 0, 0, 1}};
    /** Centre and the unit axis the steps (pavilion) or the view (deck, hall) face. Right-hand axis is (-fz, fx). Each pavilion belongs to one map. */
    record Pavilion(String spot, double x, double z, double fx, double fz, double[][] seats, BeachMap map) {}
    private static Pavilion pondBench(String spot, double x, double z) {
        double dx = -x, dz = 34 - z, length = Math.hypot(dx, dz);
        return new Pavilion(spot, x, z, dx / length, dz / length, POND_SEAT_LOCAL, BeachMap.GARDEN);
    }
    static final List<Pavilion> PAVILIONS = List.of(
        new Pavilion("pavilion-step", 14, 10, -1, 0, PAVILION_SEAT_LOCAL, BeachMap.BAMBOO),
        new Pavilion("pavilion-wind", -33, 50, 1, 0, PAVILION_SEAT_LOCAL, BeachMap.BAMBOO),
        new Pavilion("pavilion-pine", 31, 58, -1, 0, PAVILION_SEAT_LOCAL, BeachMap.BAMBOO),
        new Pavilion("pavilion-moon", -18, 80, 1, 0, PAVILION_SEAT_LOCAL, BeachMap.BAMBOO),
        new Pavilion("pavilion-summit", 0, 100, 0, 1, DECK_SEAT_LOCAL, BeachMap.BAMBOO),
        // Spring-water garden: the island pavilion faces the bridge (west); hall tiers (glass at z=60) look south through the window.
        new Pavilion("pavilion-island", -15, 36, -1, 0, PAVILION_SEAT_LOCAL, BeachMap.GARDEN),
        new Pavilion("hall-tier-1", 0, 62.6, 0, -1, HALL_SEAT_LOCAL, BeachMap.GARDEN),
        new Pavilion("hall-tier-2", 0, 67.4, 0, -1, HALL_SEAT_LOCAL, BeachMap.GARDEN),
        new Pavilion("hall-tier-3", 0, 71.8, 0, -1, HALL_SEAT_LOCAL, BeachMap.GARDEN),
        new Pavilion("hall-tier-4", 0, 77, 0, -1, HALL_SEAT_LOCAL, BeachMap.GARDEN),
        pondBench("pond-bench-sw", -21.31678586, 9.13041650),
        pondBench("pond-bench-se", 27.05566953, 15.49022060),
        pondBench("pond-bench-w", -34.83661939, 34),
        pondBench("pond-bench-e", 39.92414302, 34),
        pondBench("pond-bench-nw", -30.53993522, 53.43450423),
        pondBench("pond-bench-ne", 27.90771696, 51.75945625),
        // Pamukkale terraces: five pools stacked three metres apart, zigzagging down towards the city.
        new Pavilion("cloud-pool-1", 0, 66, 0, -1, cloudPoolSeats(17, 1, 2, 4, 5), BeachMap.CLOUDSPA),
        new Pavilion("cloud-pool-2", -18, 34.8, 0, -1, cloudPoolSeats(16, 4, 5), BeachMap.CLOUDSPA),
        new Pavilion("cloud-pool-3", 0, 3.6, 0, -1, cloudPoolSeats(17, 1, 2, 4, 5), BeachMap.CLOUDSPA),
        new Pavilion("cloud-pool-4", 18, -27.6, 0, -1, cloudPoolSeats(16, 1, 2), BeachMap.CLOUDSPA),
        new Pavilion("cloud-pool-5", 0, -60.5, 0, -1, cloudPoolSeats(20, 2, 3, 4), BeachMap.CLOUDSPA),
        new Pavilion("cloud-lounge", 0, 104, 0, -1, CLOUD_LOUNGE_SEAT_LOCAL, BeachMap.CLOUDSPA),
        // Baikal cabin: the sofas and the armchair look east across the room, the side sofa and hearth stools face the fire (-Z), the porch bench faces the lake.
        new Pavilion("baikal-sofa", -23, 6.05, 1, 0, BAIKAL_SOFA_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-side", -22, 11, 0, -1, BAIKAL_SIDE_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-hearth", -23.4, 1.4, 0, -1, BAIKAL_HEARTH_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-chair", -18.6, 12.2, 1, 0, BAIKAL_CHAIR_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-porch", -14.6, 9.4, 1, 0, BAIKAL_PORCH_SEAT_LOCAL, BeachMap.BAIKAL),
        // The midway refuge and far aurora cabin share the first cabin's arrangement, with independent seats.
        new Pavilion("baikal-refuge-sofa", 12, -71.95, 1, 0, BAIKAL_SOFA_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-refuge-side", 13, -67, 0, -1, BAIKAL_SIDE_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-refuge-hearth", 11.6, -76.6, 0, -1, BAIKAL_HEARTH_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-refuge-chair", 16.4, -65.8, 1, 0, BAIKAL_CHAIR_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-refuge-porch", 20.4, -68.6, 1, 0, BAIKAL_PORCH_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-aurora-sofa", 65, -194.95, 1, 0, BAIKAL_SOFA_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-aurora-side", 66, -190, 0, -1, BAIKAL_SIDE_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-aurora-hearth", 64.6, -199.6, 0, -1, BAIKAL_HEARTH_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-aurora-chair", 69.4, -188.8, 1, 0, BAIKAL_CHAIR_SEAT_LOCAL, BeachMap.BAIKAL),
        new Pavilion("baikal-aurora-porch", 73.4, -191.6, 1, 0, BAIKAL_PORCH_SEAT_LOCAL, BeachMap.BAIKAL));
    private record RestSpot(String id, double x, double z, int capacity, boolean bed) {
        boolean hotel() { return HOTEL_DAWN_SPOT.equals(id) || HOTEL_DUSK_SPOT.equals(id); }
        boolean chaise() { return HOTEL_DAWN_CHAISE.equals(id) || HOTEL_DUSK_CHAISE.equals(id); }
        boolean bench() { return BENCH_SPOT.equals(id); }
        boolean onsen() { return ONSEN_BENCH_SPOT.equals(id) || ONSEN_FLOAT_SPOT.equals(id); }
        boolean pavilion() { return isPavilionSpot(id); }
        boolean bunker() { return BeachBunkers.forSofa(id) != null; }
        boolean sitting() { return bench() || ONSEN_BENCH_SPOT.equals(id) || pavilion() || bunker(); }
    }
    record BenchSeat(double x, double z, double yaw) {}
    /** Fixed spots first, then every pavilion: declared after FIXED_REST_SPOTS so static initialisation sees both tables. */
    private static Map<String, RestSpot> restSpots() {
        Map<String, RestSpot> spots = new LinkedHashMap<>(FIXED_REST_SPOTS);
        for (Pavilion p : PAVILIONS) spots.put(p.spot(), new RestSpot(p.spot(), p.x(), p.z(), p.seats().length, false));
        for (BeachBunkers.Bunker b : BeachBunkers.ALL) spots.put(b.sofa(), new RestSpot(b.sofa(), b.x(), b.z(), BeachBunkers.SOFA_SLOTS, false));
        return Collections.unmodifiableMap(spots);
    }
    private static final Map<String, RestSpot> FIXED_REST_SPOTS = Map.ofEntries(
        Map.entry(REST_SPOT, new RestSpot(REST_SPOT, REST_X, REST_Z, REST_SLOTS, false)),
        Map.entry("hut-pine", new RestSpot("hut-pine", -13, 24.8, BED_SLOTS, true)),
        Map.entry("hut-wave", new RestSpot("hut-wave", 0, 26.8, BED_SLOTS, true)),
        Map.entry("hut-sunset", new RestSpot("hut-sunset", 13, 24.8, BED_SLOTS, true)),
        Map.entry(BENCH_SPOT, new RestSpot(BENCH_SPOT, 0, 12, BENCH_SLOTS, false)),
        Map.entry(ONSEN_BENCH_SPOT, new RestSpot(ONSEN_BENCH_SPOT, ONSEN_X, ONSEN_Z, ONSEN_BENCH_SLOTS, false)),
        Map.entry(ONSEN_FLOAT_SPOT, new RestSpot(ONSEN_FLOAT_SPOT, ONSEN_X, ONSEN_Z, ONSEN_FLOAT_SLOTS, false)),
        Map.entry(HOTEL_DAWN_SPOT, new RestSpot(HOTEL_DAWN_SPOT, -12, 23, HOTEL_BED_SLOTS, true)),
        Map.entry(HOTEL_DUSK_SPOT, new RestSpot(HOTEL_DUSK_SPOT, 12, 29, HOTEL_BED_SLOTS, true)),
        Map.entry(HOTEL_DAWN_CHAISE, new RestSpot(HOTEL_DAWN_CHAISE, -12, 23, 2, true)),
        Map.entry(HOTEL_DUSK_CHAISE, new RestSpot(HOTEL_DUSK_CHAISE, 12, 29, 2, true)));
    private static final Map<String, RestSpot> REST_SPOTS = restSpots();

    static boolean isPavilionSpot(String spotId) {
        return spotId != null && PAVILIONS.stream().anyMatch(p -> p.spot().equals(spotId));
    }
    /** A pavilion (or hall tier) can only be claimed on the map it stands in. */
    static boolean pavilionOn(BeachMap map, String spotId) {
        return spotId != null && PAVILIONS.stream().anyMatch(p -> p.map() == map && p.spot().equals(spotId));
    }
    static boolean isHallSpot(String spotId) {
        return spotId != null && spotId.startsWith("hall-tier-");
    }
    static boolean isPondBenchSpot(String spotId) {
        return spotId != null && spotId.startsWith("pond-bench-") && pavilionOn(BeachMap.GARDEN, spotId);
    }

    private static Pavilion pavilionOf(RestSpot spot) {
        return PAVILIONS.stream().filter(p -> p.spot().equals(spot.id())).findFirst().orElseThrow();
    }

    /** Same orthonormal axes as the frontend seat table, including pond benches facing the lake centre. */
    static BenchSeat pavilionSeat(Pavilion p, int slot) {
        double[] s = p.seats()[slot];
        double rx = -p.fz(), rz = p.fx();
        double x = p.x() + s[0] * rx + s[1] * p.fx();
        double z = p.z() + s[0] * rz + s[1] * p.fz();
        double fx = s[2] * rx + s[3] * p.fx(), fz = s[2] * rz + s[3] * p.fz();
        return new BenchSeat(x, z, Math.atan2(0.0 - fx, 0.0 - fz));
    }

    /** Cloud-spa pool edges and the Baikal cabin furniture are bench-style seats: reached from a little farther than a pavilion floor edge. */
    private static boolean benchStyle(Pavilion pavilion) {
        return pavilion.map() == BeachMap.CLOUDSPA || pavilion.map() == BeachMap.BAIKAL;
    }

    private static int nearestPavilionSlot(Presence me, RestSpot spot, boolean[] used) {
        Pavilion pavilion = pavilionOf(spot);
        boolean nearby = false;
        int closest = -1;
        double closestDistance = Double.POSITIVE_INFINITY;
        for (int slot = 0; slot < spot.capacity(); slot++) {
            BenchSeat seat = pavilionSeat(pavilion, slot);
            double distance = Math.hypot(me.x - seat.x(), me.z - seat.z());
            if (distance > (benchStyle(pavilion) ? 2.5 : PAVILION_REACH) + 1e-9) continue;
            nearby = true;
            if (!used[slot] && distance < closestDistance) { closest = slot; closestDistance = distance; }
        }
        boolean hall = isHallSpot(spot.id()) || isPondBenchSpot(spot.id()) || benchStyle(pavilion);
        if (!nearby) throw ApiException.badRequest(hall ? "벤치 가까이에서 앉아 주세요." : "정자 마루 끝 가까이에서 앉아 주세요.");
        if (closest < 0) throw new ApiException(409, hall ? "가까운 자리가 모두 차 있어요. 벤치의 다른 자리로 다가가 주세요." : "가까운 자리가 모두 차 있어요. 마루의 다른 쪽으로 다가가 주세요.");
        return closest;
    }

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
                             String pose, String spotId, Integer slot, long updatedAt,
                             @JsonInclude(JsonInclude.Include.NON_NULL) FestivalState festival,
                             @JsonInclude(JsonInclude.Include.NON_NULL) String bunkerId) {
        public PlayerView(String pid, String id, String nick, int skin, double x, double z, double yaw, boolean moving,
                          String pose, String spotId, Integer slot, long updatedAt, FestivalState festival) {
            this(pid, id, nick, skin, x, z, yaw, moving, pose, spotId, slot, updatedAt, festival, null);
        }
        public PlayerView(String pid, String id, String nick, int skin, double x, double z, double yaw, boolean moving,
                          String pose, String spotId, Integer slot) {
            this(pid, id, nick, skin, x, z, yaw, moving, pose, spotId, slot, 0, null, null);
        }
        public PlayerView(String pid, String id, String nick, int skin, double x, double z, double yaw, boolean moving) {
            this(pid, id, nick, skin, x, z, yaw, moving, "standing", null, null);
        }
        static PlayerView of(Presence p) {
            return of(p, System.currentTimeMillis());
        }
        static PlayerView of(Presence p, long now) {
            synchronized (p) {
                return new PlayerView(p.pid, p.userId, p.nick, p.skin, round2(p.x), round2(p.z), round2(p.yaw), p.moving,
                    restPose(p), p.restSpot, p.restSlot, p.updatedAt, p.festival == null ? null : p.festivalAt(now), p.bunkerId);
            }
        }
    }

    /** Position and pose are returned together so clients can recover the authoritative resting state. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record RestPresence(String pose, String spotId, Integer slot, double x, double z, double yaw,
                               @JsonInclude(JsonInclude.Include.NON_NULL) String bunkerId) {
        public RestPresence(String pose, String spotId, Integer slot, double x, double z, double yaw) {
            this(pose, spotId, slot, x, z, yaw, null);
        }
        static RestPresence of(Presence p) {
            synchronized (p) {
                return new RestPresence(restPose(p), p.restSpot,
                    p.restSlot, p.x, p.z, p.yaw, p.bunkerId);
            }
        }
    }

    private static String restPose(Presence p) {
        return p.restSlot == null ? "standing"
            : BENCH_SPOT.equals(p.restSpot) || ONSEN_BENCH_SPOT.equals(p.restSpot) || isPavilionSpot(p.restSpot)
                || BeachBunkers.forSofa(p.restSpot) != null ? "sitting" : "lying";
    }

    private static BenchSeat benchSeat(int slot) {
        double angle = Math.PI / 6 + (slot / 2) * Math.PI / 3;
        double offset = slot % 2 == 0 ? -.5 : .5;
        return new BenchSeat(Math.sin(angle) * 4 + Math.cos(angle) * offset,
            12 + Math.cos(angle) * 4 - Math.sin(angle) * offset, angle);
    }

    private static double[] onsenBath(RestSpot spot, int slot) {
        return ONSEN_BATHS[slot / (ONSEN_FLOAT_SPOT.equals(spot.id()) ? ONSEN_FLOATS_PER_BATH : ONSEN_BENCHES_PER_BATH)];
    }

    private static BenchSeat onsenSlot(RestSpot spot, int slot) {
        double[] bath = onsenBath(spot, slot);
        if (ONSEN_FLOAT_SPOT.equals(spot.id())) return new BenchSeat(bath[0] + (slot % ONSEN_FLOATS_PER_BATH - 1) * 2.4, bath[1] - 1.7, 0);
        // The bench runs around three sides of the bath and every seat faces its middle.
        double angle = Math.toRadians(-30 + slot % ONSEN_BENCHES_PER_BATH * 30);
        return new BenchSeat(bath[0] + Math.cos(angle) * ONSEN_BENCH_RADIUS, bath[1] + Math.sin(angle) * ONSEN_BENCH_RADIUS, Math.atan2(Math.cos(angle), Math.sin(angle)));
    }

    private static boolean floating(Presence p) {
        return p.restSlot != null && ONSEN_FLOAT_SPOT.equals(p.restSpot);
    }

    /** A float is a place in a bath, not a mark on the map: the first free one in the water the visitor is in. */
    private static int freeFloatSlot(Presence me, boolean[] used) {
        for (int bath = 0; bath < ONSEN_BATHS.length; bath++) {
            if (Math.hypot(me.x - ONSEN_BATHS[bath][0], me.z - ONSEN_BATHS[bath][1]) > ONSEN_WATER_RADIUS + 1e-9) continue;
            for (int place = 0; place < ONSEN_FLOATS_PER_BATH; place++) {
                int slot = bath * ONSEN_FLOATS_PER_BATH + place;
                if (!used[slot]) return slot;
            }
            throw new ApiException(409, "이 탕에 떠 있을 자리가 모두 찼어요. 잠시 뒤 다시 해 주세요.");
        }
        throw ApiException.badRequest("온천 물 안에서 떠 있을 수 있어요.");
    }

    private static double[] insideFloatRadius(double x, double z, int slot) {
        double[] bath = ONSEN_BATHS[slot / ONSEN_FLOATS_PER_BATH];
        double dx = x - bath[0], dz = z - bath[1], distance = Math.hypot(dx, dz);
        if (distance <= ONSEN_FLOAT_RADIUS) return new double[]{x, z};
        double scale = ONSEN_FLOAT_RADIUS / distance;
        return new double[]{bath[0] + dx * scale, bath[1] + dz * scale};
    }

    private static int nearestOnsenSlot(Presence me, RestSpot spot, boolean[] used) {
        if (ONSEN_FLOAT_SPOT.equals(spot.id())) return freeFloatSlot(me, used);
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

    private static int nearestBunkerSlot(Presence me, RestSpot spot, boolean[] used) {
        BeachBunkers.Bunker bunker = BeachBunkers.forSofa(spot.id());
        boolean nearby = false;
        int closest = -1;
        double distance = Double.POSITIVE_INFINITY;
        for (int slot = 0; slot < spot.capacity(); slot++) {
            BenchSeat seat = bunker.seat(slot);
            double d = Math.hypot(me.x - seat.x(), me.z - seat.z());
            if (d > BeachBunkers.SOFA_REACH + 1e-9) continue;
            nearby = true;
            if (!used[slot] && d < distance) { closest = slot; distance = d; }
        }
        if (!nearby) throw ApiException.badRequest("의자나 소파 가까이에서 앉아 주세요.");
        if (closest < 0) throw new ApiException(409, "가까운 자리가 모두 차 있어요. 다른 자리로 다가가 주세요.");
        return closest;
    }

    private static int nearestChaiseSlot(Presence me, RestSpot spot, boolean[] used) {
        int closest = -1;
        boolean near = false;
        double nearest = Double.POSITIVE_INFINITY;
        for (int slot = 0; slot < 2; slot++) {
            double distance = Math.hypot(me.x - spot.x() - (slot == 0 ? -3.3 : 3.3), me.z - spot.z() + 6.6);
            if (distance > 2.2 + 1e-9) continue;
            near = true;
            if (!used[slot] && distance < nearest) { nearest = distance; closest = slot; }
        }
        if (!near) throw ApiException.badRequest("호텔 앞 의자 가까이에서 누워 주세요.");
        if (closest < 0) throw new ApiException(409, "가까운 의자에 다른 사람이 쉬고 있어요.");
        return closest;
    }

    /** 이번 방문에서 받은 위로·안아주기 수 */
    public record Received(int comfort, int hug, int wave) {
        public Received(int comfort, int hug) { this(comfort, hug, 0); }
    }
    public record CareCapabilities(boolean wave, boolean hug) {}

    public record PropellerFlight(UUID id, double x, double z, double yaw, long startedAt, int durationMs) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record FestivalState(String held, PropellerFlight flight, Integer balloonHue) {}
    public record FestivalChange(FestivalState festival, long serverTime) {}

    synchronized FestivalChange changeFestival(String ticket, String userId, UUID requestId, String choice) {
        long now = clock.getAsLong();
        Presence actor = ticket == null ? null : byTicket.get(ticket);
        if (actor == null || !live(actor, now) || actor.bot()) throw ApiException.gone(BeachController.GONE);
        if (!actor.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        if (map != BeachMap.BAMBOO || requestId == null || choice == null
            || !Set.of("balloon", "fan", "propeller", "put-away").contains(choice))
            throw ApiException.badRequest("대나무숲의 축제 소품을 다시 골라 주세요.");
        synchronized (actor) {
            if (actor.suspended) throw ApiException.gone(BeachController.GONE);
            FestivalState current = actor.festivalAt(now);
            if (requestId.equals(actor.festivalRequest))
                return new FestivalChange(current, now);
            PropellerFlight flight = current.flight();
            if ("propeller".equals(choice)) {
                if (flight != null) throw new ApiException(429, "프로펠러가 내려오면 다시 날릴 수 있어요.");
                flight = new PropellerFlight(requestId, actor.x, actor.z, actor.yaw, now, 6000);
            }
            Integer hue = "balloon".equals(choice) ? ThreadLocalRandom.current().nextInt(360) : null;
            actor.festival = new FestivalState("put-away".equals(choice) ? null : choice, flight, hue);
            actor.festivalRequest = requestId;
            return new FestivalChange(actor.festival, now);
        }
    }
    /** Room-wide, in-memory lighting. Null hour resumes the real time of day. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Lighting(String mode, Integer hour, long version) {}
    public static final Lighting AUTO_LIGHTING = new Lighting("auto", null, 0);
    static Lighting defaultLighting(BeachMap map) {
        return map == BeachMap.CLOUDSPA ? new Lighting("night", 20, 0) : AUTO_LIGHTING;
    }
    private volatile Lighting lighting = AUTO_LIGHTING;

    public Lighting lighting() { return lighting; }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Music(String trackId, String title, int durationMs, boolean playing, Long startedAt, long version) {
        private static Music playback(RoomMusicTrack track, Long startedAt, long version) {
            return new Music(track.id, track.title, track.durationMs, startedAt != null, startedAt, version);
        }
        private Music stopped() {
            return new Music(trackId, title, durationMs, false, null, version + 1);
        }
    }
    public record MusicState(Music music, long serverTime) {}
    static final Music SILENT = Music.playback(RoomMusicTrack.MORNING, null, 0);
    private Music music = SILENT;

    private Music musicAt(long now) {
        if (music.playing() && now - music.startedAt() >= music.durationMs())
            music = music.stopped();
        return music;
    }

    synchronized MusicState musicSnapshot() {
        long now = clock.getAsLong();
        return new MusicState(musicAt(now), now);
    }

    synchronized MusicState changeMusic(String ticket, String userId, String action, String trackId, Long expectedVersion) {
        long now = clock.getAsLong();
        Presence actor = ticket == null ? null : byTicket.get(ticket);
        if (actor == null || actor.bot() || actor.suspended || !live(actor, now)) throw ApiException.gone(BeachController.GONE);
        if (!actor.userId().equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        if (!"play".equals(action) && !"stop".equals(action))
            throw ApiException.badRequest("음악 재생 또는 정지를 골라 주세요.");
        if (expectedVersion == null || expectedVersion < 0 || expectedVersion >= MAX_SEQUENCE)
            throw ApiException.badRequest("음악 상태를 다시 확인해 주세요.");

        RoomMusicTrack selected = RoomMusicTrack.from(trackId);
        musicAt(now);
        // A delayed play/stop from before a newer command or the end of a song must not undo it.
        if (expectedVersion == music.version()) {
            if ("play".equals(action) && (!music.playing() || !music.trackId().equals(selected.id)))
                music = Music.playback(selected, now, music.version() + 1);
            else if ("stop".equals(action) && music.playing()) music = music.stopped();
        }
        return new MusicState(music, now);
    }

    synchronized boolean hasMusicListener(String userId) {
        long now = clock.getAsLong();
        return byTicket.values().stream().anyMatch(p -> p.userId().equals(userId) && !p.bot() && !p.suspended && live(p, now));
    }

    public static final int FIREWORK_DURATION_MS = 12_000;
    public static final int SONGI_FIREWORK_DURATION_MS = 18_000;
    public static final long FIREWORK_COOLDOWN_MS = 15_000;
    private static final Set<String> FIREWORK_VARIANTS = Set.of("festival", "songi", "love", "bloom", "saturn", "willow", "stardust", "offbeat", "aurora", "jewels");
    /** Validate before opening the ticket wallet, and again for direct room callers. */
    static String requireFireworkVariant(String variant) {
        String selected = variant == null ? "festival" : variant;
        if (!FIREWORK_VARIANTS.contains(selected)) throw ApiException.badRequest("불꽃놀이 종류를 다시 골라 주세요.");
        return selected;
    }
    private static final long FIREWORK_REQUEST_TTL_MS = 24 * 60 * 60 * 1_000L;
    public record FireworkEvent(String id, int seed, long startedAt, int durationMs, String variant) {}
    public record FireworksState(List<FireworkEvent> events, long cooldownUntil, long serverTime) {}
    /** tickets is the launcher's remaining firework tickets; administrators launch for free and get none. */
    public record FireworkLaunch(FireworkEvent event, long serverTime, long cooldownUntil, Integer tickets) {
        public FireworkLaunch(FireworkEvent event, long serverTime, long cooldownUntil) { this(event, serverTime, cooldownUntil, null); }
        public FireworkLaunch withTickets(int remaining) { return new FireworkLaunch(event, serverTime, cooldownUntil, remaining); }
    }
    private final LinkedHashMap<UUID, FireworkEvent> fireworkRequests = new LinkedHashMap<>();
    private FireworkEvent activeFirework;
    private long fireworksCooldownUntil;
    private final BeachUyuniMoments uyuniMoments = new BeachUyuniMoments();
    private final BeachGardenMoments gardenMoments = new BeachGardenMoments();

    synchronized BeachGardenMoments.Launch launchGardenMoment(String ticket, String userId, String requestId,
            String kind, Set<String> excluded) {
        long now = clock.getAsLong();
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        if (!me.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        if (map != BeachMap.GARDEN) throw ApiException.badRequest("봄물 정원의 연못에서 함께 띄워 주세요.");
        synchronized (me) {
            if (me.suspended || me.restSlot == null || !isPondBenchSpot(me.restSpot))
                throw new ApiException(409, "연못가 벤치에 앉은 뒤에 함께 띄워 주세요.");
            me.excluded = excluded == null ? Set.of() : Set.copyOf(excluded);
            gardenMoments.refreshExclusions(userId, me.excluded);
            return gardenMoments.launch(me, requestId, kind, gardenBlockedSenders(me), now);
        }
    }

    synchronized BeachGardenMoments.State gardenMoments(String ticket) {
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, clock.getAsLong())) throw ApiException.gone(BeachController.GONE);
        return gardenMomentsFor(me);
    }

    private Set<String> gardenBlockedSenders(Presence me) {
        return byTicket.values().stream().filter(p -> p.excluded.contains(me.userId))
            .map(Presence::userId).collect(java.util.stream.Collectors.toSet());
    }

    private synchronized BeachGardenMoments.State gardenMomentsFor(Presence me) {
        long now = clock.getAsLong();
        if (map != BeachMap.GARDEN) return new BeachGardenMoments.State(List.of(), BeachGardenMoments.NO_COOLDOWNS, now);
        return gardenMoments.snapshot(me.userId, me.excluded, gardenBlockedSenders(me), now);
    }

    /** The actor and room are rechecked under the same lock used by rest/leave. */
    synchronized BeachUyuniMoments.Launch launchUyuniMoment(String ticket, String userId, String requestId,
            String kind, String letter, String color, String wish, Set<String> excluded) {
        long now = clock.getAsLong();
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        if (!me.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        if (map != BeachMap.UYUNI) throw ApiException.badRequest("반짝이 글자와 소원 풍등은 우유니에서 함께 띄울 수 있어요.");
        synchronized (me) {
            if (me.bunkerId != null) throw new ApiException(409, "지상으로 올라온 뒤 함께 띄워 주세요.");
            if (me.suspended || me.restSlot != null) throw new ApiException(409, "일어난 뒤에 함께 띄워 주세요.");
            me.excluded = excluded == null ? Set.of() : Set.copyOf(excluded);
            uyuniMoments.refreshExclusions(userId, me.excluded);
            return uyuniMoments.launch(me, requestId, kind, letter, color, wish, now);
        }
    }

    synchronized BeachUyuniMoments.State uyuniMoments(String ticket) {
        long now = clock.getAsLong();
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        return uyuniMomentsFor(me);
    }

    private synchronized BeachUyuniMoments.State uyuniMomentsFor(Presence me) {
        long now = clock.getAsLong();
        if (map != BeachMap.UYUNI) return new BeachUyuniMoments.State(List.of(), BeachUyuniMoments.NO_COOLDOWNS, now);
        // Scan current sender exclusions once; old events also retain their launch-time exclusions after departure.
        Set<String> blockedSenders = byTicket.values().stream().filter(p -> p.excluded.contains(me.userId))
            .map(Presence::userId).collect(java.util.stream.Collectors.toSet());
        return uyuniMoments.snapshot(me.userId, me.excluded, blockedSenders, now);
    }

    public synchronized FireworksState fireworks() {
        long now = clock.getAsLong();
        boolean active = activeFirework != null && now >= activeFirework.startedAt()
            && now - activeFirework.startedAt() < activeFirework.durationMs();
        return new FireworksState(active ? List.of(activeFirework) : List.of(), fireworksCooldownUntil, now);
    }

    /** Session role and membership are checked by the controller; the room lock rechecks ticket ownership. */
    synchronized FireworkLaunch launchFireworks(String ticket, String userId, String requestId, String variant) {
        long now = clock.getAsLong();
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        if (!me.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        if (me.bunkerId != null) throw new ApiException(409, "지상으로 올라온 뒤 불꽃놀이를 시작해 주세요.");
        UUID key;
        try {
            if (requestId == null || requestId.length() != 36) throw new IllegalArgumentException();
            key = UUID.fromString(requestId);
            if (!key.toString().equalsIgnoreCase(requestId)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("불꽃놀이 요청을 다시 시도해 주세요.");
        }
        String selected = requireFireworkVariant(variant);
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
        int duration = "songi".equals(selected) ? SONGI_FIREWORK_DURATION_MS : FIREWORK_DURATION_MS;
        FireworkEvent event = new FireworkEvent(UUID.randomUUID().toString(), ThreadLocalRandom.current().nextInt(1, Integer.MAX_VALUE), now, duration, selected);
        activeFirework = event;
        // Keep the finale in the single shared event slot, with the same three-second pause after every show.
        fireworksCooldownUntil = now + duration + (FIREWORK_COOLDOWN_MS - FIREWORK_DURATION_MS);
        fireworkRequests.put(key, event);
        return new FireworkLaunch(event, now, fireworksCooldownUntil);
    }

    /** Called only after the controller verifies the current administrator and owned visit. */
    synchronized Lighting setLighting(String mode) {
        if (mode == null) throw ApiException.badRequest("방의 시간 설정을 다시 골라 주세요.");
        Integer hour = switch (mode) {
            case "auto" -> null;
            case "day" -> 12;
            case "sunset" -> 18;
            case "night" -> 20;
            case "rainy-night" -> {
                if (map != BeachMap.GARDEN) throw ApiException.badRequest("비 내리는 밤은 봄물 정원에서 감상할 수 있어요.");
                yield 21;
            }
            default -> throw ApiException.badRequest("방의 시간 설정을 다시 골라 주세요.");
        };
        // Repeated clicks/retries preserve the version; every actual change advances it.
        if (!mode.equals(lighting.mode())) lighting = new Lighting(mode, hour, lighting.version() + 1);
        return lighting;
    }

    /** tick 응답. care 는 위로를 보내지 않았으면 null ("sent" | "cooldown" | "gone") */
    public record TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                             BeachFireService.FireView fire, long serverTime, RestPresence selfRest,
                             @JsonInclude(JsonInclude.Include.NON_NULL) CareCapabilities careCapabilities, Lighting lighting,
                             List<FireworkEvent> fireworks, long fireworksCooldownUntil, long sequence,
                             List<BeachUyuniMoments.Event> uyuniMoments, BeachUyuniMoments.Cooldowns uyuniMomentCooldowns, Music music,
                             List<BeachGardenMoments.Event> gardenMoments, BeachGardenMoments.Cooldowns gardenMomentCooldowns,
                             @JsonInclude(JsonInclude.Include.NON_EMPTY) List<BeachBoardGames.View> boardGames) {
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                          BeachFireService.FireView fire, long serverTime, RestPresence selfRest,
                          CareCapabilities careCapabilities, Lighting lighting, List<FireworkEvent> fireworks, long fireworksCooldownUntil, long sequence,
                          List<BeachUyuniMoments.Event> uyuniMoments, BeachUyuniMoments.Cooldowns uyuniMomentCooldowns, Music music,
                          List<BeachGardenMoments.Event> gardenMoments, BeachGardenMoments.Cooldowns gardenMomentCooldowns) {
            this(players, events, count, received, care, fire, serverTime, selfRest, careCapabilities, lighting, fireworks, fireworksCooldownUntil, sequence,
                uyuniMoments, uyuniMomentCooldowns, music, gardenMoments, gardenMomentCooldowns, List.of());
        }
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                          BeachFireService.FireView fire, long serverTime, RestPresence selfRest,
                          CareCapabilities careCapabilities, Lighting lighting, List<FireworkEvent> fireworks, long fireworksCooldownUntil, long sequence) {
            this(players, events, count, received, care, fire, serverTime, selfRest, careCapabilities, lighting, fireworks,
                fireworksCooldownUntil, sequence, List.of(), BeachUyuniMoments.NO_COOLDOWNS, SILENT, List.of(), BeachGardenMoments.NO_COOLDOWNS);
        }
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                          BeachFireService.FireView fire, long serverTime, RestPresence selfRest,
                          CareCapabilities careCapabilities, Lighting lighting, List<FireworkEvent> fireworks, long fireworksCooldownUntil) {
            this(players, events, count, received, care, fire, serverTime, selfRest, careCapabilities, lighting, fireworks, fireworksCooldownUntil, 0);
        }
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
            return new TickResult(players, events, count, received, care, value, serverTime > 0 ? serverTime : value.serverTime(), selfRest, careCapabilities, lighting, fireworks, fireworksCooldownUntil, sequence, uyuniMoments, uyuniMomentCooldowns, music, gardenMoments, gardenMomentCooldowns, boardGames);
        }
        public TickResult withCareCapabilities(CareCapabilities capabilities, boolean denied) {
            return new TickResult(players, events, count, received, denied ? "forbidden" : care, fire, serverTime, selfRest, capabilities, lighting, fireworks, fireworksCooldownUntil, sequence, uyuniMoments, uyuniMomentCooldowns, music, gardenMoments, gardenMomentCooldowns, boardGames);
        }
    }

    /**
     * 바닷가에 있는 한 사람. ticket 은 비밀(본인만), pid 는 다른 사람에게 보여 주는 공개 id.
     * excluded 는 서로 차단한 유저 id: 서로 보이지도, 위로를 주고받지도 못한다.
     */
    public static final class Presence {
        private final String pid, ticket, userId;
        private volatile String nick;
        private volatile int skin;
        private final int botIndex; // 0 = 사람, 1..3 = 가짜 방문자
        private volatile Set<String> excluded;
        private volatile double x, z, yaw;
        private volatile boolean moving;
        private volatile Integer restSlot;
        private FestivalState festival;
        private UUID festivalRequest;

        synchronized FestivalState festivalAt(long now) {
            if (festival == null) return new FestivalState(null, null, null);
            PropellerFlight flight = festival.flight();
            if (flight != null && now >= flight.startedAt() + flight.durationMs())
                festival = new FestivalState(festival.held(), null, festival.balloonHue());
            return festival;
        }
        private volatile String restSpot;
        private volatile String bunkerId;
        private double surfaceX, surfaceZ, surfaceYaw;
        private long bunkerSequence = -1;
        private String bunkerAction, bunkerRequestId;
        private double standingX, standingZ, standingYaw;
        private volatile long lastSeen;
        private volatile long updatedAt;
        private long sequence;
        private boolean sequenced, suspended;
        private long lastResumeInput = -2;
        private ResumeBookmark bookmark;
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
            this.updatedAt = now;
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
        public String bunkerId() { return bunkerId; }
        public boolean moving() { return moving; }
        public long lastSeen() { return lastSeen; }
        public long updatedAt() { return updatedAt; }
        public synchronized long sequence() { return sequence; }
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
            // Old clients may still send a removed selection; migrate it to the ordinary model.
            case "male", "cat-gentleman", "mongsil" -> 0;
            case "female" -> 1;
            case "pixel-male" -> 2;
            case "female-3d", "cat-lady" -> 3;
            default -> throw ApiException.badRequest("캐릭터를 다시 골라 주세요.");
        };
    }

    private final BeachBoardGames boards = new BeachBoardGames();
    private final LongSupplier clock;
    private final BeachMap map;
    private final ConcurrentHashMap<String, Presence> byTicket = new ConcurrentHashMap<>();
    /** Aliases share a bookmark so a lost resume response cannot create a second visitor. */
    private static final class ResumeBookmark {
        final String userId;
        String currentTicket;
        int skin;
        double x, z, yaw;
        String bunkerId, bunkerAction, bunkerRequestId;
        double surfaceX, surfaceZ, surfaceYaw;
        long bunkerSequence = -1;
        long savedAt, sequence;
        String retryTicket;
        long retryExpiresAt;
        ResumeBookmark(String userId) { this.userId = userId; }
    }
    private final LinkedHashMap<String, ResumeBookmark> resumeTickets = new LinkedHashMap<>();
    public record Entry(Presence presence, boolean resumed) {}
    private final List<Presence> bots;
    private final AtomicLong lastSweep;

    /**
     * @param clock    현재 시각 (ms). 운영에서는 System::currentTimeMillis
     * @param simulate true 면 가짜 방문자 셋을 심어 둔다 (바닷가가 비어 보이지 않게)
     */
    public BeachRoom(LongSupplier clock, boolean simulate) {
        this(clock, simulate, BeachMap.BEACH);
    }

    public BeachRoom(LongSupplier clock, boolean simulate, BeachMap map) {
        this.clock = clock;
        this.map = java.util.Objects.requireNonNull(map);
        this.lighting = defaultLighting(map);
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

    /** Newcomers face the fire; the cloud spa looks straight down its terraces and at Baikal they turn slightly left towards the cabin. */
    private static double spawnYaw(BeachMap map, double x, double z) {
        return switch (map) {
            case CLOUDSPA -> 0;
            case BAIKAL -> 0.17;
            default -> Math.atan2(x, z - BeachFireService.FIRE_Z);
        };
    }

    public synchronized Presence enter(String userId, String nick, Set<String> excluded, String character) {
        return enter(userId, nick, excluded, character, null, null).presence();
    }

    public synchronized Entry enter(String userId, String nick, Set<String> excluded, String character,
                                    String resumeTicket, Long sequence) {
        validateSequence(sequence);
        Integer selectedSkin = selectedSkin(character);
        long now = clock.getAsLong();
        // 입장 확인과 추가를 같은 잠금 안에서 처리해 동시 입장에도 방의 정원을 넘지 않는다.
        sweep(now);
        Presence previous = resumeTicket == null ? null : byTicket.get(resumeTicket);
        ResumeBookmark bookmark = resumeTicket == null ? null : resumeTickets.get(resumeTicket);
        if (previous == null && bookmark != null) previous = byTicket.get(bookmark.currentTicket);
        String owner = previous != null ? previous.userId : bookmark == null ? null : bookmark.userId;
        if (owner != null && !owner.equals(userId)) throw ApiException.forbidden("내 방문으로만 돌아갈 수 있어요.");
        boolean restoredPosition = bookmark == null || !resumeTicket.equals(bookmark.retryTicket);
        if (previous != null) {
            synchronized (previous) {
                // This covers metadata too: an older membership/block snapshot must never undo a newer one.
                if (sequence != null && previous.sequenced && sequence < previous.sequence)
                    return new Entry(previous, restoredPosition);
                // Membership and block lists were reloaded by the authenticated entry controller.
                previous.nick = nick == null ? "" : nick;
                previous.excluded = excluded == null ? Set.of() : Set.copyOf(excluded);
                Set<String> refreshedExcluded = previous.excluded;
                previous.inbox.removeIf(event -> refreshedExcluded.contains(event.fromId()) || refreshedExcluded.contains(event.toId()));
                if (selectedSkin != null) previous.skin = selectedSkin;
                resumeFence(previous, sequence);
                previous.suspended = false;
                previous.moving = false;
                previous.lastSeen = now;
                previous.updatedAt = Math.max(previous.updatedAt + 1, now);
                return new Entry(previous, restoredPosition);
            }
        }
        if (byTicket.size() >= capacity) throw new ApiException(409, "지금 " + capacity + "명이 함께 쉬고 있어요. 잠시 후 다시 와 주세요.");
        ThreadLocalRandom r = ThreadLocalRandom.current();
        double x = bookmark == null ? r.nextDouble(-1.5, 1.5) : bookmark.x;
        double z = bookmark == null ? r.nextDouble(map.spawnMinZ(), map.spawnMaxZ()) : bookmark.z;
        Presence p = new Presence(Ids.randomHex(6), Ids.randomHex(16), userId, nick == null ? "" : nick,
            selectedSkin == null ? bookmark == null ? skinOf(userId) : bookmark.skin : selectedSkin, 0,
            excluded == null ? Set.of() : Set.copyOf(excluded), x, z,
            bookmark == null ? spawnYaw(map, x, z) : bookmark.yaw, now);
        if (bookmark != null) {
            p.bunkerId = bookmark.bunkerId;
            p.surfaceX = bookmark.surfaceX; p.surfaceZ = bookmark.surfaceZ; p.surfaceYaw = bookmark.surfaceYaw;
            p.bunkerSequence = bookmark.bunkerSequence; p.bunkerAction = bookmark.bunkerAction; p.bunkerRequestId = bookmark.bunkerRequestId;
            p.bookmark = bookmark;
            p.sequence = bookmark.sequence;
            resumeFence(p, sequence);
            bookmark.currentTicket = p.ticket;
        } else if (resumeTicket != null) {
            // Unknown tokens cannot recover a position, but briefly alias the fresh result for retries.
            // They remain in the same bounded map, have an authenticated owner, and cannot be used to tick.
            ResumeBookmark retry = new ResumeBookmark(userId);
            retry.currentTicket = p.ticket;
            retry.skin = p.skin;
            retry.x = p.x;
            retry.z = p.z;
            retry.yaw = p.yaw;
            retry.savedAt = now;
            retry.retryTicket = resumeTicket;
            retry.retryExpiresAt = now + UNKNOWN_RESUME_RETRY_MS;
            p.bookmark = retry;
            resumeFence(p, sequence);
            retry.sequence = p.sequence;
            resumeTickets.put(resumeTicket, retry);
            trimResumeTickets();
        }
        byTicket.put(p.ticket, p);
        return new Entry(p, bookmark != null && restoredPosition);
    }

    private static void resumeFence(Presence p, Long sequence) {
        long input = sequence == null ? -1 : sequence;
        if (p.suspended || p.lastResumeInput != input) {
            p.sequence = Math.min(MAX_SEQUENCE, Math.max(p.sequence, Math.max(0, input)) + 1);
            p.lastResumeInput = input;
        }
        if (sequence != null) p.sequenced = true;
    }

    static void validateSequence(Long sequence) {
        if (sequence != null && (sequence < 0 || sequence >= MAX_SEQUENCE))
            throw ApiException.badRequest("방문 요청 순서를 다시 확인해 주세요.");
    }

    private static boolean accepts(Presence p, Long sequence) {
        return sequence == null ? !p.sequenced : sequence > p.sequence;
    }

    private static void acceptSequence(Presence p, Long sequence) {
        if (sequence != null) { p.sequence = sequence; p.sequenced = true; }
    }

    /** Hidden tabs stop moving immediately; duplicate beacons never renew their ten-second lease. */
    public synchronized void suspend(String ticket, double x, double z, double yaw, Long sequence) {
        suspend(ticket, x, z, yaw, sequence, null);
    }

    public synchronized void suspend(String ticket, double x, double z, double yaw, Long sequence, String bunkerId) {
        validateSequence(sequence);
        BeachBunkers.validate(map, bunkerId);
        long now = clock.getAsLong();
        sweep(now);
        Presence p = ticket == null ? null : byTicket.get(ticket);
        if (p == null || p.bot()) return;
        synchronized (p) {
            if (p.suspended || !accepts(p, sequence) || !Objects.equals(p.bunkerId, bunkerId)) return;
            acceptSequence(p, sequence);
            updatePosition(p, x, z, yaw, false, null, now);
            p.suspended = true;
            p.lastSeen = now;
        }
    }

    /** Called during service cleanup, after one sweep per room. */
    synchronized boolean retainsTicket(String ticket) {
        return byTicket.containsKey(ticket) || resumeTickets.containsKey(ticket);
    }

    synchronized int resumeTicketCount() { return resumeTickets.size(); }

    private void remember(Presence p, long now) {
        if (now < p.lastSeen || now - p.lastSeen > RESUME_MS) return;
        ResumeBookmark b = p.bookmark == null ? new ResumeBookmark(p.userId) : p.bookmark;
        b.currentTicket = p.ticket;
        b.skin = p.skin;
        boolean held = p.restSlot != null && !floating(p);
        b.x = held ? p.standingX : p.x;
        b.z = held ? p.standingZ : p.z;
        b.yaw = held ? p.standingYaw : p.yaw;
        b.bunkerId = p.bunkerId;
        b.surfaceX = p.surfaceX; b.surfaceZ = p.surfaceZ; b.surfaceYaw = p.surfaceYaw;
        b.bunkerSequence = p.bunkerSequence; b.bunkerAction = p.bunkerAction; b.bunkerRequestId = p.bunkerRequestId;
        b.savedAt = p.lastSeen;
        b.sequence = p.sequence;
        resumeTickets.put(p.ticket, b);
        trimResumeTickets();
    }

    private void trimResumeTickets() {
        while (resumeTickets.size() > MAX_RESUME_TICKETS) resumeTickets.remove(resumeTickets.keySet().iterator().next());
    }

    /** 나간다. 모르는 티켓이어도 조용히 지나간다 */
    public synchronized void leave(String ticket) {
        if (ticket == null) return;
        Presence p = byTicket.get(ticket);
        if (p != null && !p.bot()) {
            synchronized (p) {
                byTicket.remove(ticket, p);
                ResumeBookmark b = p.bookmark;
                if (b != null) resumeTickets.values().removeIf(value -> value == b);
            }
        }
        ResumeBookmark b = resumeTickets.remove(ticket);
        // A delayed leave for an old alias must never remove its replacement visit.
        if (b != null && ticket.equals(b.currentTicket)) resumeTickets.values().removeIf(value -> value == b);
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
        // Standing usually names no spot; the implied default must not be rejected on a map without a starlight circle.
        if ((spotId != null || !"stand".equals(action)) && !map.supportsRestSpot(spot.id()))
            throw ApiException.badRequest("이 지도에서 이용할 수 있는 쉴 자리를 골라 주세요.");
        if (!"stand".equals(action) && "sit".equals(action) != spot.sitting())
            throw ApiException.badRequest("앉거나 누울 수 있는 자리를 다시 골라 주세요.");
        synchronized (me) {
            if (me.suspended) throw new ApiException(409, "바닷가로 돌아온 뒤 다시 쉬어 주세요.");
            BeachBunkers.Bunker bunker = BeachBunkers.forSofa(spot.id());
            if (!"stand".equals(action) && !Objects.equals(me.bunkerId, bunker == null ? null : bunker.id()))
                throw ApiException.badRequest("지금 머무는 층의 쉴 자리를 골라 주세요.");
            if ("stand".equals(action)) {
                if (me.restSlot != null) {
                    if (!floating(me)) { // A floating visitor simply stands up wherever it drifted to.
                        me.x = clamp(me.standingX, map.minX(), map.maxX(), REST_X);
                        me.z = clamp(me.standingZ, map.minZ(), map.maxZ(), REST_Z + REST_REACH);
                        me.yaw = me.standingYaw;
                    }
                    me.restSlot = null;
                    me.restSpot = null;
                    me.updatedAt = Math.max(me.updatedAt + 1, now);
                }
                if (me.moving) me.updatedAt = Math.max(me.updatedAt + 1, now);
                me.moving = false;
                me.lastSeen = now;
                return RestPresence.of(me);
            }
            if (me.restSlot != null) {
                if (!spot.id().equals(me.restSpot)) throw new ApiException(409, "먼저 일어난 뒤 다른 자리를 골라 주세요.");
                me.lastSeen = now;
                return RestPresence.of(me); // Lost responses can be retried without taking another slot.
            }
            double reachZ = spot.z() + (spot.bed() && !spot.hotel() ? BED_FEET_OFFSET_Z : 0);
            if (spot.hotel()) {
                // A radial check alone permits claims through the side/back walls. Stay inside the hotel footprint too.
                double dx = me.x - spot.x(), dz = me.z - spot.z();
                if (Math.abs(dx) > 4.35 + 1e-9 || dz < -4.5 - 1e-9 || dz > 4.45 + 1e-9
                    || Math.hypot(dx, dz) > REST_REACH + 1e-9)
                    throw ApiException.badRequest("호텔 안으로 들어와 침구 가까이에서 누워 주세요.");
            } else if (!spot.chaise() && !spot.bench() && !spot.onsen() && !spot.pavilion() && !spot.bunker() && Math.hypot(me.x - spot.x(), me.z - reachZ) > REST_REACH) {
                throw ApiException.badRequest(spot.bed() ? "오두막 가까이에서 누워 주세요." : "별빛 자리 가까이에서 누워 주세요.");
            }
            boolean[] used = new boolean[spot.capacity()];
            for (Presence other : byTicket.values()) {
                Integer slot = other.restSlot;
                if (slot != null && spot.id().equals(other.restSpot) && live(other, now)) used[slot] = true;
            }
            boolean nearestSeat = spot.chaise() || spot.bench() || spot.onsen() || spot.pavilion() || spot.bunker();
            int slot = spot.chaise() ? nearestChaiseSlot(me, spot, used) : spot.bench() ? nearestBenchSlot(me, used) : spot.onsen() ? nearestOnsenSlot(me, spot, used)
                : spot.pavilion() ? nearestPavilionSlot(me, spot, used) : spot.bunker() ? nearestBunkerSlot(me, spot, used) : 0;
            if (!nearestSeat) while (slot < spot.capacity() && used[slot]) slot++;
            if (slot == spot.capacity()) throw new ApiException(409, spot.hotel()
                ? "이 호텔의 침구가 모두 사용 중이에요. 다른 호텔을 골라 주세요."
                : spot.bed() ? "이 오두막의 침구가 모두 사용 중이에요. 다른 오두막을 골라 주세요." : "별빛 자리가 모두 차 있어요. 잠시 뒤 다시 와 주세요.");
            me.standingX = me.x;
            me.standingZ = me.z;
            me.standingYaw = me.yaw;
            if (spot.onsen()) {
                // Keep the saved return point inside the water, clear of the rim and rear seat slabs.
                double[] bath = onsenBath(spot, slot);
                double radius = Math.hypot(me.x - bath[0], me.z - bath[1]);
                double scale = radius > 2.7 ? 2.7 / radius : 1;
                me.standingX = bath[0] + (me.x - bath[0]) * scale;
                me.standingZ = bath[1] + (me.z - bath[1]) * scale;
            }
            if (ONSEN_FLOAT_SPOT.equals(spot.id())) {
                double[] inside = insideFloatRadius(me.x, me.z, slot);
                me.x = inside[0];
                me.z = inside[1];
            } else if (nearestSeat && !spot.chaise()) {
                BenchSeat seat = spot.onsen() ? onsenSlot(spot, slot) : spot.pavilion() ? pavilionSeat(pavilionOf(spot), slot)
                    : spot.bunker() ? bunker.seat(slot) : benchSeat(slot);
                me.x = seat.x();
                me.z = seat.z();
                me.yaw = seat.yaw();
            } else {
                double theta = spot.bed() ? Math.PI : slot * Math.PI * 2 / REST_SLOTS;
                me.x = spot.chaise() ? spot.x() + (slot == 0 ? -3.3 : 3.3) : spot.hotel() ? spot.x() + (slot - .5) * 3
                    : spot.bed() ? spot.x() + (slot - 1) * 1.9 : spot.x() + Math.sin(theta) * REST_FEET_RADIUS;
                me.z = spot.chaise() ? spot.z() - 7.5 : spot.bed() ? spot.z() + BED_FEET_OFFSET_Z : spot.z() + Math.cos(theta) * REST_FEET_RADIUS;
                me.yaw = theta;
            }
            me.restSpot = spot.id();
            me.restSlot = slot;
            me.moving = false;
            me.lastSeen = now;
            me.updatedAt = Math.max(me.updatedAt + 1, now);
            return RestPresence.of(me);
        }
    }

    /* ---------- tick ---------- */

    /** A sequenced transition is the only way to change floors; delayed surface polls cannot move an indoor visitor. */
    synchronized RestPresence bunker(String ticket, String userId, String action, String bunkerId, Long sequence) {
        validateSequence(sequence);
        BeachBunkers.validate(map, bunkerId);
        BeachBunkers.Bunker bunker = BeachBunkers.find(bunkerId);
        if (sequence == null || bunker == null || (!"enter".equals(action) && !"exit".equals(action)))
            throw ApiException.badRequest("지하 쉼터의 출입을 다시 확인해 주세요.");
        long now = clock.getAsLong();
        sweep(now);
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        if (!me.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        synchronized (me) {
            if (me.suspended) throw ApiException.gone(BeachController.GONE);
            if (sequence == me.bunkerSequence) {
                if (!Objects.equals(action, me.bunkerAction) || !Objects.equals(bunkerId, me.bunkerRequestId))
                    throw new ApiException(409, "진행 중인 출입을 먼저 확인해 주세요.");
                return RestPresence.of(me);
            }
            if (!accepts(me, sequence)) return RestPresence.of(me);
            boolean alreadyThere = "enter".equals(action) && bunkerId.equals(me.bunkerId);
            boolean alreadyOutside = "exit".equals(action) && me.bunkerId == null
                && "exit".equals(me.bunkerAction) && bunkerId.equals(me.bunkerRequestId);
            if (!alreadyThere && !alreadyOutside) {
                if (me.restSlot != null) throw new ApiException(409, "먼저 일어난 뒤 사다리를 이용해 주세요.");
                if ("enter".equals(action)) {
                    if (me.bunkerId != null) throw new ApiException(409, "지상으로 올라온 뒤 다른 쉼터를 이용해 주세요.");
                    if (Math.hypot(me.x - bunker.x(), me.z - bunker.entryZ()) > BeachBunkers.ENTRY_REACH + 1e-9)
                        throw ApiException.badRequest("호텔 앞 출입구 가까이에서 내려가 주세요.");
                    me.surfaceX = me.x; me.surfaceZ = me.z; me.surfaceYaw = me.yaw;
                    me.bunkerId = bunkerId;
                    me.x = bunker.x(); me.z = bunker.arrivalZ(); me.yaw = Math.PI;
                } else {
                    if (!bunkerId.equals(me.bunkerId)) throw ApiException.badRequest("지금 머무는 쉼터의 사다리를 이용해 주세요.");
                    if (Math.hypot(me.x - bunker.x(), me.z - bunker.entryZ()) > BeachBunkers.ENTRY_REACH + 1e-9)
                        throw ApiException.badRequest("사다리 가까이에서 올라가 주세요.");
                    me.bunkerId = null;
                    me.x = me.surfaceX; me.z = me.surfaceZ; me.yaw = me.surfaceYaw;
                }
                me.moving = false;
                me.inbox.clear();
                me.updatedAt = Math.max(me.updatedAt + 1, now);
            }
            acceptSequence(me, sequence);
            me.bunkerSequence = sequence; me.bunkerAction = action; me.bunkerRequestId = bunkerId;
            me.lastSeen = now;
            return RestPresence.of(me);
        }
    }

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
        return tick(ticket, x, z, yaw, moving, careTo, careKind, character, hugAllowed, null);
    }

    public TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind,
                           String character, boolean hugAllowed, Long sequence) {
        return tick(ticket, x, z, yaw, moving, careTo, careKind, character, hugAllowed, sequence, null);
    }

    public TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind,
                           String character, boolean hugAllowed, Long sequence, String bunkerId) {
        validateSequence(sequence);
        BeachBunkers.validate(map, bunkerId);
        Integer skin = selectedSkin(character);
        long now = clock.getAsLong();
        maybeSweep(now);
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot()) return null;
        String care = null;
        List<CareEvent> events = new ArrayList<>();
        long acceptedSequence;
        double originX, originZ;
        String originBunker;
        RestPresence selfState;
        synchronized (me) {
            // Expiry is archived by the room sweep, never discarded by an individual poll.
            if (byTicket.get(ticket) != me || !live(me, now)) return null;
            if (!me.suspended && accepts(me, sequence)) {
                acceptSequence(me, sequence);
                me.lastSeen = now;
                // A lost transition response is repaired by this acknowledged poll. An old layer
                // cannot move, change appearance, send care or drain inboxes on the new floor.
                if (Objects.equals(me.bunkerId, bunkerId)) {
                    updatePosition(me, x, z, yaw, moving, skin, now);
                    // Serialize care with this visitor's sequence so a retry cannot send twice.
                    care = careTo == null || careTo.isBlank() ? null : care(me, careTo.strip(), careKind, now, hugAllowed);
                    for (CareEvent e; (e = me.inbox.poll()) != null; ) events.add(e);
                }
            }
            acceptedSequence = me.sequence;
            originX = me.x;
            originZ = me.z;
            originBunker = me.bunkerId;
            selfState = RestPresence.of(me);
        }
        advanceBots(now);

        // Other ticks update Presence concurrently. Sort immutable coordinates so comparisons stay consistent.
        List<PlayerView> players = byTicket.values().stream()
            .filter(p -> p != me && live(p, now) && me.sees(p) && p.sees(me))
            .map(p -> PlayerView.of(p, now))
            .filter(p -> Objects.equals(originBunker, p.bunkerId()))
            .sorted(Comparator.comparingDouble(p -> {
                double dx = p.x() - originX, dz = p.z() - originZ;
                return dx * dx + dz * dz;
            }))
            .limit(MAX_PLAYERS)
            .toList();
        FireworksState fireworks = fireworks();
        BeachUyuniMoments.State moments = uyuniMomentsFor(me);
        BeachGardenMoments.State pond = gardenMomentsFor(me);
        MusicState playback = musicSnapshot();
        return new TickResult(players, events, liveCount(now), new Received(me.receivedComfort.get(), me.receivedHug.get(), me.receivedWave.get()),
            care, null, playback.serverTime(), selfState, null, lighting, fireworks.events(), fireworks.cooldownUntil(), acceptedSequence,
            moments.events(), moments.cooldowns(), playback.music(), pond.events(), pond.cooldowns(),
            originBunker == null ? List.of() : boards.views(originBunker, now, boardPresent(now), p -> me.sees(p) && p.sees(me)));
    }

    /** A seat lasts only while its visitor is still in that lodge. */
    private java.util.function.BiPredicate<Presence, String> boardPresent(long now) {
        return (p, bunkerId) -> byTicket.get(p.ticket) == p && live(p, now) && bunkerId.equals(p.bunkerId);
    }

    BeachBoardGames.View board(String ticket, String userId, String action, String tableId, Integer cell, Long version) {
        BeachBoardGames.Spot spot = BeachBoardGames.find(tableId);
        if (map != BeachMap.UYUNI || spot == null) throw ApiException.badRequest("게임 자리를 다시 확인해 주세요.");
        long now = clock.getAsLong();
        maybeSweep(now);
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot() || !live(me, now)) throw ApiException.gone(BeachController.GONE);
        if (!me.userId.equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        if (!spot.bunkerId().equals(me.bunkerId)) throw ApiException.badRequest("그 쉼터 안에서 이용해 주세요.");
        if ("join".equals(action) && Math.hypot(me.x - spot.x(), me.z - spot.z()) > BeachBoardGames.REACH)
            throw ApiException.badRequest("게임 테이블 가까이에서 앉아 주세요.");
        return boards.act(spot, me, action, cell, version, now, boardPresent(now), p -> me.sees(p) && p.sees(me));
    }

    private void updatePosition(Presence p, double x, double z, double yaw, boolean moving, Integer skin, long now) {
        BeachBunkers.Bunker bunker = BeachBunkers.find(p.bunkerId);
        boolean free = p.restSlot == null || floating(p);
        double nextX = free ? clamp(x, bunker == null ? map.minX() : bunker.minX(), bunker == null ? map.maxX() : bunker.maxX(), p.x) : p.x;
        double nextZ = free ? clamp(z, bunker == null ? map.minZ() : bunker.minZ(), bunker == null ? map.maxZ() : bunker.maxZ(), p.z) : p.z;
        if (floating(p)) {
            double[] inside = insideFloatRadius(nextX, nextZ, p.restSlot);
            nextX = inside[0];
            nextZ = inside[1];
        }
        double nextYaw = free && Double.isFinite(yaw) ? yaw : p.yaw;
        boolean nextMoving = free && moving;
        if (nextX != p.x || nextZ != p.z || nextYaw != p.yaw || nextMoving != p.moving || (skin != null && skin != p.skin))
            p.updatedAt = Math.max(p.updatedAt + 1, now);
        p.x = nextX;
        p.z = nextZ;
        p.yaw = nextYaw;
        p.moving = nextMoving;
        if (skin != null) p.skin = skin;
    }

    /** "sent" | "cooldown" | "gone". 종류가 이상하면 400 */
    private String care(Presence me, String toId, String kind, long now, boolean hugAllowed) {
        if (kind == null || !CARE_KINDS.contains(kind)) throw ApiException.badRequest("인사, 위로, 포옹 중에서 골라 주세요.");
        if ("hug".equals(kind) && !hugAllowed) return "forbidden";
        if (me.userId.equals(toId)) return "gone";
        if (me.excluded.contains(toId)) return "gone";
        List<Presence> targets = byTicket.values().stream()
            .filter(p -> p != me && p.userId.equals(toId) && live(p, now) && p.sees(me) && Objects.equals(me.bunkerId, p.bunkerId))
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
                if (!Objects.equals(r.bunkerId, me.bunkerId)) continue;
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
        if ((now < last || now - last >= SWEEP_EVERY_MS) && lastSweep.compareAndSet(last, now)) sweep(now);
    }

    private synchronized void sweep(long now) {
        lastSweep.set(now);
        byTicket.values().removeIf(p -> {
            synchronized (p) {
                // A small wall-clock correction must not disconnect active polling clients.
                // Hidden leases instead expire, and archived future-dated bookmarks are discarded.
                if (!p.suspended && now < p.lastSeen) p.lastSeen = now;
                if (p.bot() || live(p, now)) return false;
                remember(p, now);
                return true;
            }
        });
        resumeTickets.entrySet().removeIf(entry -> {
            ResumeBookmark b = entry.getValue();
            return now < b.savedAt || now - b.savedAt > RESUME_MS
                || (entry.getKey().equals(b.retryTicket) && now > b.retryExpiresAt);
        });
        advanceBots(now);
    }

    private int liveCount(long now) {
        int n = 0;
        for (Presence p : byTicket.values()) if (live(p, now)) n++;
        return n;
    }

    private static boolean live(Presence p, long now) {
        return p.bot() || ((!p.suspended || now >= p.lastSeen) && now - p.lastSeen <= IDLE_MS);
    }

    /**
     * 가짜 방문자는 시계의 함수라 어느 tick 에서 계산해도 같은 자리: x = cx + 2 sin(t/9000 + i), z = cz + 1.5 sin(t/13000 + 2i).
     * yaw 는 진행 방향 (facing = (-sin yaw, -cos yaw) 이라 yaw 0 이 바다 쪽), 0.15 m/s 보다 빠르면 걷는 중
     */
    private void advanceBots(long now) {
        for (Presence b : bots) {
            synchronized (b) {
            int i = b.botIndex;
            double t = now;
            double ax = t / 9000 + i, az = t / 13000 + 2 * i;
            double vx = 2 * Math.cos(ax) / 9;   // m/s
            double vz = 1.5 * Math.cos(az) / 13;
            double speed = Math.hypot(vx, vz);
            b.x = clamp(BOT_CENTERS[i - 1][0] + 2 * Math.sin(ax), map.minX(), map.maxX(), b.x);
            b.z = clamp(BOT_CENTERS[i - 1][1] + 1.5 * Math.sin(az), map.minZ(), map.maxZ(), b.z);
            b.moving = speed > 0.15;
            if (speed > 0.01) b.yaw = Math.atan2(-vx, -vz);
            b.lastSeen = now;
            b.updatedAt = now;
            }
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
