package kr.co.shuim.pet;

import java.util.List;
import kr.co.shuim.config.ApiException;

public final class PetHomes {
    private PetHomes() {}
    public record Home(int id, String name, int level, int cost, boolean available) {}
    public static final List<Home> ALL = List.of(
        new Home(0, "기차 침대칸", 1, 0, true), new Home(1, "다락방", 3, 60, true),
        new Home(2, "창가 침대방", 5, 150, true), new Home(3, "옥탑방", 8, 270, false),
        new Home(4, "반지하", 12, 450, false), new Home(5, "일반집", 18, 750, false),
        new Home(6, "가정집", 25, 1200, false), new Home(7, "저택", 35, 1800, false),
        new Home(8, "대저택", 50, 2700, false));
    public static Home check(int id, int level, int points, List<Integer> owned) {
        if (id < 0 || id >= ALL.size()) throw ApiException.badRequest("공간을 확인해 주세요.");
        var home = ALL.get(id);
        if (!home.available()) throw ApiException.badRequest("아직 준비 중인 공간이에요.");
        if (id == 0 || owned.contains(id)) return home;
        if (id > 1 && !owned.contains(id - 1)) throw ApiException.badRequest("이전 공간부터 만나 주세요.");
        if (level < home.level()) throw ApiException.badRequest("아직 레벨이 부족해요.");
        if (points < home.cost()) throw ApiException.badRequest("방문포인트가 부족해요.");
        return home;
    }
}
