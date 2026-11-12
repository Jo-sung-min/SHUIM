package kr.co.shuim.keepsake;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.beach.BeachRoom;
import kr.co.shuim.beach.BeachService;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.upload.S3Service;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class KeepsakeControllerTest {
    final AuthService auth = mock(AuthService.class);
    final BeachService beach = mock(BeachService.class);
    final CircleService circles = mock(CircleService.class);
    final Keepsakes store = mock(Keepsakes.class);
    final S3Service s3 = mock(S3Service.class);
    final OrbStaysTest.Hand hand = new OrbStaysTest.Hand("2026-11-13T03:00:00Z");
    final OrbStays stays = new OrbStays(hand);
    final MockHttpServletRequest req = new MockHttpServletRequest();
    final KeepsakeController controller = new KeepsakeController(auth, beach, circles, store, stays, s3, 600, 100);
    final LocalDate today = LocalDate.parse("2026-11-13");
    final Keepsakes.Orb orb = new Keepsakes.Orb("7", "2026-11-13", 1, 2, "garden", true, "공용 공간", "bench-ne", "호숫가 벤치",
        List.of(new Keepsakes.Companion("u-friend", "가람")), 1);

    @BeforeEach void signIn() {
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("owner", null, "나", "user", false, null, null, 0)));
        // doThrow/doReturn: 이미 던지게 해 둔 메서드를 다시 부르지 않고 덧붙인다
        doThrow(ApiException.gone("gone")).when(beach).requireVisit(isNull(), anyString());
        doThrow(ApiException.gone("gone")).when(beach).requireVisit(eq("stale"), anyString());
        doReturn(new BeachService.Visit("public", "garden", null)).when(beach).requireVisit("ticket", "owner");
        when(beach.companions("ticket")).thenReturn(List.of(new BeachRoom.Companion("u-friend", "가람")));
    }

    private void stayFor(int beats) {
        controller.stay(new KeepsakeController.StayBody("ticket"), req);
        for (int i = 0; i < beats; i++) { hand.pass(30_000); controller.stay(new KeepsakeController.StayBody("ticket"), req); }
    }

    @Test void guestsAnonymousAndBlockedAccountsHaveNoKeepsakes() {
        var nobody = new MockHttpServletRequest();
        assertEquals(401, assertThrows(ApiException.class, () -> controller.orbs(nobody)).status());
        when(auth.currentUser(nobody)).thenReturn(Optional.of(new DbUser("guest", null, "g", "user", true, null, null, 0)));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.stay(new KeepsakeController.StayBody("ticket"), nobody)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.album(nobody)).status());
        when(auth.currentUser(nobody)).thenReturn(Optional.of(new DbUser("blocked", null, "b", "user", false, 1L, "", 0)));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.claim(new KeepsakeController.ClaimBody("ticket", 3, null, null), nobody)).status());
        verifyNoInteractions(store);
        verify(beach, never()).companions(any());
    }

    @Test void theShelfIsPrivateAndReportsToday() {
        when(store.orbs("owner")).thenReturn(List.of(orb));
        var response = controller.orbs(req);
        assertEquals("no-store", response.getHeaders().getCacheControl());
        var body = response.getBody();
        assertEquals(true, body.get("enabled"));
        assertEquals(List.of(orb), body.get("orbs"));
        var day = (java.util.Map<?, ?>) body.get("today");
        assertEquals("2026-11-13", day.get("day"));
        assertEquals(0L, day.get("stayMs"));
        assertEquals(600_000L, day.get("needMs"));
        assertEquals(false, day.get("found"));
    }

    @Test void stayingNeedsMyOwnLiveVisitAndCountsOnTheServer() {
        assertEquals(410, assertThrows(ApiException.class, () -> controller.stay(null, req)).status());
        assertEquals(410, assertThrows(ApiException.class, () -> controller.stay(new KeepsakeController.StayBody("stale"), req)).status());
        assertEquals(0, stays.stayed("owner"));
        stayFor(3);
        var body = controller.stay(new KeepsakeController.StayBody("ticket"), req).getBody();
        assertEquals(90_000L, body.get("stayMs"));
        assertEquals(false, body.get("found"));
        // 오늘 주웠는지는 하루에 한 번만 DB 에서 읽는다
        verify(store, times(1)).foundOn("owner", today);
    }

    @Test void claimingBeforeTenMinutesIsRefusedAndNothingIsWritten() {
        stayFor(19);
        var early = assertThrows(ApiException.class, () -> controller.claim(new KeepsakeController.ClaimBody("ticket", 2, "bench-ne", "호숫가 벤치"), req));
        assertEquals(425, early.status());
        verify(store, never()).claim(any(), any(), anyInt(), any(), any(), any(), any(), any(), any());
    }

    @Test void claimingStoresWhatTheServerSawNotWhatTheClientSays() {
        stayFor(20);
        when(store.claim(any(), any(), anyInt(), any(), any(), any(), any(), any(), any())).thenReturn(orb);
        var response = controller.claim(new KeepsakeController.ClaimBody("ticket", 2, "bench-ne", "  호숫가\n벤치  "), req);
        assertSame(orb, response.getBody());
        verify(store).claim("owner", today, 2, "garden", "public", "공용 공간", "bench-ne", "호숫가벤치",
            List.of(new Keepsakes.Companion("u-friend", "가람")));
        assertEquals(true, controller.stay(new KeepsakeController.StayBody("ticket"), req).getBody().get("found"));
    }

    @Test void moodMustBeOneToFiveAndOddSpotIdsAreDropped() {
        stayFor(20);
        for (Integer mood : new Integer[] {null, 0, 6, -1})
            assertEquals(400, assertThrows(ApiException.class, () -> controller.claim(new KeepsakeController.ClaimBody("ticket", mood, null, null), req)).status());
        when(store.claim(any(), any(), anyInt(), any(), any(), any(), any(), any(), any())).thenReturn(orb);
        controller.claim(new KeepsakeController.ClaimBody("ticket", 5, "<script>", "가".repeat(60)), req);
        verify(store).claim(eq("owner"), eq(today), eq(5), eq("garden"), eq("public"), eq("공용 공간"), isNull(), eq("가".repeat(40)), any());
    }

    @Test void aSecondClaimTheSameDayIsAConflictAndRemembered() {
        stayFor(20);
        when(store.claim(any(), any(), anyInt(), any(), any(), any(), any(), any(), any())).thenThrow(new ApiException(409, "이미"));
        assertEquals(409, assertThrows(ApiException.class, () -> controller.claim(new KeepsakeController.ClaimBody("ticket", 3, null, null), req)).status());
        assertEquals(Boolean.TRUE, stays.found("owner"));
    }

    @Test void aSorowSpaceKeepsItsNameOfThatMoment() {
        doReturn(new BeachService.Visit("circle-1", "baikal", null)).when(beach).requireVisit("ticket", "owner");
        when(circles.byId("circle-1")).thenThrow(ApiException.notFound("없음"));
        stayFor(20);
        when(store.claim(any(), any(), anyInt(), any(), any(), any(), any(), any(), any())).thenReturn(orb);
        controller.claim(new KeepsakeController.ClaimBody("ticket", 1, null, null), req);
        verify(store).claim(eq("owner"), eq(today), eq(1), eq("baikal"), eq("circle-1"), eq("소로우"), isNull(), eq(""), any());
    }

    @Test void onlyMyOwnUploadedStillImagesEnterTheAlbum() {
        when(s3.ownedKeyFromUrl("https://cdn/feed/a/owner-1.webp", "owner")).thenReturn("feed/a/owner-1.webp");
        when(s3.ownedKeyFromUrl("https://cdn/feed/a/owner-2.mp4", "owner")).thenReturn("feed/a/owner-2.mp4");
        var photo = new Keepsakes.Photo("3", "https://cdn/feed/a/owner-1.webp", "garden", "공용 공간", 5);
        when(store.addPhoto("owner", "feed/a/owner-1.webp", "https://cdn/feed/a/owner-1.webp", "garden", "공용 공간", 100)).thenReturn(photo);
        assertSame(photo, controller.addPhoto(new KeepsakeController.PhotoBody("https://cdn/feed/a/owner-1.webp", "ticket", "beach"), req).getBody());
        for (String url : new String[] {null, "https://elsewhere/x.webp", "https://cdn/feed/a/owner-2.mp4"})
            assertEquals(400, assertThrows(ApiException.class, () -> controller.addPhoto(new KeepsakeController.PhotoBody(url, "ticket", "beach"), req)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.addPhoto(null, req)).status());
        // 방문이 끝난 뒤에 넣으면 화면이 알려 준 맵만 적는다 (모르는 맵은 받지 않는다)
        controller.addPhoto(new KeepsakeController.PhotoBody("https://cdn/feed/a/owner-1.webp", "stale", "uyuni"), req);
        verify(store).addPhoto("owner", "feed/a/owner-1.webp", "https://cdn/feed/a/owner-1.webp", "uyuni", "", 100);
        assertEquals(400, assertThrows(ApiException.class,
            () -> controller.addPhoto(new KeepsakeController.PhotoBody("https://cdn/feed/a/owner-1.webp", "stale", "moon"), req)).status());
    }

    @Test void removingSomeoneElsesKeepsakeIsNotFound() {
        assertEquals(404, assertThrows(ApiException.class, () -> controller.removeOrb(9, req)).status());
        assertEquals(404, assertThrows(ApiException.class, () -> controller.removePhoto(9, req)).status());
        when(store.removeOrb("owner", 7)).thenReturn(true);
        when(store.removePhoto("owner", 3)).thenReturn(true);
        assertEquals(true, controller.removeOrb(7, req).get("ok"));
        assertEquals(true, controller.removePhoto(3, req).get("ok"));
    }
}
