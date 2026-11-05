package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BeachMapControllerTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachFireService fire = mock(BeachFireService.class);
    private final BeachService service = new BeachService(clock::get, fire);
    private final BeachController controller = new BeachController(auth, mock(BlockService.class), service, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final MockHttpServletResponse response = new MockHttpServletResponse();
    private MockMvc mvc;

    @BeforeEach void setup() {
        var admin = new DbUser("operator", null, "운영자", "admin", false, null, null, 0);
        when(auth.currentUser(any())).thenReturn(Optional.of(admin));
        when(auth.requireUser(any(), any())).thenReturn(admin);
        when(auth.isAdmin(any())).thenCallRealMethod();
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "open", "public", "", "", "operator", 0, 0, 1, 0, false));
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        when(fire.snapshot(anyString())).thenAnswer(call -> new BeachFireService.FireView(3, 12, .25, "amber", null, clock.get(), clock.get() + 60_000, null, 0));
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
    }

    @Test void uyuniEntryAdvertisesOnlyAvailableFacilitiesAndCountAndFireRespectTheSelectedMap() throws Exception {
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON).content("{\"communityId\":\"room\",\"mapId\":\"uyuni\",\"character\":\"female-3d\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mapId").value("uyuni"))
            .andExpect(jsonPath("$.count").value(1)).andExpect(jsonPath("$.capacity").value(100))
            .andExpect(jsonPath("$.restEnabled").value(true)).andExpect(jsonPath("$.bedEnabled").value(true))
            .andExpect(jsonPath("$.benchEnabled").value(false)).andExpect(jsonPath("$.onsenEnabled").value(false))
            .andExpect(jsonPath("$.fireEnabled").value(false)).andExpect(jsonPath("$.fire.logs").value(0))
            .andExpect(jsonPath("$.fire.maxLogs").value(12)).andExpect(jsonPath("$.fire.intensity").value(0))
            .andExpect(jsonPath("$.fire.color").value("amber")).andExpect(jsonPath("$.fire.powderEnabled").value(false))
            .andExpect(jsonPath("$.fire.serverTime").value(clock.get())).andExpect(jsonPath("$.lightingControl").value(true))
            .andExpect(jsonPath("$.fireworksControl").value(true)).andExpect(jsonPath("$.me.skin").value(3))
            .andExpect(jsonPath("$.bounds.minZ").value(-50)).andExpect(jsonPath("$.bounds.maxZ").value(55))
            .andExpect(jsonPath("$.bounds.minX").value(-22)).andExpect(jsonPath("$.bounds.maxX").value(22));
        mvc.perform(get("/api/beach/count").param("communityId", "room").param("mapId", "uyuni"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mapId").value("uyuni")).andExpect(jsonPath("$.count").value(1));
        mvc.perform(get("/api/beach/count").param("communityId", "room"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mapId").value("beach")).andExpect(jsonPath("$.count").value(0));
        mvc.perform(get("/api/beach/fire").param("communityId", "room").param("mapId", "uyuni"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.logs").value(0));
        verifyNoInteractions(fire);
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON).content("{\"communityId\":\"room\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mapId").value("beach"))
            .andExpect(jsonPath("$.fireEnabled").value(true)).andExpect(jsonPath("$.fire.logs").value(3))
            .andExpect(jsonPath("$.bounds.minZ").value(-1)).andExpect(jsonPath("$.bounds.maxZ").value(55))
            .andExpect(jsonPath("$.count").value(1));
    }

    @Test void bambooEntryAdvertisesPavilionsInsteadOfStarlightBedsOrBeachFacilities() throws Exception {
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON).content("{\"communityId\":\"room\",\"mapId\":\"bamboo\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mapId").value("bamboo"))
            .andExpect(jsonPath("$.count").value(1)).andExpect(jsonPath("$.capacity").value(100))
            .andExpect(jsonPath("$.restEnabled").value(false)).andExpect(jsonPath("$.bedEnabled").value(false))
            .andExpect(jsonPath("$.pavilionEnabled").value(true))
            .andExpect(jsonPath("$.benchEnabled").value(false)).andExpect(jsonPath("$.onsenEnabled").value(false))
            .andExpect(jsonPath("$.fireEnabled").value(false)).andExpect(jsonPath("$.fire.logs").value(0))
            .andExpect(jsonPath("$.bounds.minZ").value(-4)).andExpect(jsonPath("$.bounds.maxZ").value(115))
            .andExpect(jsonPath("$.bounds.minX").value(-44)).andExpect(jsonPath("$.bounds.maxX").value(44));
        mvc.perform(get("/api/beach/count").param("communityId", "room").param("mapId", "bamboo"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mapId").value("bamboo")).andExpect(jsonPath("$.count").value(1));
        mvc.perform(get("/api/beach/count").param("communityId", "room").param("mapId", "uyuni"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON).content("{\"communityId\":\"room\",\"mapId\":\"uyuni\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.restEnabled").value(true)).andExpect(jsonPath("$.bedEnabled").value(true))
            .andExpect(jsonPath("$.pavilionEnabled").value(false));
        verifyNoInteractions(fire);
    }

    @Test void pavilionRestApiUsesServerSeatsAndRejectsClaimsAwayFromTheDeck() throws Exception {
        String ticket = (String) controller.enter(new BeachController.EnterBody("room", null, "bamboo"), request, response).get("ticket");
        service.tick(ticket, -18, 75, .75, false, null, null);
        String sit = "{\"ticket\":\"" + ticket + "\",\"action\":\"sit\",\"spotId\":\"pavilion-moon\",\"slot\":4,\"x\":0}";
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(sit)).andExpect(status().isBadRequest());
        service.tick(ticket, -15.4, 78.0, .75, false, null, null);
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(sit))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pose").value("sitting"))
            .andExpect(jsonPath("$.spotId").value("pavilion-moon")).andExpect(jsonPath("$.slot").value(0))
            .andExpect(jsonPath("$.x").value(-15.58)).andExpect(jsonPath("$.z").value(78.3))
            .andExpect(jsonPath("$.yaw").value(-Math.PI / 2));
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"action\":\"stand\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pose").value("standing"))
            .andExpect(jsonPath("$.x").value(-15.4)).andExpect(jsonPath("$.z").value(78.0));
        verifyNoInteractions(fire);
    }

    @Test void unsupportedMapNamesAndJsonTypesAreRejectedInsteadOfFallingBack() throws Exception {
        for (String invalid : List.of("\"\"", "\"UYUNI\"", "\"uyuni \"", "\"other\"", "7", "true", "{}", "[]"))
            mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON)
                .content("{\"communityId\":\"room\",\"mapId\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
        for (String endpoint : List.of("count", "fire"))
            mvc.perform(get("/api/beach/" + endpoint).param("communityId", "room").param("mapId", "fake:uyuni"))
                .andExpect(status().isBadRequest());
        assertEquals(0, service.count("room")); assertEquals(0, service.count("room", "uyuni"));
        verifyNoInteractions(fire);
    }

    @Test void hotelRestApiUsesServerSlotsAndCoordinatesAndRejectsClaimsOutsideTheHotel() throws Exception {
        String ticket = (String) controller.enter(new BeachController.EnterBody("room", null, "uyuni"), request, response).get("ticket");
        service.tick(ticket, -7.6, 23, .75, false, null, null);
        String lie = "{\"ticket\":\"" + ticket + "\",\"action\":\"lie\",\"spotId\":\"hotel-dawn\",\"slot\":99,\"x\":0}";
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(lie))
            .andExpect(status().isBadRequest());
        service.tick(ticket, -12, 19, .75, false, null, null);
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(lie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pose").value("lying"))
            .andExpect(jsonPath("$.spotId").value("hotel-dawn")).andExpect(jsonPath("$.slot").value(0))
            .andExpect(jsonPath("$.x").value(-13.5)).andExpect(jsonPath("$.z").value(24.5))
            .andExpect(jsonPath("$.yaw").value(Math.PI));
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"action\":\"stand\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pose").value("standing"))
            .andExpect(jsonPath("$.x").value(-12)).andExpect(jsonPath("$.z").value(19))
            .andExpect(jsonPath("$.yaw").value(.75));
        verifyNoInteractions(fire);
    }

    @Test void choosingUyuniDoesNotBypassMembershipOrAccountRestrictions() {
        var body = new BeachController.EnterBody("room", null, "uyuni");
        for (Optional<CircleService.Member> membership : List.of(Optional.<CircleService.Member>empty(),
            Optional.of(new CircleService.Member("member", "pending", false, false)))) {
            when(circles.member("room", "operator")).thenReturn(membership);
            assertEquals(403, assertThrows(ApiException.class, () -> controller.enter(body, request, response)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.count("room", "uyuni", request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.fire("room", "uyuni", request)).status());
        }
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.count("room", "uyuni", request)).status());
        var blocked = new DbUser("operator", null, "운영자", "admin", false, 1L, null, 0);
        when(auth.requireUser(any(), any())).thenReturn(blocked);
        assertEquals(403, assertThrows(ApiException.class, () -> controller.enter(body, request, response)).status());
        verifyNoInteractions(fire);
    }

    @Test void forgedMapFieldsCannotMoveATicketOrEnableBeachFacilitiesAndSharedEffectsStayInUyuni() throws Exception {
        Map<String, Object> entry = controller.enter(new BeachController.EnterBody("room", null, "uyuni"), request, response);
        String ticket = (String) entry.get("ticket");
        var coast = service.enter("room", "coast-only", "해변", Set.of());
        String forged = "\"mapId\":\"beach\",\"communityId\":\"forged-room\",\"fireEnabled\":true";
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"x\":0,\"z\":12," + forged + ",\"care\":{\"to\":\"coast-only\",\"kind\":\"comfort\"}}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1)).andExpect(jsonPath("$.players").isEmpty())
            .andExpect(jsonPath("$.care").value("gone")).andExpect(jsonPath("$.fire.logs").value(0));
        for (String endpoint : List.of("wood", "powder"))
            mvc.perform(post("/api/beach/fire/" + endpoint).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"color\":\"rose\"," + forged + "}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"action\":\"sit\",\"spotId\":\"fire-benches\"," + forged + "}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"mode\":\"night\"," + forged + "}"))
            .andExpect(status().isOk());
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"variant\":\"love\"," + forged + "}"))
            .andExpect(status().isOk());
        assertEquals("night", service.lighting("room", "uyuni").mode());
        assertEquals("auto", service.lighting("room").mode());
        assertEquals(1, service.fireworks("room", "uyuni").events().size());
        assertTrue(service.fireworks("room").events().isEmpty());
        verifyNoInteractions(fire);
        assertTrue(service.tick(coast.ticket(), 0, 12, 0, false, null, null).events().isEmpty());
    }
}
