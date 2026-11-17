package kr.co.shuim.upload;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 업로드 주소(presign) 발급 한도. 발급 기록(uploaded_objects)을 24시간 단위로 세므로 서버를 다시 띄워도 이어진다.
 * 익명 세션은 더 낮게 둔다. 동시에 들어온 요청 몇 개가 한도를 살짝 넘길 수는 있다 (막으려는 건 대량 발급).
 */
@Component
public class UploadQuota {
    private final JdbcClient jdbc;
    private final int photosPerDay;
    private final int videosPerDay;
    private final int anonymousPhotosPerDay;
    private final int anonymousVideosPerDay;

    public UploadQuota(JdbcClient jdbc,
                       @Value("${app.upload.photos-per-day:150}") int photosPerDay,
                       @Value("${app.upload.videos-per-day:20}") int videosPerDay,
                       @Value("${app.upload.anonymous-photos-per-day:30}") int anonymousPhotosPerDay,
                       @Value("${app.upload.anonymous-videos-per-day:5}") int anonymousVideosPerDay) {
        this.jdbc = jdbc;
        this.photosPerDay = photosPerDay;
        this.videosPerDay = videosPerDay;
        this.anonymousPhotosPerDay = anonymousPhotosPerDay;
        this.anonymousVideosPerDay = anonymousVideosPerDay;
    }

    /** 한도를 넘었으면 429 */
    public void check(DbUser user, String contentType) {
        boolean video = contentType != null && contentType.startsWith("video/");
        int limit = user.anonymous() ? (video ? anonymousVideosPerDay : anonymousPhotosPerDay) : (video ? videosPerDay : photosPerDay);
        long used = jdbc.sql("SELECT count(*) FROM uploaded_objects WHERE user_id = ? AND created_at > CURRENT_TIMESTAMP - interval '1 day' "
                + "AND (object_key LIKE '%.mp4') = ?")
            .param(user.id()).param(video).query(Long.class).single();
        if (used >= limit) throw new ApiException(429, video
            ? "오늘은 영상을 더 올릴 수 없어요. 내일 다시 시도해 주세요."
            : "오늘은 사진을 더 올릴 수 없어요. 내일 다시 시도해 주세요.");
    }
}
