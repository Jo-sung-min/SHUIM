package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import kr.co.shuim.upload.S3Service;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BeachMusicTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final S3Service storage = mock(S3Service.class);
    private final BeachController controller = new BeachController(auth, mock(BlockService.class), beach, circles, new RoomMusicRecordings(storage));
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private MockMvc mvc;

    private void actor(String id, String role) {
        DbUser user = new DbUser(id, id + "@example.com", id, role, false, null, null, 0);
        when(auth.currentUser(any())).thenReturn(Optional.of(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }

    @BeforeEach
    void setup() {
        for (String id : List.of("room", "other")) {
            when(circles.byId(id)).thenReturn(new CircleService.Circle(id, id, "함께", "life", null, false,
                "open", "public", "", "", "operator", 0, 0, 1, 0, false));
            when(circles.member(eq(id), any())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        }
        when(auth.isAdmin(any())).thenCallRealMethod();
        actor("operator", "admin");
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
    }

    private String enter(String id, String map) {
        return beach.enter("room", id, id, Set.of(), null, map).ticket();
    }

    private BeachRoom.MusicState command(String ticket, String action, String track, long version) {
        return controller.music(new BeachController.MusicBody(ticket, action, track, version), request);
    }

    @Test
    void broadcastsAndLateJoinersShareTheSameClockOnlyWithinTheirMapAndCommunity() {
        for (BeachMap map : BeachMap.values()) {
            actor("operator", "admin");
            var admin = controller.enter(new BeachController.EnterBody("room", null, map.id()), request, new MockHttpServletResponse());
            assertEquals(true, admin.get("musicControl"));
            assertEquals(BeachRoom.SILENT, admin.get("music"));
            var play = command((String) admin.get("ticket"), "play", "tomorrow-v1", 0);
            assertEquals(clock.get(), play.music().startedAt());
            assertEquals(240_000, play.music().durationMs());
            assertEquals("내일의우리", play.music().title());
            clock.addAndGet(3200);
            actor("listener", "user");
            var join = controller.enter(new BeachController.EnterBody("room", null, map.id()), request, new MockHttpServletResponse());
            assertEquals(false, join.get("musicControl"));
            assertEquals(play.music(), join.get("music"));
            assertEquals(3200L, (Long) join.get("serverTime") - play.music().startedAt());
            var poll = beach.tick((String) join.get("ticket"), 0, 12, 0, false, null, null);
            assertEquals(play.music(), poll.music());
            assertEquals(play.music(), poll.withCareCapabilities(new BeachRoom.CareCapabilities(false, false), true).music());
            assertEquals(BeachRoom.SILENT, beach.music("other", map.id()).music());
        }
    }

    @Test
    void newSongsCanBeSwitchedByAdminsAndSharedWithListenersWhoCannotControlPlayback() throws Exception {
        for (BeachMap map : BeachMap.values()) {
            String operatorTicket = enter("operator", map.id());
            String listenerTicket = enter("listener", map.id());
            long version = 0;
            for (RoomMusicTrack track : List.of(RoomMusicTrack.CHRISTMAS, RoomMusicTrack.MY_LOVE)) {
                actor("operator", "admin");
                mvc.perform(post("/api/beach/music").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"ticket\":\"" + operatorTicket + "\",\"action\":\"play\",\"trackId\":\"" + track.id + "\",\"expectedVersion\":" + version + "}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.music.trackId").value(track.id))
                    .andExpect(jsonPath("$.music.title").value(track.title))
                    .andExpect(jsonPath("$.music.durationMs").value(track.durationMs))
                    .andExpect(jsonPath("$.music.playing").value(true))
                    .andExpect(jsonPath("$.music.version").value(++version));
                var shared = beach.music("room", map.id()).music();
                actor("listener", "user");
                for (String action : List.of("play", "stop")) {
                    mvc.perform(post("/api/beach/music").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ticket\":\"" + listenerTicket + "\",\"action\":\"" + action + "\",\"trackId\":\"" + track.id + "\",\"expectedVersion\":" + version + "}"))
                        .andExpect(status().isForbidden());
                }
                assertEquals(shared, beach.tick(listenerTicket, 0, 12, 0, false, null, null).music());
                assertEquals(shared, beach.music("room", map.id()).music());
                clock.addAndGet(500);
            }
        }
    }

    @Test
    void retriesSwitchesStopsAndNaturalCompletionDoNotReplayStaleMusic() {
        String ticket = enter("operator", "bamboo");
        var first = command(ticket, "play", null, 0).music();
        assertEquals("아침만남겨주고", first.title());
        assertEquals(257_520, first.durationMs());
        clock.addAndGet(100);
        assertEquals(first, command(ticket, "play", "morning-v1", 1).music());
        assertEquals(first, command(ticket, "play", "tomorrow-v1", 0).music());
        var second = command(ticket, "play", "tomorrow-v1", 1).music();
        assertEquals(2, second.version());
        assertEquals(clock.get(), second.startedAt());
        assertEquals(second, command(ticket, "stop", null, 1).music());
        var stop = command(ticket, "stop", null, 2).music();
        assertFalse(stop.playing());
        assertNull(stop.startedAt());
        assertEquals(second.trackId(), stop.trackId());
        assertEquals(stop, command(ticket, "stop", null, 3).music());
        var restart = command(ticket, "play", second.trackId(), 3).music();
        clock.addAndGet(restart.durationMs() - 1);
        assertEquals(restart, beach.music("room", "bamboo").music());
        clock.incrementAndGet();
        var end = beach.music("room", "bamboo").music();
        assertEquals(5, end.version());
        assertFalse(end.playing());
        assertNull(end.startedAt());
        String fresh = enter("operator", "bamboo");
        assertEquals(end, command(fresh, "play", second.trackId(), 4).music());
        assertEquals(end, beach.music("room", "bamboo").music());
    }

    @Test
    void competingAdministratorsWithOneRevisionAgreeOnOneSongAndStartTime() throws Exception {
        String a = enter("a", "uyuni");
        String b = enter("b", "uyuni");
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<BeachRoom.MusicState> first = () -> {
                ready.countDown(); start.await();
                return beach.changeMusic(a, "a", "play", "morning-v1", 0L);
            };
            Callable<BeachRoom.MusicState> second = () -> {
                ready.countDown(); start.await();
                return beach.changeMusic(b, "b", "play", "tomorrow-v1", 0L);
            };
            var one = executor.submit(first);
            var two = executor.submit(second);
            ready.await();
            start.countDown();
            assertEquals(one.get(), two.get());
            assertEquals(1, one.get().music().version());
        }
    }

    @Test
    void controlsRequireAnOwnedActiveVisitCurrentMembershipAndAdminRole() {
        String ticket = enter("operator", "beach");
        actor("other-admin", "admin");
        assertEquals(403, assertThrows(ApiException.class, () -> command(ticket, "play", null, 0)).status());
        actor("operator", "user");
        assertEquals(403, assertThrows(ApiException.class, () -> command(ticket, "play", null, 0)).status());
        actor("operator", "admin");
        when(circles.member("room", "operator")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> command(ticket, "play", null, 0)).status());
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        beach.suspend(ticket, 0, 0, 0, null);
        assertEquals(410, assertThrows(ApiException.class, () -> command(ticket, "play", null, 0)).status());
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        assertEquals(401, assertThrows(ApiException.class, () -> command(ticket, "play", null, 0)).status());
        assertEquals(BeachRoom.SILENT, beach.music("room", "beach").music());
    }

    @Test
    void httpControlRejectsUnknownTracksAndMalformedRevisions() throws Exception {
        String ticket = enter("operator", "beach");
        for (String revision : List.of("null", "true", "1.5", "-1", "\"0\"")) {
            mvc.perform(post("/api/beach/music").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"action\":\"play\",\"expectedVersion\":" + revision + "}"))
                .andExpect(status().isBadRequest());
        }
        assertEquals(400, assertThrows(ApiException.class, () -> command(ticket, "play", "../record", 0)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> command(ticket, "pause", null, 0)).status());
        mvc.perform(post("/api/beach/music").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"action\":\"play\",\"trackId\":\"tomorrow-v1\",\"expectedVersion\":0}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.music.trackId").value("tomorrow-v1"))
            .andExpect(jsonPath("$.music.version").value(1)).andExpect(jsonPath("$.serverTime").value(clock.get()));
    }

    @Test
    void privateRecordingsSupportSeekingAndCacheOnlyAfterAnAuthorizedRead() throws Exception {
        actor("listener", "user");
        enter("listener", "bamboo");
        for (RoomMusicTrack track : RoomMusicTrack.values()) {
            String url = "/api/beach/music/audio?communityId=room&mapId=bamboo&trackId=" + track.id;
            int size = track.bytes;
            byte[] fixture = new byte[size];
            for (int i = 4; i <= 15; i++) fixture[i] = (byte) i;
            byte[] expected = java.util.Arrays.copyOfRange(fixture, 4, 16);
            when(storage.readPrivateRecording(track.objectKey, size, track.sha256)).thenReturn(fixture);
            mvc.perform(head(url)).andExpect(status().isOk()).andExpect(header().longValue("Content-Length", size));
            mvc.perform(get(url).header("If-None-Match", "\"" + track.sha256 + "\"")).andExpect(status().isNotModified());
            verify(storage, never()).readPrivateRecording(track.objectKey, size, track.sha256);
            mvc.perform(get(url).header("Range", "bytes=4-15")).andExpect(status().isPartialContent())
                .andExpect(header().string("Accept-Ranges", "bytes")).andExpect(content().contentType("audio/mpeg"))
                .andExpect(header().string("Content-Range", "bytes 4-15/" + size)).andExpect(content().bytes(expected));
            // The stable selection ID was the old recording's ETag. It must not return
            // 304 now that the same song ID points to a different complete recording.
            mvc.perform(get(url).header("If-None-Match", "\"" + track.id + "\"").header("Range", "bytes=4-15"))
                .andExpect(status().isPartialContent()).andExpect(content().bytes(expected))
                .andExpect(header().string("ETag", "\"" + track.sha256 + "\""));
            mvc.perform(head(url)).andExpect(status().isOk()).andExpect(header().longValue("Content-Length", size))
                .andExpect(header().string("ETag", "\"" + track.sha256 + "\""))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("private")));
            mvc.perform(get(url).header("If-None-Match", "\"" + track.sha256 + "\"")).andExpect(status().isNotModified());
            mvc.perform(get(url).header("Range", "bytes=-8")).andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes " + (size - 8) + "-" + (size - 1) + "/" + size));
            verify(storage, times(1)).readPrivateRecording(track.objectKey, size, track.sha256);
        }
        mvc.perform(head("/api/beach/music/audio?communityId=room&mapId=bamboo"))
            .andExpect(status().isOk()).andExpect(header().string("ETag", "\"" + RoomMusicTrack.MORNING.sha256 + "\""));
        mvc.perform(head("/api/beach/music/audio?communityId=room&mapId=bamboo&trackId=unknown"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void replacementRecordingsRetainSelectionIdsAndCompleteSongLengths() {
        assertEquals("morning-v1", RoomMusicTrack.MORNING.id);
        assertEquals("tomorrow-v1", RoomMusicTrack.TOMORROW.id);
        assertEquals("private/room-music/morning-v2.mp3", RoomMusicTrack.MORNING.objectKey);
        assertEquals("private/room-music/tomorrow-v2.mp3", RoomMusicTrack.TOMORROW.objectKey);
        for (RoomMusicTrack track : RoomMusicTrack.values()) {
            assertTrue(track.bytes > 0 && track.bytes < 6_000_000, "The mini-app can buffer each full song");
            String ticket = enter("operator", "bamboo");
            long version = beach.music("room", "bamboo").music().version();
            var playing = command(ticket, "play", track.id, version).music();
            clock.addAndGet(track.durationMs - 1);
            assertTrue(beach.music("room", "bamboo").music().playing());
            clock.incrementAndGet();
            assertFalse(beach.music("room", "bamboo").music().playing());
        }
    }

    @Test
    void evenACachedOrRangeRequestNeedsACurrentMemberAndLiveVisitInThatMap() throws Exception {
        String ticket = enter("operator", "uyuni");
        String base = "/api/beach/music/audio?communityId=room&mapId=";
        mvc.perform(get(base + "beach").header("Range", "bytes=0-7")).andExpect(status().isForbidden());
        mvc.perform(get("/api/beach/music/audio?communityId=other&mapId=uyuni")).andExpect(status().isForbidden());
        actor("stranger", "user");
        mvc.perform(get(base + "uyuni").header("If-None-Match", "\"morning-v1\"")).andExpect(status().isForbidden());
        actor("operator", "admin");
        when(circles.member("room", "operator")).thenReturn(Optional.empty());
        mvc.perform(head(base + "uyuni")).andExpect(status().isForbidden());
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        beach.leave(ticket);
        mvc.perform(head(base + "uyuni")).andExpect(status().isForbidden());
        enter("operator", "uyuni");
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        mvc.perform(head(base + "uyuni")).andExpect(status().isForbidden());
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        mvc.perform(head(base + "uyuni")).andExpect(status().isUnauthorized());
        verifyNoInteractions(storage);
    }
}
