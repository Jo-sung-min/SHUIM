package kr.co.shuim.beach;

import kr.co.shuim.upload.S3Service;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.EnumMap;
import java.util.Map;

@Service
class RoomMusicRecordings {
    private final Map<RoomMusicTrack, Resource> tracks = new EnumMap<>(RoomMusicTrack.class);

    RoomMusicRecordings(S3Service storage) {
        for (RoomMusicTrack track : RoomMusicTrack.values()) {
            // A byte-range request can seek in memory. Keep one verified copy per immutable
            // recording (under 7 MB total), fetched only after an authorized GET needs bytes.
            tracks.put(track, new AbstractResource() {
                private byte[] cached;
                @Override public String getDescription() { return track.id; }
                @Override public String getFilename() { return track.id + ".m4a"; }
                @Override public long contentLength() { return track.bytes; }
                @Override public synchronized InputStream getInputStream() {
                    if (cached == null) cached = storage.readPrivateRecording(track.objectKey, track.bytes, track.sha256);
                    return new ByteArrayInputStream(cached);
                }
            });
        }
    }

    Resource resource(RoomMusicTrack track) { return tracks.get(track); }
}
