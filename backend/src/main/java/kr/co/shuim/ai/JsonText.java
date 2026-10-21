package kr.co.shuim.ai;

/** 모델 응답에서 JSON 객체 하나를 최대한 관대하게 꺼낸다 (설명문·코드블록·앞뒤 잡음 허용, 잘린 꼬리는 복구 시도) */
public final class JsonText {
    private JsonText() {}

    public static String extract(String raw) {
        if (raw == null) return null;
        String cleaned = raw.replaceAll("(?i)```(?:json)?", "").strip();
        int start = cleaned.indexOf('{');
        if (start < 0) return null;
        int depth = 0;
        boolean inStr = false;
        boolean esc = false;
        for (int i = start; i < cleaned.length(); i++) {
            char ch = cleaned.charAt(i);
            if (inStr) {
                if (esc) esc = false;
                else if (ch == '\\') esc = true;
                else if (ch == '"') inStr = false;
                continue;
            }
            if (ch == '"') inStr = true;
            else if (ch == '{') depth++;
            else if (ch == '}') {
                depth--;
                if (depth == 0) return cleaned.substring(start, i + 1);
            }
        }
        // 잘린 경우: 열린 문자열·괄호를 닫아서 시도
        StringBuilder tail = new StringBuilder(cleaned.substring(start));
        if (inStr) tail.append('"');
        String t = tail.toString().replaceAll(",\\s*$", "");
        int opens = count(t, '[') - count(t, ']');
        StringBuilder sb = new StringBuilder(t);
        for (int i = 0; i < Math.max(0, opens); i++) sb.append(']');
        for (int i = 0; i < Math.max(0, depth); i++) sb.append('}');
        return sb.toString();
    }

    private static int count(String s, char c) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) == c) n++;
        return n;
    }
}
