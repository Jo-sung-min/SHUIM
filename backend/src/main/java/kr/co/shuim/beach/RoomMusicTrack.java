package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import java.io.IOException;
import java.util.Properties;

/** Only these versioned private S3 objects may be selected or streamed. */
enum RoomMusicTrack {
    MORNING("morning-v1", "아침만남겨주고", 163_029),
    TOMORROW("tomorrow-v1", "내일의우리", 256_448);

    final String id;
    final String title;
    final int durationMs;
    final String objectKey;
    final int bytes;
    final String sha256;

    RoomMusicTrack(String id, String title, int durationMs) {
        this.id = id;
        this.title = title;
        this.durationMs = durationMs;
        this.objectKey = "private/room-music/" + id + ".m4a";
        String[] entry = Inventory.tracks.getProperty(id, "").split(",");
        if (entry.length != 2 || !entry[1].matches("[0-9a-f]{64}"))
            throw new IllegalStateException("Incomplete room music inventory for " + id);
        this.bytes = Integer.parseInt(entry[0]);
        this.sha256 = entry[1];
    }

    private static class Inventory {
        static final Properties tracks = new Properties();
        static {
            try (var in = RoomMusicTrack.class.getResourceAsStream("/room-music-inventory.properties")) {
                if (in == null) throw new IllegalStateException("Missing room music inventory");
                tracks.load(in);
            } catch (IOException e) {
                throw new ExceptionInInitializerError(e);
            }
        }
    }

    static RoomMusicTrack from(String id) {
        if (id == null) return MORNING;
        for (RoomMusicTrack track : values()) if (track.id.equals(id)) return track;
        throw ApiException.badRequest("목록에서 들을 음악을 골라 주세요.");
    }
}
