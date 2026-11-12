-- 모루 꾸미기 2: 정해진 자리 다섯 대신 방 안 원하는 곳에 끌어다 놓는다.
-- 위치는 공간 그림(480×700 무대) 위 가구 그림의 가운데. 이미 놓아 둔 가구는 V47 자리의 가운데로 옮겨 적는다
-- (공간 그림 갈래: 0 기차 침대칸, 1 다락방, 나머지 창가 침대방 — 화면 MoruDecor 의 옛 자리와 같은 값)
ALTER TABLE pet_decor ADD COLUMN x SMALLINT, ADD COLUMN y SMALLINT;
UPDATE pet_decor SET
  x = CASE WHEN home_id = 0 THEN CASE slot WHEN 'wallL' THEN 100 WHEN 'wallR' THEN 381 WHEN 'hang' THEN 380 WHEN 'bedL' THEN 136 ELSE 376 END
           WHEN home_id = 1 THEN CASE slot WHEN 'wallL' THEN 108 WHEN 'wallR' THEN 372 WHEN 'hang' THEN 240 WHEN 'bedL' THEN 112 ELSE 381 END
           ELSE CASE slot WHEN 'wallL' THEN 113 WHEN 'wallR' THEN 113 WHEN 'hang' THEN 300 WHEN 'bedL' THEN 110 ELSE 372 END END,
  y = CASE WHEN home_id = 0 THEN CASE slot WHEN 'wallL' THEN 300 WHEN 'wallR' THEN 300 WHEN 'hang' THEN 405 WHEN 'bedL' THEN 493 ELSE 492 END
           WHEN home_id = 1 THEN CASE slot WHEN 'wallL' THEN 366 WHEN 'wallR' THEN 372 WHEN 'hang' THEN 259 WHEN 'bedL' THEN 502 ELSE 429 END
           ELSE CASE slot WHEN 'wallL' THEN 283 WHEN 'wallR' THEN 356 WHEN 'hang' THEN 260 WHEN 'bedL' THEN 510 ELSE 447 END END;
ALTER TABLE pet_decor ALTER COLUMN x SET NOT NULL, ALTER COLUMN y SET NOT NULL;
ALTER TABLE pet_decor DROP CONSTRAINT pet_decor_pkey;
ALTER TABLE pet_decor DROP CONSTRAINT pet_decor_user_id_home_id_item_key;
ALTER TABLE pet_decor DROP COLUMN slot;
ALTER TABLE pet_decor ADD PRIMARY KEY (user_id, home_id, item);
ALTER TABLE pet_decor ADD CONSTRAINT pet_decor_on_stage CHECK (x BETWEEN 0 AND 480 AND y BETWEEN 0 AND 700);
