-- 후원 기업 꾸미기 액자 + 꾸미기 링크. 추가 전용(기본값 있는 열)이라 옛 백엔드도 그대로 돈다.
-- 액자·색·장식의 허용 목록은 SponsorPolicy 가 갖는다. 모르는 값은 읽을 때 기본값으로 본다(목록을 늘려도 마이그레이션이 필요 없다).
ALTER TABLE sponsors
    ADD COLUMN frame_style VARCHAR(16) NOT NULL DEFAULT 'glass',
    ADD COLUMN frame_color VARCHAR(16) NOT NULL DEFAULT 'violet',
    ADD COLUMN frame_deco  VARCHAR(16) NOT NULL DEFAULT 'none',
    -- 꾸미기 링크의 키는 원문을 두지 않고 SHA-256(hex) 만 둔다. 다시 발급하면 옛 링크는 열리지 않는다.
    ADD COLUMN studio_key_hash VARCHAR(64),
    ADD COLUMN studio_key_at   BIGINT;
CREATE UNIQUE INDEX sponsors_studio_key_idx ON sponsors (studio_key_hash) WHERE studio_key_hash IS NOT NULL;
