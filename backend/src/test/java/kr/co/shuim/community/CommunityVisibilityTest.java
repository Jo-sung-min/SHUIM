package kr.co.shuim.community;

import kr.co.shuim.community.Model.*;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class CommunityVisibilityTest {
    private static Store store(List<User> users, List<Post> posts, List<Comment> comments, List<FeedPost> feed, List<RankRow> ranks) {
        WeeklyBatch week = new WeeklyBatch("2026-01-05", 0, true, ranks, new Fund(0, 0, 0));
        return new Store(new User("me", "me", "user", null, null), users, posts, comments, feed, Map.of(), List.of(), List.of(), Map.of(week.week(), week));
    }

    @Test
    void privateCircleFilterOverridesAuthorAdminMembershipAndRemovesNestedMediaAndReplies() {
        var secret = new Post("secret", "misfortune", "private text", "me", 0, List.of("reactor"), List.of(), false, null,
            List.of("https://cdn.example/private.webp"), "private", 1, "private circle", "private-slug");
        var comment = new Comment("reply", secret.id(), "private reply", "peer", 0, List.of(), List.of(), false, null);
        var source = store(List.of(), List.of(secret), List.of(comment), List.of(),
            List.of(new RankRow(1, "me", "me", 1, 1, secret.id(), secret.text(), 1, 0)));
        for (boolean admin : List.of(false, true)) {
            var hidden = CommunityService.visibleStore(source, Set.of(), admin, Set.of("private"),
                Map.of("private", "members"), 1_000, Set.of("private"));
            assertTrue(hidden.posts().isEmpty());
            assertTrue(hidden.comments().isEmpty());
            assertTrue(hidden.weekly().values().stream().allMatch(w -> w.rows().isEmpty()));
        }
        var allowed = CommunityService.visibleStore(source, Set.of(), false, Set.of("private"),
            Map.of("private", "members"), 1_000, Set.of());
        assertEquals(List.of(secret.id()), allowed.posts().stream().map(Post::id).toList());
        // 남이 누른 힘내요는 수만 남고 누가 눌렀는지는 가려진다
        assertEquals(List.of(""), allowed.posts().get(0).cheers());
        assertEquals(List.of(comment), allowed.comments());
    }

    @Test
    void nonAdminsGetOnlyReferencedPeopleWithoutRoleOrSuspensionDetailsAndMaskedIds() {
        User me = new User("me", "me", "user", null, null);
        User author = new User("author", "작성자", "admin", null, null, "칭호", true);
        User commenter = new User("commenter", "댓글", "user", null, null);
        User stranger = new User("stranger", "모르는 사람", "user", null, null);
        User suspended = new User("suspended", "정지", "user", 5L, "관리자 메모");
        User sender = new User("sender", "사연 보낸 사람", "user", null, null);
        Post post = new Post("p", "free", "hello", "author", 0, List.of("me", "stranger", "commenter"), List.of(), false, null);
        Post story = new Post("s", "free", "story", "sender", 0, List.of("sender"), List.of(), false, null, List.of(), "c1", 1, "소로우", "slug");
        Comment comment = new Comment("c", "p", "reply", "commenter", 0, List.of("stranger"), List.of(), false, null);
        FeedPost feed = new FeedPost("f", null, "feed", 0, null, List.of(), List.of(), "author", 0, List.of("stranger"), List.of(), List.of(), false, null);
        Map<String, Creator> creators = new LinkedHashMap<>();
        creators.put("author", new Creator("bio", List.of("stranger", "me"), 0));
        creators.put("stranger", new Creator("old bio", List.of(), 0));
        Store source = new Store(me, List.of(me, author, commenter, stranger, suspended, sender), List.of(post, story), List.of(comment), List.of(feed),
            creators, List.of("author"), List.of(), Map.of());

        Store filtered = CommunityService.visibleStore(source, Set.of(), false, Set.of(), Map.of("c1", "public"), 1_000);
        assertEquals(List.of("author", "commenter"), filtered.users().stream().map(User::id).toList());
        User shownAuthor = filtered.users().get(0);
        assertNull(shownAuthor.role());
        assertNull(shownAuthor.blockedAt());
        assertNull(shownAuthor.blockedReason());
        assertEquals("칭호", shownAuthor.title());
        assertEquals(Boolean.TRUE, shownAuthor.registered());
        assertEquals(List.of("me", "", ""), filtered.posts().get(0).cheers());
        assertEquals("c:c1", filtered.posts().get(1).authorId());
        assertEquals(List.of(""), filtered.posts().get(1).cheers());
        assertEquals(List.of(""), filtered.comments().get(0).cheers());
        assertEquals(List.of(""), filtered.feed().get(0).cheers());
        assertEquals(Set.of("author"), filtered.creators().keySet());
        assertEquals(List.of("", "me"), filtered.creators().get("author").followers());
        assertEquals(List.of("author"), filtered.following());

        Store admin = CommunityService.visibleStore(source, Set.of(), true, Set.of(), Map.of("c1", "public"), 1_000);
        assertEquals(List.of("author", "commenter", "stranger", "suspended", "sender"), admin.users().stream().map(User::id).toList());
        assertEquals("관리자 메모", admin.users().get(3).blockedReason());
        assertEquals(List.of("me", "stranger", "commenter"), admin.posts().get(0).cheers());
        assertEquals(Set.of("author", "stranger"), admin.creators().keySet());
    }

    @Test
    void weakReportsAreKeptForAdminsButNeverAutoHideOrCountForOthers() {
        List<Report> weak = new ArrayList<>();
        for (int i = 0; i < CommunityLogic.REPORT_THRESHOLD; i++) weak.add(new Report("throwaway-" + i, "abuse", 100, true));
        Post post = new Post("p", "free", "text", "author", 0, List.of(), weak, false, null);
        assertFalse(CommunityLogic.isFlagged(post));
        Store source = store(List.of(), List.of(post), List.of(), List.of(), List.of());
        assertTrue(CommunityService.visibleStore(source, Set.of(), false).posts().get(0).reports().isEmpty());
        assertEquals(CommunityLogic.REPORT_THRESHOLD, CommunityService.visibleStore(source, Set.of(), true).posts().get(0).reports().size());

        List<Report> mixed = new ArrayList<>(weak);
        for (int i = 0; i < CommunityLogic.REPORT_THRESHOLD; i++) mixed.add(new Report("member-" + i, "abuse", 100));
        assertTrue(CommunityLogic.isFlagged(new Post("q", "free", "text", "author", 0, List.of(), mixed, false, null)));
    }

    @Test
    void privateCircleActivityNeverGeneratesSimulatedRepliesOrPublicWeeklyRanks() {
        long then = System.currentTimeMillis() - 60_000;
        var secret = new Post("private", "misfortune", "private", "me", then, List.of("v"), List.of(), false, null,
            List.of(), "circle", 1, "private", "private");
        var stranger = new Post("other", "free", "private other", "peer", then, List.of(), List.of(), false, null,
            List.of(), "circle", 2, "private", "private");
        var ownReply = new Comment("reply", stranger.id(), "private reply", "me", then, List.of(), List.of(), false, null);
        var source = store(List.of(new User("bot", "bot", "user", null, null)), List.of(secret, stranger), List.of(ownReply), List.of(), List.of());
        assertTrue(CommunityLogic.pendingSimulatedReplies(source, List.of("bot"), Set.of("private", "other")).isEmpty());
        assertTrue(CommunityLogic.computeWeekly(source, kr.co.shuim.common.Dates.weekKeyOf(then), false).rows().isEmpty());
    }

    @Test
    void excludedAuthorsAndTheirRepliesCannotLeakThroughNestedListsOrRanks() {
        User me = new User("me", "me", "user", null, null);
        Post visible = new Post("p", "free", "hello", "ok", 0, List.of(), List.of(), false, null);
        Post blocked = new Post("b", "free", "secret", "blocked", 0, List.of(), List.of(), false, null);
        Post hidden = new Post("h", "free", "removed", "ok", 0, List.of(), List.of(), true, null);
        Comment onBlockedPost = new Comment("c", "b", "reply", "ok", 0, List.of(), List.of(), false, null);
        Comment fromBlocked = new Comment("d", "p", "reply", "blocked", 0, List.of(), List.of(), false, null);
        WeeklyBatch weekly = new WeeklyBatch("2026-01-05", 0, true,
            List.of(new RankRow(1, "blocked", "private", 2, 1, "b", "secret", 1, 0)), new Fund(0, 0, 0));
        Store source = new Store(me, List.of(new User("blocked", "blocked", "user", null, null)), List.of(visible, blocked, hidden),
            List.of(onBlockedPost, fromBlocked), List.of(), Map.of("blocked", new Creator("bio", List.of(), 0)),
            List.of("blocked"), List.of(
                new Gift("from-blocked", "blocked", "ok", "p", 3, 5), new Gift("seen", "giver", "ok", "p", 1, 4),
                new Gift("to-blocked", "giver", "blocked", "b", 2, 3), new Gift("giver-left", null, "ok", "p", 5, 2),
                new Gift("on-hidden", "giver", "ok", "h", 1, 1)), Map.of(weekly.week(), weekly));
        Store filtered = CommunityService.visibleStore(source, Set.of("blocked"), false);
        assertEquals(List.of("p"), filtered.posts().stream().map(Post::id).toList());
        assertTrue(filtered.comments().isEmpty());
        assertTrue(filtered.users().isEmpty());
        assertTrue(filtered.creators().isEmpty());
        assertTrue(filtered.following().isEmpty());
        // 최근 오간 별: 차단한 사람이 주거나 받은 것, 떠난 계정이 준 것, 가려진 글에 준 것은 내려가지 않는다
        assertEquals(List.of("seen"), filtered.gifts().stream().map(Gift::id).toList());
        assertEquals(5, source.gifts().size());
        assertTrue(filtered.weekly().get(weekly.week()).rows().isEmpty());
        assertEquals(3, source.posts().size());
        assertEquals(1, source.weekly().get(weekly.week()).rows().size());
        assertEquals(List.of("p", "h"), CommunityService.visibleStore(source, Set.of("blocked"), true).posts().stream().map(Post::id).toList());
    }

    @Test
    void circlePostsHideTheirSenderAndIgnoreBlocks() {
        Post plaza = new Post("p", "free", "hello", "ok", 0, List.of(), List.of(), false, null);
        Post open = new Post("o", "free", "story", "sender", 0, List.of(), List.of(), false, null, List.of(), "c1", 1, "고려대 소로우", "korea");
        Post closed = new Post("m", "free", "story", "sender", 0, List.of(), List.of(), false, null, List.of(), "c2", 1, "회사 소로우", "corp");
        Post later = new Post("l", "free", "story", "sender", 5_000, List.of(), List.of(), false, null, List.of(), "c1", 2, "고려대 소로우", "korea");
        Store source = store(List.of(new User("sender", "sender", "user", null, null)), List.of(plaza, open, closed, later), List.of(), List.of(), List.of());
        Map<String, String> vis = Map.of("c1", "public", "c2", "members");

        // 보낸 사람을 차단했어도 사연은 그대로 보이고, 작성자는 소로우로 가려진다
        Store outsider = CommunityService.visibleStore(source, Set.of("sender"), false, Set.of(), vis, 1_000);
        assertEquals(List.of("p", "o"), outsider.posts().stream().map(Post::id).toList());
        Post seen = outsider.posts().get(1);
        assertEquals("c:c1", seen.authorId());
        assertEquals(1, seen.postNo());
        assertEquals("korea", seen.circleSlug());

        Store member = CommunityService.visibleStore(source, Set.of(), false, Set.of("c2"), vis, 1_000);
        assertEquals(List.of("p", "o", "m"), member.posts().stream().map(Post::id).toList());
        assertTrue(member.posts().stream().filter(Post::inCircle).allMatch(p -> p.authorId().startsWith("c:")));

        Store sender = new Store(new User("sender", "sender", "user", null, null), List.of(), source.posts(), List.of(), List.of(), Map.of(), List.of(), List.of(), source.weekly());
        Store own = CommunityService.visibleStore(sender, Set.of(), false, Set.of(), vis, 1_000);
        assertEquals(List.of("p", "o", "m", "l"), own.posts().stream().map(Post::id).toList());
        assertEquals("sender", own.posts().get(1).authorId());
    }

    @Test
    void ordinaryUsersOnlySeeTheirOwnReportDetailsAndPrivateSaves() {
        Report own = new Report("me", "abuse", 80);
        List<Report> reports = List.of(own, new Report("reporter-one", "spam", 90), new Report("reporter-two", "not_comfort", 30));
        Post post = new Post("p", "free", "text", "author", 0, List.of(), reports, false, 50L);
        Comment comment = new Comment("c", "p", "reply", "author", 0, List.of(), reports, false, 50L);
        FeedPost feed = new FeedPost("f", null, "feed", 0, null, List.of(), List.of(), "author", 0, List.of(), reports,
            List.of("me", "private-saver"), false, 50L);
        Store source = store(List.of(), List.of(post), List.of(comment), List.of(feed), List.of());
        Store filtered = CommunityService.visibleStore(source, Set.of(), false);
        for (Item item : List.of(filtered.posts().get(0), filtered.comments().get(0), filtered.feed().get(0))) {
            assertEquals(3, item.reports().size());
            assertEquals(2, CommunityLogic.activeReports(item).size());
            assertEquals(own, item.reports().get(0));
            assertEquals(List.of("me", "", ""), item.reports().stream().map(Report::by).toList());
            assertEquals(new Report("", "other", 51), item.reports().get(1));
            assertEquals(new Report("", "other", 0), item.reports().get(2));
        }
        assertEquals(List.of("me"), filtered.feed().get(0).saves());
        Store admin = CommunityService.visibleStore(source, Set.of(), true);
        assertEquals(reports, admin.posts().get(0).reports());
        assertEquals(reports, admin.comments().get(0).reports());
        assertEquals(reports, admin.feed().get(0).reports());
        assertEquals(List.of("me"), admin.feed().get(0).saves());
        assertEquals(List.of("me", "private-saver"), source.feed().get(0).saves());
    }

    @Test
    void finalizedRankingsNeverExposeDeletedHiddenFlaggedOrSuspendedContent() {
        List<Report> reports = new ArrayList<>();
        for (int i = 0; i < CommunityLogic.REPORT_THRESHOLD; i++) reports.add(new Report("reporter-" + i, "abuse", 100));
        Post visible = new Post("visible", "free", "public", "author", 0, List.of(), List.of(), false, null);
        Post hidden = new Post("hidden", "free", "hidden text", "author", 0, List.of(), List.of(), true, null);
        Post flagged = new Post("flagged", "free", "flagged text", "author", 0, List.of(), reports, false, null);
        Post suspended = new Post("suspended", "free", "suspended text", "suspended-author", 0, List.of(), List.of(), false, null);
        List<RankRow> rows = new ArrayList<>();
        for (String id : List.of("visible", "hidden", "flagged", "suspended", "deleted")) {
            rows.add(new RankRow(1, id.equals("suspended") ? "suspended-author" : "author", "nick", 1, 1, id, id + " text", 0, 0));
        }
        Store source = store(List.of(new User("suspended-author", "nick", "user", 1L, "reason")),
            List.of(visible, hidden, flagged, suspended), List.of(), List.of(), rows);
        Store filtered = CommunityService.visibleStore(source, Set.of(), false);
        assertEquals(List.of("visible"), filtered.weekly().get("2026-01-05").rows().stream().map(RankRow::topPostId).toList());
        assertFalse(filtered.posts().stream().anyMatch(p -> p.id().equals("suspended")));
        assertTrue(CommunityLogic.isFlagged(filtered.posts().stream().filter(p -> p.id().equals("flagged")).findFirst().orElseThrow()));
        assertEquals(5, source.weekly().get("2026-01-05").rows().size());
        assertEquals(List.of("visible"), CommunityService.visibleStore(source, Set.of(), true).weekly().get("2026-01-05").rows().stream().map(RankRow::topPostId).toList());
    }
}
