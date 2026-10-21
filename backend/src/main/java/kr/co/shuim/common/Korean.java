package kr.co.shuim.common;

/** 받침 유무에 따라 조사 선택: josa("막막함", "이라고", "라고") → "막막함이라고" */
public final class Korean {
    private Korean() {}

    public static String josa(String word, String withBatchim, String without) {
        String w = word.strip().replaceAll("[\"'”’)\\]]+$", "");
        if (w.isEmpty()) return word + without;
        char ch = w.charAt(w.length() - 1);
        boolean has;
        if (ch >= 0xAC00 && ch <= 0xD7A3) has = (ch - 0xAC00) % 28 != 0;
        else if (Character.isDigit(ch)) has = "013678".indexOf(ch) >= 0;
        else has = false;
        return word + (has ? withBatchim : without);
    }

    public static String cut(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }
}
