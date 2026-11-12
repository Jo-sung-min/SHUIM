-- 모루의 새 친구 모링 (흰머리오목눈이를 본뜬 동그란 흰 새): 고를 수 있는 모습에 추가한다
ALTER TABLE user_pets DROP CONSTRAINT user_pets_appearance_check;
ALTER TABLE user_pets ADD CONSTRAINT user_pets_appearance_check
    CHECK (appearance IN ('moru', 'noa', 'leo', 'lumi', 'moring'));
