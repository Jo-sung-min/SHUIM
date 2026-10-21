package kr.co.shuim.common;

import java.security.SecureRandom;

/** 예전 TS 의 uid() 와 같은 모양: 시간(36진수) + 랜덤 5자 */
public final class Ids {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

    private Ids() {}

    public static String uid() {
        StringBuilder sb = new StringBuilder(Long.toString(System.currentTimeMillis(), 36));
        for (int i = 0; i < 5; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return sb.toString();
    }

    public static String randomHex(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return java.util.HexFormat.of().formatHex(b);
    }
}
