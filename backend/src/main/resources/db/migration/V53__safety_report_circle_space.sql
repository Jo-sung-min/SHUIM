-- 안전 신고 종류 넓히기: 소로우 자체(circle)와 3D 공간 이용자 글(space: "guestbook:<id>" / "lantern:<id>")
-- kind 의 CHECK 제약은 이름이 자동으로 붙었으므로 kind 를 보는 CHECK 를 찾아 지우고 새로 건다
DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'safety_reports'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%'
    LOOP
        EXECUTE format('ALTER TABLE safety_reports DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;
ALTER TABLE safety_reports ADD CONSTRAINT safety_reports_kind_check CHECK (kind IN ('user', 'message', 'ai', 'circle', 'space'));
-- target_id 에 "guestbook:<숫자>" 같은 값이 들어가도록 80자로 늘린다 (기존 값은 그대로)
ALTER TABLE safety_reports ALTER COLUMN target_id TYPE VARCHAR(80);
