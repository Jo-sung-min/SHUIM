package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiPredicate;
import java.util.function.Predicate;

/** Two-seat fireside boards in the underground lodges. The server owns every rule; visitors only ask to sit and to place a stone. */
final class BeachBoardGames {
    static final double REACH = 3.2;
    static final long TURN_MS = 180_000;
    private static final int OMOK_SIZE = 15, OTHELLO_SIZE = 8, OMOK_RUN = 5;
    static final char EMPTY = '.', BLACK = 'B', WHITE = 'W';
    private static final char NO_TURN = 0;
    private static final int[][] LINES = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
    private static final int[][] RAYS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

    /** Authoritative mirror of BUNKER_GAME_TABLES in uyuni-bunker-layout.ts. */
    record Spot(String id, String bunkerId, String game, double x, double z) {}
    static final List<Spot> SPOTS = BeachBunkers.ALL.stream().flatMap(b -> List.of(
        new Spot("bunker-" + b.id() + "-omok", b.id(), "omok", b.x() - 3.6, b.z() + 5.5),
        new Spot("bunker-" + b.id() + "-othello", b.id(), "othello", b.x() + 3.6, b.z() + 5.5)).stream()).toList();
    static Spot find(String id) { return id == null ? null : SPOTS.stream().filter(spot -> spot.id().equals(id)).findFirst().orElse(null); }

    public record Seat(String pid, String nick) {}
    public record View(String id, String game, int size, String cells, Seat black, Seat white, String turn, String result, String reason,
                       Integer lastCell, List<Integer> legal, int blackCount, int whiteCount, long turnMsLeft, String passed, long version) {}

    private static final class Table {
        final Spot spot;
        final int size;
        final char[] cells;
        BeachRoom.Presence black, white;
        char turn = NO_TURN;
        String result, reason, passed;
        Integer lastCell;
        long deadline, version;
        Table(Spot spot) {
            this.spot = spot; size = "omok".equals(spot.game()) ? OMOK_SIZE : OTHELLO_SIZE; cells = new char[size * size];
            clear();
        }
        boolean othello() { return size == OTHELLO_SIZE; }
        boolean seated(BeachRoom.Presence p) { return black == p || white == p; }
        void clear() {
            Arrays.fill(cells, EMPTY);
            if (othello()) {
                int low = size / 2 - 1, high = size / 2;
                cells[low * size + low] = cells[high * size + high] = WHITE;
                cells[low * size + high] = cells[high * size + low] = BLACK;
            }
            turn = NO_TURN; result = reason = passed = null; lastCell = null;
        }
        void start(long now) { clear(); turn = BLACK; deadline = now + TURN_MS; version++; }
        void finish(String winner, String why) { turn = NO_TURN; passed = null; result = winner; reason = why; }
    }

    private final Map<String, Table> tables = new LinkedHashMap<>();
    BeachBoardGames() { for (Spot spot : SPOTS) tables.put(spot.id(), new Table(spot)); }

    synchronized View act(Spot spot, BeachRoom.Presence me, String action, Integer cell, Long version, long now,
                          BiPredicate<BeachRoom.Presence, String> here, Predicate<BeachRoom.Presence> visible) {
        prune(now, here);
        Table table = tables.get(spot.id());
        switch (action == null ? "" : action) {
            case "join" -> join(table, me, now, visible);
            case "leave" -> vacate(table, me);
            case "move" -> move(table, me, cell, version, now);
            case "rematch" -> rematch(table, me, version, now);
            default -> throw ApiException.badRequest("게임 동작을 다시 확인해 주세요.");
        }
        return view(table, now, visible);
    }

    /** The boards of one lodge, and the moment anyone who has walked away gives up their place. */
    synchronized List<View> views(String bunkerId, long now, BiPredicate<BeachRoom.Presence, String> here, Predicate<BeachRoom.Presence> visible) {
        prune(now, here);
        List<View> views = new ArrayList<>(2);
        for (Table table : tables.values()) if (table.spot.bunkerId().equals(bunkerId)) views.add(view(table, now, visible));
        return views;
    }

    private void prune(long now, BiPredicate<BeachRoom.Presence, String> here) {
        for (Table table : tables.values()) {
            if (table.black != null && !here.test(table.black, table.spot.bunkerId())) vacate(table, table.black);
            if (table.white != null && !here.test(table.white, table.spot.bunkerId())) vacate(table, table.white);
            if (table.turn != NO_TURN && now >= table.deadline) { table.finish(name(opposite(table.turn)), "time"); table.version++; }
        }
    }

    private void join(Table table, BeachRoom.Presence me, long now, Predicate<BeachRoom.Presence> visible) {
        if (table.seated(me)) return;
        if (table.black != null && table.white != null) throw new ApiException(409, "이미 두 사람이 앉아 있어요.");
        BeachRoom.Presence opponent = table.black != null ? table.black : table.white;
        if (opponent != null && !visible.test(opponent)) throw new ApiException(409, "지금은 이 자리에서 함께할 수 없어요.");
        for (Table other : tables.values()) if (other != table && other.seated(me)) vacate(other, me);
        if (table.black == null) table.black = me; else table.white = me;
        if (table.black != null && table.white != null) table.start(now);
        else { if (table.result != null) table.clear(); table.version++; }
    }

    private void vacate(Table table, BeachRoom.Presence me) {
        if (!table.seated(me)) return;
        boolean wasBlack = table.black == me;
        if (wasBlack) table.black = null; else table.white = null;
        if (table.turn != NO_TURN) table.finish(wasBlack ? "white" : "black", "left");
        if (table.black == null && table.white == null) table.clear();
        table.version++;
    }

