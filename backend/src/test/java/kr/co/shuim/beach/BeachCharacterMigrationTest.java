package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BeachCharacterMigrationTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachFireService fire = mock(BeachFireService.class);
    private final BeachService service = new BeachService(clock::get, fire);
    private MockMvc mvc;

    @BeforeEach void setup() {
        AuthService auth = mock(AuthService.class);
        CircleService circles = mock(CircleService.class);
        var member = new DbUser("member", null, "방문자", "user", false, null, null, 0);
        when(auth.currentUser(any())).thenReturn(Optional.of(member));
        when(auth.requireUser(any(), any())).thenReturn(member);
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "open", "public", "", "", "owner", 0, 0, 1, 0, false));
        when(circles.member("room", "member")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        when(fire.snapshot(anyString())).thenAnswer(call -> new BeachFireService.FireView(0, 12, 0, "amber", null,
            clock.get(), 0L, null, 0));
        mvc = MockMvcBuilders.standaloneSetup(new BeachController(auth, mock(BlockService.class), service, circles))
            .setControllerAdvice(new ApiExceptionHandler()).build();
    }

    @ParameterizedTest
    @CsvSource({
        "beach, cat-gentleman, 0", "beach, cat-lady, 3", "beach, mongsil, 0",
        "uyuni, cat-gentleman, 0", "uyuni, cat-lady, 3", "uyuni, mongsil, 0",
        "bamboo, cat-gentleman, 0", "bamboo, cat-lady, 3", "bamboo, mongsil, 0",
        "garden, cat-gentleman, 0", "garden, cat-lady, 3", "garden, mongsil, 0",
        "cloudspa, cat-gentleman, 0", "cloudspa, cat-lady, 3", "cloudspa, mongsil, 0",
        "baikal, cat-gentleman, 0", "baikal, cat-lady, 3", "baikal, mongsil, 0",
    })
    void removedChoicesBecomeOrdinaryCharactersOnEntryTicksAndResume(String map, String removed, int skin) throws Exception {
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON)
                .content("{\"communityId\":\"room\",\"mapId\":\"" + map + "\",\"character\":\"" + removed + "\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.me.skin").value(skin));
        var actor = service.enter("room", "actor", "방문자", Set.of(), removed, map);
        var observer = service.enter("room", "observer", "친구", Set.of(), "male", map);
        assertEquals(skin, observedSkin(observer.ticket(), actor.pid()));

        String nextRemoved = skin == 0 ? "cat-lady" : "cat-gentleman";
        int nextSkin = skin == 0 ? 3 : 0;
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + actor.ticket() + "\",\"character\":\"" + nextRemoved + "\",\"sequence\":1}"))
            .andExpect(status().isOk());
        assertEquals(nextSkin, observedSkin(observer.ticket(), actor.pid()), "peers must receive an ordinary 3D skin");
        service.tick(actor.ticket(), 1, 10, .5, false, null, null, null, false, 2L);
        assertEquals(nextSkin, actor.skin(), "movement-only ticks preserve the migrated appearance");
        service.suspend(actor.ticket(), 1, 10, .5, 3L);
        var quick = service.enter("room", "actor", "방문자", Set.of(), null, map, actor.ticket(), 3L);
        assertSame(actor, quick.presence());
        assertEquals(nextSkin, quick.presence().skin());

        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(0, service.count("room", map));
        var expired = service.enter("room", "actor", "방문자", Set.of(), null, map, actor.ticket(), actor.sequence());
        assertTrue(expired.resumed());
        assertNotEquals(actor.ticket(), expired.presence().ticket());
        assertEquals(nextSkin, expired.presence().skin(), "expired visits must not restore a removed avatar");
        assertEquals(1, expired.presence().x());
        assertEquals(10, expired.presence().z());
        if (!map.equals("beach")) verifyNoInteractions(fire);
    }

    private int observedSkin(String observerTicket, String actorPid) {
        return service.tick(observerTicket, 0, 10, 0, false, null, null).players().stream()
            .filter(player -> player.pid().equals(actorPid)).findFirst().orElseThrow().skin();
    }

    @ParameterizedTest
    @EnumSource(BeachMap.class)
    void unknownChoicesCannotReplaceTheCurrentAppearance(BeachMap map) throws Exception {
        var actor = service.enter("room", "actor", "방문자", Set.of(), "female-3d", map.id());
        for (String malformed : new String[]{"\"MONGSIL\"", "\"dog-girl\"", "6", "true"}) {
            mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"ticket\":\"" + actor.ticket() + "\",\"character\":" + malformed + "}"))
                .andExpect(status().isBadRequest());
            assertEquals(3, actor.skin(), "unknown choices cannot replace the current appearance");
        }
    }
}
