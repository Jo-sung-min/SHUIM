package kr.co.shuim.admin;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminUsersServiceTest {
    @Test void invalidFiltersAndPrivilegeLikeTypesNeverReachTheDatabase() {
        var jdbc = mock(JdbcClient.class);
        var service = new AdminUsersService(jdbc);
        for (String type : new String[]{null, "", "admin", "owner", "PARTNER", " partner "})
            assertEquals(400, assertThrows(ApiException.class, () -> service.setMemberType("target", type)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.list("가".repeat(25), 0)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.list("닉\u0000", 0)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.list("", -1)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.list("", 100_001)).status());
        verifyNoInteractions(jdbc);
    }

    @Test void springCanConstructTheServiceWithoutAHiddenNullDatabaseFallback() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcClient.class, () -> mock(JdbcClient.class));
            context.register(AdminUsersService.class);
            context.refresh();
            assertNotNull(context.getBean(AdminUsersService.class));
        }
    }
}
