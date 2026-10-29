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
            List.of("blocked"), List.of(new Donation("d", "blocked", 100, "note", 0)), Map.of(weekly.week(), weekly));
        Store filtered = CommunityService.visibleStore(source, Set.of("blocked"), false);
        assertEquals(List.of("p"), filtered.posts().stream().map(Post::id).toList());
        assertTrue(filtered.comments().isEmpty());
        assertTrue(filtered.users().isEmpty());
        assertTrue(filtered.creators().isEmpty());
        assertTrue(filtered.following().isEmpty());
        assertTrue(filtered.donations().isEmpty());
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
