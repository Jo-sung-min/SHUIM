-- 누구나 들어오는 공용 공간('public')의 모닥불과 대나무숲 방명록을 소로우 공간과 같은 테이블에 둔다.
-- 공용 공간은 communities 에 행이 없으므로, 공간 id 를 소로우에 묶어 두던 외래 키를 푼다.
-- 소로우는 지우지 않고 closed_at 으로 닫기만 하므로 ON DELETE CASCADE 로 정리되던 행은 없다.
-- 제약 이름에 기대지 않고 communities 를 가리키는 외래 키를 찾아서 지운다 (없으면 아무 일도 하지 않는다).
DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT conrelid::regclass AS table_name, conname
          FROM pg_constraint
         WHERE contype = 'f'
           AND confrelid = 'communities'::regclass
           AND conrelid IN ('beach_fires'::regclass, 'beach_fire_wood_requests'::regclass, 'bamboo_guestbook'::regclass)
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
    END LOOP;
END $$;

-- 소로우 공간의 풍경은 멤버가 늘수록 열린다 (SpaceMaps). 한 번 열린 풍경은 멤버가 줄어도 닫히지 않게,
-- 소로우마다 지금까지 가장 많았던 활성 멤버 수를 남긴다. 지금 있는 소로우는 현재 멤버 수에서 시작한다.
ALTER TABLE communities ADD COLUMN space_member_peak INTEGER NOT NULL DEFAULT 0 CHECK (space_member_peak >= 0);
UPDATE communities c
   SET space_member_peak = (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active');
