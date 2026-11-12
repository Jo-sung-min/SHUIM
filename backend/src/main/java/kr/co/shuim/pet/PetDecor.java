package kr.co.shuim.pet;

import java.util.List;
import java.util.Map;
import kr.co.shuim.config.ApiException;

/**
 * 모루 방 꾸미기: 방문포인트로 가구를 사서 공간마다 정해진 자리 다섯 곳에 놓는다.
 * 자리 이름과 종류는 모든 공간이 같고, 그림 속 위치는 화면이 공간마다 정한다. 산 가구는 어느 공간에나 놓을 수 있다.
 */
public final class PetDecor {
    private PetDecor() {}
    /** 가구 한 점. kind 는 놓을 수 있는 자리의 종류: wall 벽, hang 매달기, soft 이불 위, side 곁에 두기 */
    public record Item(String id, String kind, int cost) {}
    public static final List<Item> ITEMS = List.of(
        new Item("frame", "wall", 30), new Item("clock", "wall", 40), new Item("wreath", "wall", 50),
        new Item("ivy", "hang", 35), new Item("mobile", "hang", 45), new Item("lantern", "hang", 55),
        new Item("heart", "soft", 25), new Item("bear", "soft", 45), new Item("yarn", "soft", 35),
        new Item("monstera", "side", 40), new Item("mushroom", "side", 50), new Item("books", "side", 30));
    /** 자리 → 종류 */
    public static final Map<String, String> SLOTS = Map.of("wallL", "wall", "wallR", "wall", "hang", "hang", "bedL", "soft", "bedR", "side");

    public static String slotKind(String slot) {
        String kind = slot == null ? null : SLOTS.get(slot);
        if (kind == null) throw ApiException.badRequest("자리를 확인해 주세요.");
        return kind;
    }
    public static Item item(String id) {
        return ITEMS.stream().filter(i -> i.id().equals(id)).findFirst().orElseThrow(() -> ApiException.badRequest("가구를 확인해 주세요."));
    }
    /** 이 자리에 이 가구를 놓을 수 있는지 (종류가 맞아야 한다) */
    public static Item check(String slot, String id) {
        String kind = slotKind(slot);
        var item = item(id);
        if (!item.kind().equals(kind)) throw ApiException.badRequest("이 자리에는 놓을 수 없어요.");
        return item;
    }
}
