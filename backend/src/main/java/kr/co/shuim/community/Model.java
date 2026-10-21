package kr.co.shuim.community;

import java.util.List;
import java.util.Map;

/** 화면(lib/community-core.ts 의 CommunityStore)이 기대하는 JSON 모양 그대로의 레코드들 */
public final class Model {
    private Model() {}

    public record User(String id, String nick, String role, Long blockedAt, String blockedReason) {
        public boolean blocked() { return blockedAt != null; }
    }

    public record Report(String by, String reason, long at) {}

    /** 외침·댓글·피드 공통 */
    public interface Item {
        String id();
        String authorId();
        String text();
        long createdAt();
        List<String> cheers();
        List<Report> reports();
        Boolean hidden();
        Long reviewedAt();
    }

    public record Post(String id, String cat, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt) implements Item {}

    public record Comment(String id, String postId, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt) implements Item {}

    public record FeedPage(String image, String title, String text) {}

    public record FeedPost(String id, String title, String text, int bg, String image, List<String> images, List<FeedPage> pages,
                           String authorId, long createdAt, List<String> cheers, List<Report> reports, List<String> saves, Boolean hidden, Long reviewedAt) implements Item {}

    public record Creator(String bio, List<String> followers, long since) {}

    public record Donation(String id, String by, int amount, String message, long at) {}

    public record RankRow(int rank, String userId, String nick, int cheers, int posts, String topPostId, String topPostText, double share, long payout) {}

    public record Fund(long total, int count, int donors) {}

    public record WeeklyBatch(String week, long computedAt, boolean finalized, List<RankRow> rows, Fund fund) {}

    /** 전체 상태. 목록·맵은 변경 가능한 구현을 넣어 서버가 집계·자동 답글을 덧붙일 수 있게 한다 */
    public record Store(User me, List<User> users, List<Post> posts, List<Comment> comments, List<FeedPost> feed,
                        Map<String, Creator> creators, List<String> following, List<Donation> donations, Map<String, WeeklyBatch> weekly) {}

    public record Target(String kind, String id) {}
}
