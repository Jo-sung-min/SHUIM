package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BeachBoardGamesTest {
    private static final String OMOK = "bunker-dawn-omok", OTHELLO = "bunker-dawn-othello";
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.UYUNI);

    private BeachRoom.TickResult at(BeachRoom.Presence p, double x, double z) {
        return room.tick(p.ticket(), x, z, 0, false, null, null, null, false, p.sequence() + 1, p.bunkerId());
    }
    private BeachRoom.Presence inside(String user, String id, Set<String> excluded) {
        var p = room.enter(user, user, excluded); var bunker = BeachBunkers.find(id);
        at(p, bunker.x(), bunker.entryZ());
        room.bunker(p.ticket(), p.userId(), "enter", id, p.sequence() + 1);
        return p;
    }
    private BeachRoom.Presence besideTable(String user, String table) {
        var spot = BeachBoardGames.find(table);
        var p = inside(user, spot.bunkerId(), Set.of());
        at(p, spot.x() + 1, spot.z());
        return p;
    }
    private BeachBoardGames.View act(BeachRoom.Presence p, String table, String action, Integer cell, Long version) {
        return room.board(p.ticket(), p.userId(), action, table, cell, version);
    }
    private BeachBoardGames.View join(BeachRoom.Presence p, String table) { return act(p, table, "join", null, null); }
    private BeachBoardGames.View play(BeachRoom.Presence p, String table, int cell) { return act(p, table, "move", cell, null); }
    private static int status(Runnable call) { return assertThrows(ApiException.class, call::run).status(); }

    @Test void twoPeopleSitDownBlackMovesFirstAndOnlyTheirTurnCounts() {
        var a = besideTable("a", OMOK); var b = besideTable("b", OMOK); var watcher = besideTable("c", OMOK);
        var waiting = join(a, OMOK);
        assertNull(waiting.turn()); assertEquals(a.pid(), waiting.black().pid()); assertNull(waiting.white());
        var started = join(b, OMOK);
        assertEquals("black", started.turn()); assertEquals(b.pid(), started.white().pid());
        assertEquals(409, status(() -> join(watcher, OMOK)), "a third person only watches");
        assertEquals(409, status(() -> play(b, OMOK, 0)), "white waits for black");
        assertEquals(403, status(() -> play(watcher, OMOK, 0)));
        assertEquals("white", play(a, OMOK, 112).turn());
        assertEquals(409, status(() -> play(b, OMOK, 112)), "a taken point stays taken");
        assertEquals(400, status(() -> play(b, OMOK, 225)));
        // The application's own JSON settings drop empty fields, so a waiting table reaches the client without them.
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper().setDefaultPropertyInclusion(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL);
        com.fasterxml.jackson.databind.JsonNode json = mapper.valueToTree(started), waitingJson = mapper.valueToTree(waiting);
        assertEquals("a", json.get("black").get("nick").asText());
        assertEquals(225, json.get("cells").asText().length());
        assertFalse(waitingJson.has("white")); assertFalse(waitingJson.has("turn")); assertFalse(waitingJson.has("lastCell"));
        assertEquals(0, waitingJson.get("legal").size());
    }

    @Test void fiveInARowWinsInEveryDirectionAndSixAlsoCounts() {
        int size = 15;
        for (int[] step : new int[][]{{0, 1}, {1, 0}, {1, 1}, {1, -1}}) {
            char[] cells = new char[size * size]; Arrays.fill(cells, BeachBoardGames.EMPTY);
            for (int i = 0; i < 4; i++) cells[(7 + step[0] * i) * size + 7 + step[1] * i] = BeachBoardGames.BLACK;
            assertFalse(BeachBoardGames.completesRun(cells, size, 7 * size + 7), "four is not enough");
            int end = (7 + step[0] * 4) * size + 7 + step[1] * 4;
            cells[end] = BeachBoardGames.BLACK;
            assertTrue(BeachBoardGames.completesRun(cells, size, end));
            int further = (7 + step[0] * 5) * size + 7 + step[1] * 5;
            cells[further] = BeachBoardGames.BLACK;
            assertTrue(BeachBoardGames.completesRun(cells, size, further));
        }
        char[] wrap = new char[size * size]; Arrays.fill(wrap, BeachBoardGames.EMPTY);
        for (int i = 12; i < 17; i++) wrap[i] = BeachBoardGames.BLACK;
        assertFalse(BeachBoardGames.completesRun(wrap, size, 14), "a line never continues onto the next row");
    }

    @Test void aWonOmokGameStopsAndARematchSwapsColours() {
        var a = besideTable("a", OMOK); var b = besideTable("b", OMOK);
        join(a, OMOK); join(b, OMOK);
        for (int i = 0; i < 4; i++) { play(a, OMOK, i); play(b, OMOK, 15 + i); }
        var won = play(a, OMOK, 4);
        assertEquals("black", won.result()); assertEquals("five", won.reason()); assertNull(won.turn());
        assertEquals(409, status(() -> play(b, OMOK, 30)));
        var next = act(b, OMOK, "rematch", null, won.version());
        assertEquals(b.pid(), next.black().pid()); assertEquals(a.pid(), next.white().pid()); assertEquals("black", next.turn());
        assertEquals(225, next.cells().chars().filter(c -> c == '.').count());
    }

    @Test void othelloOpensCorrectlyFlipsLinesAndEndsWhenNeitherSideCanMove() {
        var a = besideTable("a", OTHELLO); var b = besideTable("b", OTHELLO);
        join(a, OTHELLO);
        var start = join(b, OTHELLO);
        assertEquals(2, start.blackCount()); assertEquals(2, start.whiteCount());
        // cell = row * 8 + column; d3, c4, f5 and e6 are the four standard openings.
        assertEquals(java.util.List.of(19, 26, 37, 44), start.legal());
        assertEquals(409, status(() -> play(a, OTHELLO, 0)), "a move must turn something");
        // The nine-move wipeout: f5 d6 c5 f4 e3 f6 g5 e6 e7.
        String[] moves = {"f5", "d6", "c5", "f4", "e3", "f6", "g5", "e6", "e7"};
        BeachBoardGames.View last = start;
        for (int i = 0; i < moves.length; i++) {
            int cell = (moves[i].charAt(1) - '1') * 8 + moves[i].charAt(0) - 'a';
            last = play(i % 2 == 0 ? a : b, OTHELLO, cell);
        }
        assertEquals("black", last.result()); assertEquals("count", last.reason()); assertEquals(0, last.whiteCount());
        assertEquals(13, last.blackCount());
    }

    @Test void aSideWithNoMoveIsPassedOver() {
        char[] cells = new char[64]; Arrays.fill(cells, BeachBoardGames.EMPTY);
        cells[0] = BeachBoardGames.BLACK; cells[1] = BeachBoardGames.WHITE;
        assertTrue(BeachBoardGames.hasMove(cells, 8, BeachBoardGames.BLACK));
        assertFalse(BeachBoardGames.hasMove(cells, 8, BeachBoardGames.WHITE));
    }

    @Test void walkingOutOfTheLodgeOrRunningOutOfTimeHandsOverTheGame() {
        var a = besideTable("a", OMOK); var b = besideTable("b", OMOK);
        join(a, OMOK); join(b, OMOK);
        var bunker = BeachBunkers.find("dawn");
        at(b, bunker.x(), bunker.entryZ());
        room.bunker(b.ticket(), b.userId(), "exit", "dawn", b.sequence() + 1);
        var after = at(a, a.x(), a.z()).boardGames().get(0);
        assertEquals("black", after.result()); assertEquals("left", after.reason()); assertNull(after.white());

        var c = besideTable("c", OTHELLO); var d = besideTable("d", OTHELLO);
        join(c, OTHELLO); join(d, OTHELLO);
        for (int step = 0; step < 37; step++) { clock.addAndGet(5_000); at(c, c.x(), c.z()); at(d, d.x(), d.z()); }
        var timed = at(c, c.x(), c.z()).boardGames().get(1);
        assertEquals("white", timed.result(), "black did not move in three minutes"); assertEquals("time", timed.reason());
    }

    @Test void aStaleTapOrRetryNeverLandsTwice() {
        var a = besideTable("a", OMOK); var b = besideTable("b", OMOK);
        join(a, OMOK);
        var started = join(b, OMOK);
        var placed = act(a, OMOK, "move", 10, started.version());
        var retried = act(a, OMOK, "move", 10, started.version());
        assertEquals(placed.version(), retried.version());
        assertEquals(1, retried.blackCount());
    }

    @Test void boardsNeedProximityAndBelongOnlyToTheLodgeYouAreIn() {
        var near = besideTable("a", OMOK); var spot = BeachBoardGames.find(OMOK);
        at(near, spot.x() + 8, spot.z());
        assertEquals(400, status(() -> join(near, OMOK)));
        assertEquals(400, status(() -> join(near, "bunker-dusk-omok")), "the other hotel's table");
        assertEquals(400, status(() -> room.board(near.ticket(), near.userId(), "join", "nope", null, null)));
        var outside = room.enter("out", "out", Set.of());
        assertTrue(at(outside, 0, 0).boardGames().isEmpty(), "nothing is sent above ground");
        assertEquals(2, at(near, spot.x(), spot.z()).boardGames().size());
        assertEquals(403, status(() -> room.board(near.ticket(), "someone-else", "join", OMOK, null, null)));
    }

    @Test void visitorsWhoBlockedEachOtherNeverShareATableOrSeeTheName() {
        var spot = BeachBoardGames.find(OMOK);
        var a = inside("a", "dawn", Set.of("b")); at(a, spot.x() + 1, spot.z());
        var b = besideTable("b", OMOK);
        join(a, OMOK);
        assertEquals(409, status(() -> join(b, OMOK)));
        var seen = at(b, b.x(), b.z()).boardGames().get(0);
        assertNull(seen.black().pid()); assertEquals("다른 방문자", seen.black().nick());
    }

    @Test void sittingAtOneTableLeavesTheOther() {
        var a = besideTable("a", OMOK); var other = BeachBoardGames.find(OTHELLO);
        join(a, OMOK);
        at(a, other.x() + 1, other.z());
        join(a, OTHELLO);
        var boards = at(a, a.x(), a.z()).boardGames();
        assertNull(boards.get(0).black()); assertEquals(a.pid(), boards.get(1).black().pid());
    }

    @Test void onlySignedInVisitorsReachTheEndpoint() {
        AuthService auth = mock(AuthService.class);
        var controller = new BeachController(auth, mock(BlockService.class), new BeachService(clock::get, mock(BeachFireService.class)), mock(CircleService.class));
        when(auth.currentUser(any())).thenReturn(Optional.of(new DbUser("guest", null, "손님", "user", true, null, null, 0)));
        var body = new BeachController.BoardBody("ticket", "join", OMOK, null, null);
        assertEquals(403, status(() -> controller.board(body, new MockHttpServletRequest())));
    }
}
