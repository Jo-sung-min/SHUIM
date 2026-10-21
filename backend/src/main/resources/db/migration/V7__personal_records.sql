-- 개인 기록(기록·메모·목표·일정)을 로그인 계정 기준으로 서버에 저장한다.
-- 사용자 카테고리 id('c_' + 36진수)가 cat 에 들어가므로 길이를 넓히고, 사용자 카테고리·계정별 설정 테이블을 더한다.

ALTER TABLE journal_entries ALTER COLUMN cat TYPE VARCHAR(40);
ALTER TABLE memos           ALTER COLUMN cat TYPE VARCHAR(40);
ALTER TABLE goals           ALTER COLUMN cat TYPE VARCHAR(40);
ALTER TABLE schedule_items  ALTER COLUMN cat TYPE VARCHAR(40);

-- 사용자가 추가한 기록 카테고리 (frontend/lib/categories.ts 의 Category, 최대 5개)
CREATE TABLE user_categories (
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         VARCHAR(40) NOT NULL,                       -- c_…
    label      VARCHAR(12) NOT NULL,
    emoji      VARCHAR(16) NOT NULL DEFAULT '📌',
    hint       VARCHAR(40) NOT NULL DEFAULT '',
    color      VARCHAR(40) NOT NULL DEFAULT 'var(--c-etc)', -- CSS 변수 이름
    sort_order INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
);

-- 계정별 작은 설정. value 는 JSON 문자열 (category_order: 기록 카드 순서 id 배열)
CREATE TABLE user_settings (
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key        VARCHAR(40) NOT NULL,
    value      TEXT        NOT NULL,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, key)
);

CREATE INDEX goals_user_idx ON goals(user_id);
CREATE INDEX goal_steps_goal_idx ON goal_steps(goal_id, position);
