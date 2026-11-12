-- 모루 방 꾸미기: 방문포인트로 산 가구와, 공간마다 정해진 자리에 놓은 가구. 추가 전용
CREATE TABLE pet_furniture (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item VARCHAR(24) NOT NULL,
    bought_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item)
);
-- 한 공간의 한 자리에는 가구 하나, 같은 가구는 한 공간에 한 자리에만
CREATE TABLE pet_decor (
    user_id VARCHAR(36) NOT NULL,
    home_id SMALLINT NOT NULL,
    slot VARCHAR(12) NOT NULL,
    item VARCHAR(24) NOT NULL,
    PRIMARY KEY (user_id, home_id, slot),
    UNIQUE (user_id, home_id, item),
    FOREIGN KEY (user_id, item) REFERENCES pet_furniture(user_id, item) ON DELETE CASCADE
);
