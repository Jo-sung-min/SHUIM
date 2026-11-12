-- 모루 돌봄 상태 (docs/MORU_TAMAGOTCHI.md 2단계). 추가 전용: 예전 서버는 새 열을 무시한다.
-- 온기·말끔함·기운은 0~4 칸. 낮아도 잃는 것은 없고, 날짜가 바뀔 때 care_date 를 기준으로 한 번만 정산한다.
ALTER TABLE user_pets ADD COLUMN warmth SMALLINT NOT NULL DEFAULT 2 CHECK (warmth BETWEEN 0 AND 4);
ALTER TABLE user_pets ADD COLUMN clean SMALLINT NOT NULL DEFAULT 3 CHECK (clean BETWEEN 0 AND 4);
ALTER TABLE user_pets ADD COLUMN energy SMALLINT NOT NULL DEFAULT 3 CHECK (energy BETWEEN 0 AND 4);
-- 오늘 손길·말 걸기·간식으로 오른 온기 (하루 3칸까지)
ALTER TABLE user_pets ADD COLUMN warmth_today SMALLINT NOT NULL DEFAULT 0 CHECK (warmth_today BETWEEN 0 AND 3);
-- 마지막으로 하루 정산을 한 날 (NULL 이면 아직 한 번도 안 함: 첫 방문에는 깎지 않는다)
ALTER TABLE user_pets ADD COLUMN care_date DATE;
ALTER TABLE user_pets ADD COLUMN bath_date DATE;
-- 그 밤(22시~다음 날 7시, 열쇠는 시작한 날짜)에 사용자가 고른 불 상태
ALTER TABLE user_pets ADD COLUMN lights_night DATE;
ALTER TABLE user_pets ADD COLUMN lights_off BOOLEAN NOT NULL DEFAULT FALSE;
