package kr.co.shuim.points;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.community.CommunityController;
import kr.co.shuim.community.CommunityService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.util.Map;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PointsControllerTest {
    @Test void balanceUsesOnlyTheAuthenticatedAccountAndNeverCreatesGuestSessions() {
        var auth=mock(AuthService.class); var points=mock(PointsService.class); var req=new MockHttpServletRequest();
        var controller=new PointsController(auth,points);
        when(auth.currentUser(req)).thenReturn(Optional.empty());
        assertEquals(401,assertThrows(ApiException.class,()->controller.me(req)).status());
        verifyNoInteractions(points);
        var user=new DbUser("member",null,"회원","user",false,null,null,0);
        when(auth.currentUser(req)).thenReturn(Optional.of(user));
        controller.me(req); verify(points).me(user); verify(auth,never()).requireUser(any(),any());
    }
    @Test void adoptionUsesExistingCommunityConsentGuardBeforeMutation() {
        var auth=mock(AuthService.class); var community=mock(CommunityService.class); var consent=mock(CommunityConsentService.class);
        var req=new MockHttpServletRequest(); var res=new MockHttpServletResponse();
        var user=new DbUser("member",null,"회원","user",false,null,null,0);
        when(auth.requireUser(req,res)).thenReturn(user);
        var controller=new CommunityController(auth,community,consent);
        doThrow(ApiException.forbidden("동의 필요")).when(consent).requireAccepted(user);
        assertThrows(ApiException.class,()->controller.post("comment.accept",Map.of("postId","post","commentId","comment"),req,res));
        verifyNoInteractions(community);
        doNothing().when(consent).requireAccepted(user);
        controller.post("comment.accept",Map.of("postId","post","commentId","comment"),req,res);
        verify(community).acceptComment(user,"post","comment");
    }
}