    private void move(Table table, BeachRoom.Presence me, Integer cell, Long version, long now) {
        // A retry or a tap on an out-of-date board never lands on a board that has since changed.
        if (version != null && version != table.version) return;
        char mine = table.black == me ? BLACK : table.white == me ? WHITE : NO_TURN;
        if (mine == NO_TURN) throw ApiException.forbidden("앉아 있는 사람만 둘 수 있어요.");
        if (table.turn == NO_TURN) throw new ApiException(409, "지금은 둘 수 없어요.");
        if (mine != table.turn) throw new ApiException(409, "상대 차례예요.");
        if (cell == null || cell < 0 || cell >= table.cells.length) throw ApiException.badRequest("둘 자리를 다시 골라 주세요.");
        if (table.othello()) placeOthello(table, cell, mine, now); else placeOmok(table, cell, mine, now);
        table.lastCell = cell;
        table.version++;
    }

    private void placeOmok(Table table, int cell, char mine, long now) {
        if (table.cells[cell] != EMPTY) throw new ApiException(409, "이미 돌이 놓인 자리예요.");
        table.cells[cell] = mine;
        if (completesRun(table.cells, table.size, cell)) table.finish(name(mine), "five");
        else if (count(table.cells, EMPTY) == 0) table.finish("draw", "full");
        else { table.turn = opposite(mine); table.deadline = now + TURN_MS; }
    }

    private void placeOthello(Table table, int cell, char mine, long now) {
        List<Integer> flipped = flips(table.cells, table.size, cell, mine);
        if (flipped.isEmpty()) throw new ApiException(409, "그 자리에는 둘 수 없어요.");
        table.cells[cell] = mine;
        for (int index : flipped) table.cells[index] = mine;
        char other = opposite(mine);
        table.passed = null;
        if (hasMove(table.cells, table.size, other)) { table.turn = other; table.deadline = now + TURN_MS; }
        else if (hasMove(table.cells, table.size, mine)) { table.passed = name(other); table.deadline = now + TURN_MS; }
        else {
            int black = count(table.cells, BLACK), white = count(table.cells, WHITE);
            table.finish(black == white ? "draw" : black > white ? "black" : "white", "count");
        }
    }

    private void rematch(Table table, BeachRoom.Presence me, Long version, long now) {
        if (version != null && version != table.version) return;
        if (!table.seated(me)) throw ApiException.forbidden("앉아 있는 사람만 다시 시작할 수 있어요.");
        if (table.result == null || table.black == null || table.white == null) throw new ApiException(409, "두 사람이 앉아 있을 때 다시 시작할 수 있어요.");
        BeachRoom.Presence formerBlack = table.black;
        table.black = table.white; table.white = formerBlack;
        table.start(now);
    }

    private View view(Table table, long now, Predicate<BeachRoom.Presence> visible) {
        List<Integer> legal = new ArrayList<>();
        if (table.othello() && table.turn != NO_TURN)
            for (int cell = 0; cell < table.cells.length; cell++) if (!flips(table.cells, table.size, cell, table.turn).isEmpty()) legal.add(cell);
        return new View(table.spot.id(), table.spot.game(), table.size, new String(table.cells), seat(table.black, visible), seat(table.white, visible),
            table.turn == NO_TURN ? null : name(table.turn), table.result, table.reason, table.lastCell, legal,
            count(table.cells, BLACK), count(table.cells, WHITE), table.turn == NO_TURN ? 0 : Math.max(0, table.deadline - now), table.passed, table.version);
    }

    private static Seat seat(BeachRoom.Presence p, Predicate<BeachRoom.Presence> visible) {
        if (p == null) return null;
        return visible.test(p) ? new Seat(p.pid(), p.nick()) : new Seat(null, "다른 방문자");
    }

    private static char opposite(char color) { return color == BLACK ? WHITE : BLACK; }
    private static String name(char color) { return color == BLACK ? "black" : "white"; }
    private static int count(char[] cells, char kind) { int n = 0; for (char c : cells) if (c == kind) n++; return n; }

    /** Five or more in a line from the stone just placed. */
    static boolean completesRun(char[] cells, int size, int cell) {
        char color = cells[cell];
        int row = cell / size, column = cell % size;
        for (int[] line : LINES) {
            int run = 1;
            for (int sign = -1; sign <= 1; sign += 2) {
                for (int r = row + sign * line[0], c = column + sign * line[1]; r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] == color; r += sign * line[0], c += sign * line[1]) run++;
            }
            if (run >= OMOK_RUN) return true;
        }
        return false;
    }

    /** Every opposing disc this placement would turn; empty means the move is not allowed. */
    static List<Integer> flips(char[] cells, int size, int cell, char color) {
        if (cells[cell] != EMPTY) return List.of();
        List<Integer> all = new ArrayList<>();
        char other = opposite(color);
        int row = cell / size, column = cell % size;
        for (int[] ray : RAYS) {
            List<Integer> run = new ArrayList<>();
            int r = row + ray[0], c = column + ray[1];
            while (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] == other) { run.add(r * size + c); r += ray[0]; c += ray[1]; }
            if (!run.isEmpty() && r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] == color) all.addAll(run);
        }
        return all;
    }

    static boolean hasMove(char[] cells, int size, char color) {
        for (int cell = 0; cell < cells.length; cell++) if (!flips(cells, size, cell, color).isEmpty()) return true;
        return false;
    }
}
