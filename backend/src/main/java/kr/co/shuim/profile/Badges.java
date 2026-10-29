package kr.co.shuim.profile;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 위로 배지 정의와 판정 (DB 없음, 순수 함수).
 * 화면에는 배지 이름과 한 줄 설명만 보이고, 조건에 쓰는 횟수는 어디에도 보이지 않는다.
 */
public final class Badges {
    private Badges() {}

    public record Badge(String id, String name, String desc) {}

    /** 판정 재료: 한 사람의 활동 집계 (숨김 처리된 글·댓글은 빼고 센다) */
    public record Counts(int comments, int cheersSent, int cheersOnMyComments, boolean nightComment,
                         int shoutPosts, int feedPosts, int listeners, boolean weeklyTop10) {}

    /** 선반에 놓이는 순서 그대로 */
    public static final List<Badge> ALL = List.of(
        new Badge("first_comfort", "첫 위로", "처음으로 위로 댓글을 남겼어요"),
        new Badge("comfort_steady", "꾸준한 위로", "위로 댓글이 차곡차곡 쌓이고 있어요"),
        new Badge("comfort_master", "위로 장인", "오래도록 누군가의 곁을 지켜 줬어요"),
        new Badge("cheer_first", "힘내요 첫걸음", "힘내요를 아끼지 않아요"),
        new Badge("cheer_rich", "힘내요 부자", "누구보다 힘내요를 많이 건넸어요"),
        new Badge("thanked", "고마운 사람", "내 위로가 누군가에게 닿았어요"),
        new Badge("thanked_much", "마음이 닿는 사람", "내 위로에 많은 마음이 돌아왔어요"),
        new Badge("night_owl", "새벽의 위로꾼", "모두 잠든 새벽에 위로를 건넸어요"),
        new Badge("first_shout", "용기 낸 외침", "처음으로 마음을 털어놓았어요"),
        new Badge("first_feed", "첫 위로글", "처음으로 위로글을 올렸어요"),
        new Badge("listened", "함께 듣는 사람들", "내 이야기를 들어 주는 리스너가 제법 모였어요"),
        new Badge("weekly_top10", "따뜻한 마음 Top 10", "주간 따뜻한 마음 랭킹 10위 안에 들었어요")
    );

    public static Optional<Badge> byId(String id) {
        return ALL.stream().filter(b -> b.id().equals(id)).findFirst();
    }

    /** 집계로 얻은 배지 id 들 (ALL 순서) */
    public static Set<String> earned(Counts c) {
        Set<String> out = new LinkedHashSet<>();
        if (c.comments() >= 1) out.add("first_comfort");
        if (c.comments() >= 10) out.add("comfort_steady");
        if (c.comments() >= 50) out.add("comfort_master");
        if (c.cheersSent() >= 10) out.add("cheer_first");
        if (c.cheersSent() >= 100) out.add("cheer_rich");
        if (c.cheersOnMyComments() >= 1) out.add("thanked");
        if (c.cheersOnMyComments() >= 10) out.add("thanked_much");
        if (c.nightComment()) out.add("night_owl");
        if (c.shoutPosts() >= 1) out.add("first_shout");
        if (c.feedPosts() >= 1) out.add("first_feed");
        if (c.listeners() >= 10) out.add("listened");
        if (c.weeklyTop10()) out.add("weekly_top10");
        Set<String> ordered = new LinkedHashSet<>();
        for (Badge b : ALL) if (out.contains(b.id())) ordered.add(b.id());
        return ordered;
    }
}
