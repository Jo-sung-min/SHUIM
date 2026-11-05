package kr.co.shuim.payment;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaymentControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final PaymentService payments = mock(PaymentService.class);
    private final PaymentController controller = new PaymentController(auth, circles, payments);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final DbUser user = new DbUser("u1", null, "테스트", "user", false, null, null, 0);

    @Test void unauthenticatedOrBlockedUsersCannotCreatePaymentIntents() {
        var body = new PaymentController.Create("c1", "rose", "web", UUID.randomUUID().toString());
        when(auth.currentUser(request)).thenReturn(Optional.empty());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.create(body, request)).status());
        when(auth.currentUser(request)).thenReturn(Optional.of(new DbUser("u1", null, "테스트", "user", false, 1L, null, 0)));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.create(body, request)).status());
        verifyNoInteractions(payments, circles);
    }

    @Test void publicCircleOrPendingMembershipDoesNotPermitCheckout() {
        when(auth.currentUser(request)).thenReturn(Optional.of(user));
        when(circles.byId("c1")).thenReturn(new CircleService.Circle("c1", "c1", "소로우", "life", null, false, "open", "public", "", "", "u1", 0, 0, 1, 0, false));
        when(circles.member("c1", user.id())).thenReturn(Optional.of(new CircleService.Member("member", "pending", false, false)));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.catalog("c1", "web", request)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.create(new PaymentController.Create("c1", "rose", "web", UUID.randomUUID().toString()), request)).status());
        verifyNoInteractions(payments);
        when(circles.member("c1", user.id())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        controller.catalog("c1", "web", request);
        verify(payments).catalog(user, "c1", "web");
    }

    @Test void inaccessiblePrivateCircleIsHiddenBeforeMembershipOrPaymentLookup() {
        when(auth.currentUser(request)).thenReturn(Optional.of(user));
        var circle = new CircleService.Circle("private", "private", "비공개", "life", null, false, "invite", "members", "", "", "owner", 0, 0, 2, 0, false);
        when(circles.byId("private")).thenReturn(circle);
        doThrow(ApiException.notFound("소로우를 찾을 수 없어요.")).when(circles).requireAccess(circle, user);
        assertEquals(404, assertThrows(ApiException.class, () -> controller.catalog("private", "web", request)).status());
        assertEquals(404, assertThrows(ApiException.class, () -> controller.create(new PaymentController.Create("private", "rose", "web", UUID.randomUUID().toString()), request)).status());
        verify(circles, never()).member(anyString(), anyString());
        verifyNoInteractions(payments);
    }
}
