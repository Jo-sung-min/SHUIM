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
