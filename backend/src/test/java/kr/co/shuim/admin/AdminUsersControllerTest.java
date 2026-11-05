package kr.co.shuim.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonInclude;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminUsersControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final AdminUsersService service = mock(AdminUsersService.class);
    private final AdminUsersController controller = new AdminUsersController(auth, service);
    private static DbUser actor(String role, boolean anonymous, Long blockedAt) {
        return new DbUser("actor", null, "관리자", role, anonymous, blockedAt, null, 0);
    }

    @Test void listingAndMemberTypeChangesRequireAnUnblockedRegisteredAdministrator() {
        var request = new MockHttpServletRequest();
        when(auth.isAdmin(any())).thenCallRealMethod();
        for (var user : Arrays.asList(null, actor("user", false, null), actor("admin", true, null), actor("admin", false, 1L))) {
            when(auth.currentUser(request)).thenReturn(Optional.ofNullable(user));
            assertEquals(403, assertThrows(ApiException.class, () -> controller.list("", "0", request)).status());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.memberType("target", new AdminUsersController.MemberTypeBody("partner"), request)).status());
        }
        verifyNoInteractions(service);
    }

    @Test void jsonProjectionContainsOnlySafeFieldsAndDoesNotInventHistoricSignupDates() throws Exception {
        when(auth.currentUser(any())).thenReturn(Optional.of(actor("admin", false, null)));
        when(auth.isAdmin(any())).thenCallRealMethod();
        var user = new AdminUsersService.User("registered", "따뜻한 사람", 1000, null, List.of("toss"), "active", "member", false);
        when(service.list("따뜻", 1)).thenReturn(new AdminUsersService.Page(List.of(user), 31, 1, 30));
        var mapper = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
        String body = mvc.perform(get("/api/admin/users").param("q", "따뜻").param("page", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(31))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.users[0].signupMethods[0]").value("toss")).andReturn().getResponse().getContentAsString();
        var node = new ObjectMapper().readTree(body).path("users").get(0);
        var keys = StreamSupport.stream(((Iterable<String>) node::fieldNames).spliterator(), false).collect(Collectors.toSet());
        assertEquals(Set.of("id", "nick", "createdAt", "registeredAt", "signupMethods", "status", "memberType", "admin"), keys);
        assertTrue(node.has("registeredAt") && node.get("registeredAt").isNull());
        mvc.perform(get("/api/admin/users").param("page", "not-a-page")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/users").param("page", "999999999999")).andExpect(status().isBadRequest());
    }

    @Test void aMemberTypeRequestCannotForwardForgedAdministratorAuthority() throws Exception {
        when(auth.currentUser(any())).thenReturn(Optional.of(actor("admin", false, null)));
        when(auth.isAdmin(any())).thenCallRealMethod();
        var user = new AdminUsersService.User("target", "회원", 1000, 2000L, List.of("email"), "active", "keeper", false);
        when(service.setMemberType("target", "keeper")).thenReturn(user);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(patch("/api/admin/users/target/member-type").contentType(MediaType.APPLICATION_JSON)
            .content("{\"memberType\":\"keeper\",\"role\":\"admin\",\"admin\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.user.admin").value(false))
            .andExpect(jsonPath("$.user.memberType").value("keeper"));
        verify(service).setMemberType("target", "keeper");
        mvc.perform(patch("/api/admin/users/target/member-type").contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isBadRequest());
        verifyNoMoreInteractions(service);
    }
}
