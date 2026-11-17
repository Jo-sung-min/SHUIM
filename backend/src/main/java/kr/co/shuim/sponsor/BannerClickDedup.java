package kr.co.shuim.sponsor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 배너 클릭을 (배너, 세션 또는 IP, 날짜)마다 한 번만 센다. 서버가 한 대라 메모리로 충분하고, 재시작하면 그날 기록은 비워진다.
 * 누가 눌렀는지 남기지 않도록 해시만 들고, 날짜가 바뀌면 통째로 버린다. 크기 상한을 넘으면 그날은 더 세지 않는다.
 */
final class BannerClickDedup {
    static final int MAX_KEYS = 200_000;
    private final Set<String> seen = ConcurrentHashMap.newKeySet();
    private volatile LocalDate day;

    /** 이번 클릭을 셀지. 세션 키와 IP 키 중 하나라도 오늘 이 배너에 이미 셌으면 false */
    boolean first(String bannerId, LocalDate today, String sessionKey, String ipKey) {
        if (!today.equals(day)) {
            synchronized (this) {
                if (!today.equals(day)) { seen.clear(); day = today; }
            }
        }
        if (seen.size() >= MAX_KEYS) return false;
        String session = sessionKey == null ? null : hash(bannerId + "|s|" + sessionKey);
        String ip = ipKey == null ? null : hash(bannerId + "|i|" + ipKey);
        if (session == null && ip == null) return false;
        boolean freshSession = session == null || seen.add(session);
        boolean freshIp = ip == null || seen.add(ip);
        return freshSession && freshIp;
    }

    private static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
