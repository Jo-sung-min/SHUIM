package kr.co.shuim.community;

import kr.co.shuim.common.Dates;
import kr.co.shuim.community.Model.*;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 불행 랭킹은 그 주 불행광장 글이 받은 빛으로 정한다. 돈 분배는 없다. */
class WeeklyLightRankingTest {
    private static final long NOW = System.currentTimeMillis() - 60_000;
    private static final String WEEK = Dates.weekKeyOf(NOW);

    private static Post post(String id, String cat, String author, long at, int cheers, String circle) {
        List<String> voters = new ArrayList<>();
        for (int i = 0; i < cheers; i++) voters.add("voter-" + i);
        return new Post(id, cat, "text " + id, author, at, voters, List.of(), false, null, List.of(), circle, circle == null ? null : 1, null, null);
    }

    private static Store store(List<Post> posts, List<Gift> gifts) {
        Map<String, Integer> light = CommunityLogic.lightByPost(gifts);
        return new Store(new User("me", "me", "user", null, null), List.of(), posts.stream().map(p -> p.withLight(light.getOrDefault(p.id(), 0))).toList(),
            List.of(), List.of(), Map.of(), List.of(), gifts, Map.of());
    }

    @Test
    void ranksByReceivedLightThenCheersThenEarliestPost() {
        var posts = List.of(
            post("cheered", "misfortune", "many-cheers", NOW, 9, null),
            post("lit-late", "misfortune", "lit-late", NOW, 1, null),
            post("lit-early", "misfortune", "lit-early", NOW - 1_000, 1, null),
            post("lit-a", "misfortune", "two-posts", NOW, 0, null),
            post("lit-b", "misfortune", "two-posts", NOW, 4, null));
        var gifts = List.of(
            new Gift("g1", "x", "lit-late", "lit-late", 3, NOW), new Gift("g2", "y", "lit-early", "lit-early", 3, NOW),
            new Gift("g3", "x", "two-posts", "lit-a", 2, NOW), new Gift("g4", "y", "two-posts", "lit-b", 5, NOW),
            new Gift("g5", null, "two-posts", "lit-b", 1, NOW));
        WeeklyBatch batch = CommunityLogic.computeWeekly(store(posts, gifts), WEEK, false);

        assertEquals(List.of("two-posts", "lit-early", "lit-late", "many-cheers"), batch.rows().stream().map(RankRow::userId).toList());
        assertEquals(List.of(8, 3, 3, 0), batch.rows().stream().map(RankRow::light).toList());
        assertEquals(List.of(1, 2, 3, 4), batch.rows().stream().map(RankRow::rank).toList());
        RankRow first = batch.rows().get(0);
        assertEquals("lit-b", first.topPostId()); // 빛을 가장 많이 받은 글이 대표 글
        assertEquals(4, first.cheers());
        assertEquals(2, first.posts());
        // 준 순간 글쓴이에게 갔으니 순위대로 나눌 돈은 없다
        assertTrue(batch.rows().stream().allMatch(r -> r.payout() == 0 && r.share() == 0));
        assertEquals(new Fund(0, 0, 0), batch.fund());
        assertEquals(new Light(14, 5, 2), batch.light()); // 떠난 계정이 준 빛은 합계에 남고 준 사람 수에서는 빠진다
    }

    @Test
    void lightOnOtherBoardsCirclesHiddenPostsAndOtherWeeksIsNotCounted() {
        long lastWeek = NOW - 8L * 24 * 60 * 60 * 1000;
        var hidden = new Post("hidden", "misfortune", "hidden", "hidden-author", NOW, List.of(), List.of(), true, null);
        var posts = List.of(
            post("ranked", "misfortune", "author", NOW, 0, null), post("free", "free", "author", NOW, 0, null),
            post("circle", "misfortune", "sender", NOW, 0, "c1"), post("old", "misfortune", "old-author", lastWeek, 0, null), hidden);
        var gifts = List.of(
            new Gift("g1", "x", "author", "ranked", 1, NOW), new Gift("g2", "x", "author", "free", 10, NOW),
            new Gift("g3", "x", "sender", "circle", 10, NOW), new Gift("g4", "x", "old-author", "old", 10, NOW),
            new Gift("g5", "x", "hidden-author", "hidden", 10, NOW), new Gift("g6", "x", "author", null, 10, NOW));
        WeeklyBatch batch = CommunityLogic.computeWeekly(store(posts, gifts), WEEK, false);
        assertEquals(List.of("author"), batch.rows().stream().map(RankRow::userId).toList());
        assertEquals(1, batch.rows().get(0).light());
        assertEquals(new Light(1, 1, 1), batch.light());
        // 지난 주 글에 이번 주에 준 빛은 지난 주 글의 것이다
        assertEquals(new Light(10, 1, 1), CommunityLogic.computeWeekly(store(posts, gifts), Dates.weekKeyOf(lastWeek), true).light());
    }

    @Test
    void anUnlitWeekKeepsTheOldCheerOrderSoTheSwitchChangesNoRanks() {
        var posts = List.of(post("a", "misfortune", "few", NOW, 1, null), post("b", "misfortune", "many", NOW, 6, null));
        WeeklyBatch batch = CommunityLogic.computeWeekly(store(posts, List.of()), WEEK, false);
        assertEquals(List.of("many", "few"), batch.rows().stream().map(RankRow::userId).toList());
        assertEquals(new Light(0, 0, 0), batch.light());
    }

    @Test
    void onlyWeeksWithPlazaMisfortunePostsAreComputed() {
        var todo = CommunityLogic.weeksNeedingCompute(store(List.of(post("circle", "misfortune", "sender", NOW - 30L * 24 * 60 * 60 * 1000, 0, "c1")), List.of()));
        assertEquals(List.of(new CommunityLogic.WeekTodo(Dates.currentWeekKey(), false)), todo);
    }
}
