package kr.co.shuim.community;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/** 화면(lib/community-core.ts 의 CommunityStore)이 기대하는 JSON 모양 그대로의 레코드들 */
public final class Model {
    private Model() {}

    /** title = 대표 칭호(얻은 위로 배지 이름, 없으면 null 이라 JSON 에서 빠진다) */
    public record User(String id, String nick, String role, Long blockedAt, String blockedReason, String title, Boolean registered) {
        public User(String id, String nick, String role, Long blockedAt, String blockedReason, String title) {
            this(id, nick, role, blockedAt, blockedReason, title, null);
        }
        public User(String id, String nick, String role, Long blockedAt, String blockedReason) {
            this(id, nick, role, blockedAt, blockedReason, null);
        }
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

    /**
     * 외침. images 는 사진 주소(최대 CommunityLogic.SHOUT_MAX_IMAGES 장, 없으면 빈 목록).
     * communityId 가 있으면 커뮤니티 소로우에 게시된 사연(#postNo). circle/circleSlug 는 화면 표시용 소로우 이름·주소.
     * 사연의 authorId 는 보낸 사람 본인과 관리자에게만 실제 값이고, 다른 사람에게는 "c:<소로우 id>" 로 가려진다.
     */
    public record Post(String id, String cat, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt, List<String> images,
                       String communityId, Integer postNo, String circle, String circleSlug, String acceptedCommentId, int light) implements Item {
        /** 아직 별을 받지 않은 글 */
        public Post(String id, String cat, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt, List<String> images,
                    String communityId, Integer postNo, String circle, String circleSlug, String acceptedCommentId) {
            this(id, cat, text, authorId, createdAt, cheers, reports, hidden, reviewedAt, images, communityId, postNo, circle, circleSlug, acceptedCommentId, 0);
        }
        public Post(String id, String cat, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt, List<String> images,
                    String communityId, Integer postNo, String circle, String circleSlug) {
            this(id, cat, text, authorId, createdAt, cheers, reports, hidden, reviewedAt, images, communityId, postNo, circle, circleSlug, null);
        }
        /** 광장의 자유 외침 */
        public Post(String id, String cat, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt, List<String> images) {
            this(id, cat, text, authorId, createdAt, cheers, reports, hidden, reviewedAt, images, null, null, null, null);
        }
        /** 사진 없는 외침 (테스트·옛 호출) */
        public Post(String id, String cat, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt) {
            this(id, cat, text, authorId, createdAt, cheers, reports, hidden, reviewedAt, List.of());
        }
        public boolean inCircle() { return communityId != null; }
        /** 같은 글, 작성자만 바꿔서 (소로우 사연의 작성자 가리기) */
        public Post withAuthor(String author, List<Report> reports) {
            return new Post(id, cat, text, author, createdAt, cheers, reports, hidden, reviewedAt, images, communityId, postNo, circle, circleSlug, acceptedCommentId, light);
        }
        /** 같은 글, 받은 별 합계만 채워서 */
        public Post withLight(int light) {
            return new Post(id, cat, text, authorId, createdAt, cheers, reports, hidden, reviewedAt, images, communityId, postNo, circle, circleSlug, acceptedCommentId, light);
        }
    }

    /** 댓글. parentId 가 있으면 그 댓글의 답글(대댓글, 한 단계) */
    public record Comment(String id, String postId, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt, String parentId) implements Item {
        /** 답글이 아닌 댓글 (테스트·시뮬레이션) */
        public Comment(String id, String postId, String text, String authorId, long createdAt, List<String> cheers, List<Report> reports, Boolean hidden, Long reviewedAt) {
            this(id, postId, text, authorId, createdAt, cheers, reports, hidden, reviewedAt, null);
        }
    }

    /**
     * 피드 콘텐츠 한 장. 영상(릴스)이면 video 에 MP4 주소, image 에 표지(옛 화면은 사진처럼 보여 준다).
     * ratio = 사진·영상의 가로/세로, overlays = 그 위에 얹은 글(좌표·크기는 화면 너비 기준 비율).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FeedPage(String image, String title, String text, String video, Double duration, Double ratio, Boolean muted, List<Overlay> overlays) {
        public FeedPage(String image, String title, String text) {
            this(image, title, text, null, null, null, null, null);
        }
    }

    /** 사진·영상 위에 얹은 글 하나. x·y 는 글 가운데의 위치(0~1), size 는 글자 크기(콘텐츠 너비 대비) */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Overlay(String text, double x, double y, double size, String color, String font, String align, String style) {}

    public record FeedPost(String id, String title, String text, int bg, String image, List<String> images, List<FeedPage> pages,
                           String authorId, long createdAt, List<String> cheers, List<Report> reports, List<String> saves, Boolean hidden, Long reviewedAt) implements Item {}

    public record Creator(String bio, List<String> followers, long since) {}

    /** 광장 글에 건넨 별 한 건. by 는 준 사람(떠난 계정이면 null), to 는 글쓴이 */
    public record Gift(String id, String by, String to, String postId, int amount, long at) {}

    /**
     * 주간 순위 한 줄. light = 그 주 불행광장 글이 받은 별(순위 기준), cheers = 힘내요(동률일 때).
     * share·payout 은 원화 모의 모금 때의 값이라 이제 늘 0 이다 (옛 화면·옛 집계 행이 읽는 자리만 남겼다).
     */
    public record RankRow(int rank, String userId, String nick, int cheers, int posts, String topPostId, String topPostText, double share, long payout, int light) {
        public RankRow(int rank, String userId, String nick, int cheers, int posts, String topPostId, String topPostText, double share, long payout) {
            this(rank, userId, nick, cheers, posts, topPostId, topPostText, share, payout, 0);
        }
    }

    /** 원화 모의 모금의 자리. 옛 화면이 깨지지 않게 늘 0 으로 내려간다 */
    public record Fund(long total, int count, int donors) {}

    /** 그 주 불행광장 글이 받은 별: 합계, 건수, 준 사람 수 */
    public record Light(long total, int count, int givers) {}

    public record WeeklyBatch(String week, long computedAt, boolean finalized, List<RankRow> rows, Fund fund, Light light) {
        public WeeklyBatch(String week, long computedAt, boolean finalized, List<RankRow> rows, Fund fund) {
            this(week, computedAt, finalized, rows, fund, new Light(0, 0, 0));
        }
    }

    /**
     * 전체 상태. 목록·맵은 변경 가능한 구현을 넣어 서버가 집계·자동 답글을 덧붙일 수 있게 한다.
     * gifts 는 집계할 때는 전부, 화면에 내려갈 때는 볼 수 있는 광장 글의 최근 것만 담는다.
     */
    public record Store(User me, List<User> users, List<Post> posts, List<Comment> comments, List<FeedPost> feed,
                        Map<String, Creator> creators, List<String> following, List<Gift> gifts, Map<String, WeeklyBatch> weekly) {}

    public record Target(String kind, String id) {}
}
