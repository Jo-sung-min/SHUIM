package kr.co.shuim.pet;

import java.util.List;
import kr.co.shuim.config.ApiException;

/**
 * 모루 방 꾸미기: 방문포인트로 가구를 사서 방 안 원하는 곳에 끌어다 놓는다 (V49).
 * 위치는 공간 그림(480×700 무대) 위 가구 그림의 가운데이고, 360px 폭 휴대폰에서도 보이는 상자 안으로 맞춘다.
 * 산 가구는 어느 공간에나 놓을 수 있고, 한 공간에는 같은 가구 하나, 모두 MAX_PER_HOME 개까지.
 */
public final class PetDecor {
    private PetDecor() {}
    /** 가구 한 점. kind 는 가구 상자의 칸: wall 벽, hang 매달기, soft 인형·쿠션, plant 식물, light 빛, small 작은 것, floor 바닥 */
    public record Item(String id, String kind, int cost) {}
    public static final List<Item> ITEMS = List.of(
        new Item("frame", "wall", 30), new Item("clock", "wall", 40), new Item("wreath", "wall", 50),
        new Item("moonPoster", "wall", 30), new Item("calendar", "wall", 25), new Item("mirror", "wall", 40),
        new Item("ivy", "hang", 35), new Item("mobile", "hang", 45), new Item("lantern", "hang", 55), new Item("stringLights", "hang", 40),
        new Item("heart", "soft", 25), new Item("bear", "soft", 45), new Item("cat", "soft", 40), new Item("bunny", "soft", 40),
        new Item("duck", "soft", 30), new Item("snowman", "soft", 45),
        new Item("monstera", "plant", 40), new Item("cactus", "plant", 25), new Item("succulent", "plant", 25),
        new Item("tulips", "plant", 35), new Item("sunflower", "plant", 40),
        new Item("mushroom", "light", 50), new Item("starLamp", "light", 45), new Item("candles", "light", 30),
        new Item("books", "small", 30), new Item("yarn", "small", 35), new Item("radio", "small", 45), new Item("record", "small", 55),
        new Item("globe", "small", 45), new Item("hourglass", "small", 30), new Item("diary", "small", 25), new Item("cocoa", "small", 25),
        new Item("oranges", "small", 30),
        new Item("rug", "floor", 45), new Item("bookshelf", "floor", 55), new Item("beanbag", "floor", 50));
    /** 한 공간에 놓을 수 있는 가구 수 (방이 아늑하게 남고, 첫 화면에 실리는 그림도 이만큼으로 묶인다) */
    public static final int MAX_PER_HOME = 12;
    /** 가구 가운데가 들어갈 수 있는 상자: 360px 폭에서 방에 보이는 무대(가로 81~399, 세로 HUD 아래~패드 위) */
    public static final int X_MIN = 90, X_MAX = 390, Y_MIN = 225, Y_MAX = 575;

    public static Item item(String id) {
        return ITEMS.stream().filter(i -> i.id().equals(id)).findFirst().orElseThrow(() -> ApiException.badRequest("가구를 확인해 주세요."));
    }
    public static int clampX(int x) { return Math.max(X_MIN, Math.min(X_MAX, x)); }
    public static int clampY(int y) { return Math.max(Y_MIN, Math.min(Y_MAX, y)); }
}
