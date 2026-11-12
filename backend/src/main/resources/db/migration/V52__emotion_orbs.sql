-- 감정구슬(맵에 머물다 하루에 하나 줍는 그날의 마음)과 맵 앨범. 추가 전용 (docs/EMOTION_ORBS.md)
CREATE TABLE emotion_orbs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 한국 날짜. 내려놓은(removed_at) 구슬도 그날의 자리를 차지한다: 하루에 하나
    day DATE NOT NULL,
    found_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mood SMALLINT NOT NULL CHECK (mood BETWEEN 1 AND 5),
    map_id VARCHAR(16) NOT NULL,
    -- 'public' 또는 소로우 id. 소로우가 없어져도 구슬은 남으므로 참조를 걸지 않고 그때의 이름을 함께 적는다
    space_id VARCHAR(36) NOT NULL,
    space_name VARCHAR(80) NOT NULL,
    spot_id VARCHAR(40),
    spot_name VARCHAR(40) NOT NULL DEFAULT '',
    -- 그 순간 함께 있던 사람 수. 탈퇴한 사람은 아래 표에서 지워지고 이 수만 남는다
    companion_count SMALLINT NOT NULL DEFAULT 0 CHECK (companion_count >= 0),
    removed_at TIMESTAMPTZ,
    UNIQUE (user_id, day)
);

CREATE TABLE emotion_orb_companions (
    orb_id BIGINT NOT NULL REFERENCES emotion_orbs(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 그 순간의 닉네임 그대로
    nick VARCHAR(60) NOT NULL,
    PRIMARY KEY (orb_id, user_id)
);
CREATE INDEX emotion_orb_companions_user ON emotion_orb_companions (user_id);

CREATE TABLE map_photos (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_key VARCHAR(1024) NOT NULL,
    url VARCHAR(1200) NOT NULL,
    map_id VARCHAR(16) NOT NULL,
    space_name VARCHAR(80) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, object_key)
);
CREATE INDEX map_photos_album ON map_photos (user_id, id DESC);
