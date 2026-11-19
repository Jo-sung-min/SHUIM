ALTER TABLE user_pets DROP CONSTRAINT user_pets_appearance_check;
ALTER TABLE user_pets ADD CONSTRAINT user_pets_appearance_check
    CHECK (appearance IN ('moru', 'noa', 'leo', 'lumi', 'moring', 'bamu', 'mongul'));
