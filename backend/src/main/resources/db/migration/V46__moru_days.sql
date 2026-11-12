-- 모루의 하루: 오늘의 돌봄(날마다 할 일 셋)과 날씨 도감. 추가 전용
CREATE TABLE pet_day_tasks (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    tasks VARCHAR(80) NOT NULL,
    done SMALLINT NOT NULL DEFAULT 0 CHECK (done BETWEEN 0 AND 7),
    rewarded BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, day)
);
CREATE TABLE pet_weather_seen (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weather VARCHAR(20) NOT NULL,
    first_day DATE NOT NULL,
    PRIMARY KEY (user_id, weather)
);
