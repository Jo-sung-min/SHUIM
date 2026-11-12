package kr.co.shuim.pet;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 모루의 하루 (순수 규칙): 오늘의 하늘(날씨·풍경, 드문 날씨)과 오늘의 돌봄(할 일 셋).
 * 오늘의 하늘은 화면의 `frontend/lib/moru-rules.ts` dailySky 와 같은 계산이다 (FNV-1a, 같은 글자 → 같은 수).
 * 그래서 옛 서버를 만난 화면도 같은 날씨를 그리고, 새 서버는 그 위에 드문 날씨와 도감을 얹는다.
 */
public final class PetDays {
    private PetDays() {}

    /** 글자에서 0~1 사이 수 (FNV-1a 32비트). 화면의 unitHash 와 같은 값 */
    public static double unitHash(String text) {
        int h = 0x811c9dc5;
        for (int i = 0; i < text.length(); i++) { h ^= text.charAt(i); h *= 16777619; }
        return (h & 0xffffffffL) / 4294967296.0;
    }

    /** 창밖: 풍경 city|forest, 날씨 rain|clear|snow, 밤인지, 드문 날씨(없으면 null) */
    public record Sky(String land, String weather, boolean night, String rare) {}

    /** 밤: 19시부터 다음 날 7시 전까지 (화면의 isNightOutside 와 같다) */
    public static boolean night(int hour) { return hour >= 19 || hour < 7; }

    /**
     * 오늘의 하늘. 비 40% · 맑음 35% · 눈 25%, 눈 오는 날은 숲이 조금 잦다. 드문 날씨:
     * 맑은 낮의 무지개 · 맑은 밤의 별똥별 (각 6%), 눈 오는 숲의 밤 오로라 (12%), 처음 눈을 보는 날의 첫눈.
     */
    public static Sky sky(String who, LocalDate date, int hour, boolean neverSawSnow) {
        double w = unitHash(who + "|" + date + "|weather"), l = unitHash(who + "|" + date + "|land");
        String weather = w < 0.4 ? "rain" : w < 0.75 ? "clear" : "snow";
        String land = l < (weather.equals("snow") ? 0.55 : 0.35) ? "forest" : "city";
        boolean night = night(hour);
        String rare = null;
        if (weather.equals("clear") && !night && unitHash(who + "|" + date + "|rainbow") < 0.06) rare = "rainbow";
        else if (weather.equals("clear") && night && unitHash(who + "|" + date + "|star") < 0.06) rare = "shootingStar";
        else if (weather.equals("snow") && neverSawSnow) rare = "firstSnow";
        else if (weather.equals("snow") && land.equals("forest") && night && unitHash(who + "|" + date + "|aurora") < 0.12) rare = "aurora";
        return new Sky(land, weather, night, rare);
    }

    /** 날씨 도감: 흔한 날씨 여섯(날씨-풍경)과 드문 날씨 넷. 처음 본 칸마다 방문포인트 +5 */
    public static final List<String> WEATHERS = List.of(
        "rain-city", "rain-forest", "clear-city", "clear-forest", "snow-city", "snow-forest",
        "rainbow", "shootingStar", "aurora", "firstSnow");
    public static final int WEATHER_POINTS = 5;
    /** 지금 하늘로 도감에 들어갈 칸들 */
    public static List<String> entries(Sky s) {
        var out = new ArrayList<String>();
        out.add(s.weather() + "-" + s.land());
        if (s.rare() != null) out.add(s.rare());
        return out;
    }

    /* ---------- 오늘의 돌봄: 날마다 할 일 셋. 다 하면 하루 한 번 방문포인트 +10, 성장 +4. 놓쳐도 잃는 것은 없다 ---------- */

    public static final int TASK_POINTS = 10, TASK_XP = 4;
    /** 할 수 있는 일: 마음 기록은 늘 하나, 나머지 둘은 그날 할 수 있는 것 중에서 고른다 */
    public static final List<String> CHORES = List.of("hug", "tickle", "talk", "dust", "bath", "snack");
    /** 돌봄 동작 → 할 일 (숨쉬기는 할 일이 아니다) */
    public static final Set<String> MARKABLE = Set.of("hug", "tickle", "talk", "dust", "bath", "snack", "record");

    /**
     * 오늘의 할 일 셋: 첫째는 늘 마음 기록, 둘은 계정·날짜로 고른다 (하루 동안 같다).
     * 먼지가 없는 날은 먼지 치우기를, 마음밥이 없는 날은 간식을 고르지 않는다.
     */
    public static List<String> pick(String who, LocalDate date, boolean dusty, boolean hasFood) {
        var pool = new ArrayList<String>();
        for (var chore : CHORES) {
            if (chore.equals("dust") && !dusty) continue;
            if (chore.equals("snack") && !hasFood) continue;
            pool.add(chore);
        }
        var out = new ArrayList<String>(List.of("record"));
        for (int k = 0; k < 2 && !pool.isEmpty(); k++) {
            int i = (int) Math.floor(unitHash(who + "|" + date + "|task" + k) * pool.size());
            out.add(pool.remove(Math.min(i, pool.size() - 1)));
        }
        return out;
    }
    /** 할 일 목록에서 이 일의 칸 (없으면 0) */
    public static int bit(List<String> tasks, String task) {
        int i = tasks.indexOf(task);
        return i < 0 ? 0 : 1 << i;
    }
    public static boolean complete(List<String> tasks, int done) {
        int all = (1 << tasks.size()) - 1;
        return !tasks.isEmpty() && (done & all) == all;
    }
}
