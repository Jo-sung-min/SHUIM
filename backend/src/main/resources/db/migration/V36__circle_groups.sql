-- 소로우 묶음 (2026-11-11 사용자 승인): 기본 7개 + 소로우를 여는 사람이 새로 만드는 묶음 (디시 마이너 갤러리처럼).
-- communities.kind 가 circle_groups.id 를 가리킨다. 기본 7개는 지금 쓰는 id(enjoy…) 그대로라 기존 소로우는 바뀌지 않는다.
-- 외래 키는 걸지 않는다: 예전 kind 값이 남은 행이 있어도 이 마이그레이션이 실패하지 않게 (서버가 만들 때 확인한다).
CREATE TABLE circle_groups (
    id          VARCHAR(12)  PRIMARY KEY,                    -- 기본 묶음은 enjoy…, 새 묶음은 'g-' + 8자
    label       VARCHAR(12)  NOT NULL,                       -- 화면 이름 (2~10자)
    label_key   VARCHAR(24)  NOT NULL UNIQUE,                -- 같은 이름 막기 (공백·가운뎃점 없앰, 소문자)
    hint        VARCHAR(80)  NOT NULL DEFAULT '',
    builtin     BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order  INTEGER      NOT NULL DEFAULT 100,
    created_by  VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO circle_groups (id, label, label_key, hint, builtin, sort_order) VALUES
  ('enjoy', '즐기는 중',   '즐기는중',   '미식, 여행, 운동, 덕질, 책, 게임',            TRUE, 1),
  ('live',  '살아가는 중', '살아가는중', '자취, 출퇴근, 반려생활, 새벽',                TRUE, 2),
  ('love',  '사랑·혼자',   '사랑혼자',   '싱글, 모솔, 이별, 이혼, 돌싱, 외로움',        TRUE, 3),
  ('work',  '일하는 중',   '일하는중',   '회사원, 자영업, 프리랜서, 현장·교대, 공무원', TRUE, 4),
  ('study', '준비하는 중', '준비하는중', '대학생, 수험생, 취준생',                      TRUE, 5),
  ('rest',  '쉬는 중',     '쉬는중',     '일을 쉬거나 멈춘 사람들',                     TRUE, 6),
  ('care',  '돌보는 중',   '돌보는중',   '육아, 가족 돌봄',                             TRUE, 7)
ON CONFLICT (id) DO NOTHING;

-- 묶음별 둘러보기
CREATE INDEX IF NOT EXISTS communities_kind_idx ON communities (kind);

-- 소로우 아이콘에 Microsoft Fluent UI System Icons 이름("fl:weather_partly_cloudy_day")도 담는다. varchar 넓히기는 테이블을 다시 쓰지 않는다
ALTER TABLE communities ALTER COLUMN icon TYPE VARCHAR(48);
