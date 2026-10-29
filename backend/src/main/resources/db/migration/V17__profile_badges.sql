-- 마이페이지 P0: 위로 배지(획득 기록)와 대표 칭호, 리스너(팔로워)·리스닝(팔로잉) 목록용 인덱스.
-- 배지 정의(이름·조건)는 코드(profile/Badges.java)에 있고, 여기에는 누가 언제 얻었는지만 남긴다.
-- 배지는 이름만 보여 주고, 위로한 횟수 같은 숫자는 어디에도 공개하지 않는다.

CREATE TABLE user_badges (
    user_id   VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id  VARCHAR(32) NOT NULL,
    earned_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    seen_at   TIMESTAMP,                                   -- 축하 시트를 본 시각 (NULL = 아직 안 봄)
    PRIMARY KEY (user_id, badge_id)
);

-- 대표 칭호: 얻은 배지 하나를 닉네임 옆에 붙인다
ALTER TABLE profiles ADD COLUMN title_badge VARCHAR(32);

CREATE INDEX IF NOT EXISTS follows_creator_created_idx ON follows(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_follower_created_idx ON follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_author_created_idx ON comments(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cheers_user_idx ON cheers(user_id);
