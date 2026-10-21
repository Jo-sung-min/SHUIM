package kr.co.shuim.ai;

import java.util.List;

/** 기록 카테고리 (frontend/lib/categories.ts 와 같은 값). 사용자가 추가한 카테고리는 요청 본문으로 함께 온다 */
public final class Categories {
    private Categories() {}

    public record Category(String id, String label, String emoji, String hint, String color) {}

    public static final List<Category> DEFAULT = List.of(
        new Category("mind", "마음", "🫧", "오늘 든 생각, 감정…", "var(--c-mind)"),
        new Category("body", "몸", "🌙", "잠, 떨림, 식사, 운동…", "var(--c-body)"),
        new Category("relation", "관계", "🤝", "연인, 가족, 친구…", "var(--c-relation)"),
        new Category("money", "돈", "💰", "자산, 지출, 주식, 전세…", "var(--c-money)"),
        new Category("work", "일·커리어", "💼", "회사, 이직, 사이드 프로젝트…", "var(--c-work)")
    );

    /** 요청에 카테고리 목록이 있으면 그것(기본 + 사용자 추가), 없으면 기본 5개 */
    public static List<Category> of(List<Category> fromBody) {
        if (fromBody == null || fromBody.isEmpty()) return DEFAULT;
        return fromBody.stream().filter(c -> c != null && c.id() != null && !c.id().isBlank())
            .map(c -> new Category(c.id(), c.label() == null ? c.id() : c.label(), c.emoji() == null ? "📌" : c.emoji(), c.hint() == null ? "" : c.hint(), c.color() == null ? "" : c.color()))
            .toList();
    }

    public static Category byId(String id, List<Category> extra) {
        for (Category c : DEFAULT) if (c.id().equals(id)) return c;
        if (extra != null) for (Category c : extra) if (c != null && id.equals(c.id())) return c;
        return new Category(id, id, "📌", "", "var(--c-etc)");
    }

    /** 메모·목표·일정 카테고리 라벨 (기록 카테고리 + 기타) */
    public static String memoLabel(String id, List<Category> extra) {
        if (id == null || "etc".equals(id)) return "기타";
        Category c = byId(id, extra);
        return c.label();
    }
}
