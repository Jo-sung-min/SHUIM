package kr.co.shuim.beach;

import kr.co.shuim.common.Ids;
import kr.co.shuim.config.ApiException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    public static final double MIN_X = -22, MAX_X = 22, MIN_Z = -1, MAX_Z = 31;
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
    public static final Set<String> CARE_KINDS = Set.of("comfort", "hug");

    /** 가짜 방문자: 아이디 bot-1..3, 느리게 정해진 길을 오간다. 위로는 받지만 보내지는 않고, 나가지도 않는다 */
    private static final String[] BOT_NICKS = {"바람", "파도", "조개"};
    private static final int[] BOT_SKINS = {1, 0, 0};
    private static final double[][] BOT_CENTERS = {{-5, 8}, {5, 11}, {0, 16}};

    private static final long NEVER = Long.MIN_VALUE / 4;

    /** 위로해주기·안아주기 한 번. 받는 사람(presence 마다 하나), 보낸 사람, 근처 사람의 inbox 에 들어간다 */
    public record CareEvent(String kind, String fromPid, String fromId, String fromNick, String toPid, String toId, String toNick, long at) {}

    /** 다른 사람에게 보여 주는 모습. id 는 유저 id (위로를 보낼 때 쓴다), pid 는 이번 방문의 공개 id */
    public record PlayerView(String pid, String id, String nick, int skin, double x, double z, double yaw, boolean moving) {
        static PlayerView of(Presence p) {
            return new PlayerView(p.pid, p.userId, p.nick, p.skin, round2(p.x), round2(p.z), round2(p.yaw), p.moving);
        }
    }

    /** 이번 방문에서 받은 위로·안아주기 수 */
    public record Received(int comfort, int hug) {}

    /** tick 응답. care 는 위로를 보내지 않았으면 null ("sent" | "cooldown" | "gone") */
    public record TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care,
                             BeachFireService.FireView fire, long serverTime) {
        public TickResult(List<PlayerView> players, List<CareEvent> events, int count, Received received, String care) {
            this(players, events, count, received, care, null, 0);
        }
        public TickResult withFire(BeachFireService.FireView value) {
            return new TickResult(players, events, count, received, care, value, value.serverTime());
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
        private volatile long lastSeen;
        private volatile long lastCareAt = NEVER;
        private final Map<String, Long> lastCareTo = new ConcurrentHashMap<>();
        private final ConcurrentLinkedQueue<CareEvent> inbox = new ConcurrentLinkedQueue<>();
        private final AtomicInteger receivedComfort = new AtomicInteger();
        private final AtomicInteger receivedHug = new AtomicInteger();

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

    /** 선택이 없는 기존 방문도 남자 0 · 여자 1 중 같은 기본 모습으로 입장한다. */
    public static int skinOf(String userId) { return Math.floorMod(userId.hashCode(), 2); }

    static Integer selectedSkin(String character) {
        if (character == null) return null;
        return switch (character) {
            case "male" -> 0;
            case "female" -> 1;
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
    public void leave(String ticket) {
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
        long now = clock.getAsLong();
        maybeSweep(now);
        Presence me = ticket == null ? null : byTicket.get(ticket);
        if (me == null || me.bot()) return null;
        if (!live(me, now)) {
            byTicket.remove(ticket, me);
            return null;
        }
        Integer selectedSkin = selectedSkin(character);
        if (selectedSkin != null) me.skin = selectedSkin;
        me.x = clamp(x, MIN_X, MAX_X, me.x);
        me.z = clamp(z, MIN_Z, MAX_Z, me.z);
        if (Double.isFinite(yaw)) me.yaw = yaw;
        me.moving = moving;
        me.lastSeen = now;
        advanceBots(now);

        // 위로는 inbox 를 비우기 전에 보내서, 보낸 사람도 같은 응답에서 자기 효과를 본다
        String care = careTo == null || careTo.isBlank() ? null : care(me, careTo.strip(), careKind, now);

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
        return new TickResult(players, events, liveCount(now), new Received(me.receivedComfort.get(), me.receivedHug.get()), care);
    }

    /** "sent" | "cooldown" | "gone". 종류가 이상하면 400 */
    private String care(Presence me, String toId, String kind, long now) {
        if (kind == null || !CARE_KINDS.contains(kind)) throw ApiException.badRequest("위로해주기나 안아주기만 할 수 있어요.");
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
            ("hug".equals(kind) ? t.receivedHug : t.receivedComfort).incrementAndGet();
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

    private void sweep(long now) {
        lastSweep.set(now);
        byTicket.values().removeIf(p -> !p.bot() && !live(p, now));
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
