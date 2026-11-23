ALTER TABLE user_pets DROP CONSTRAINT user_pets_appearance_check;
ALTER TABLE user_pets ADD CONSTRAINT user_pets_appearance_check
    CHECK (appearance IN ('moru', 'noa', 'leo', 'lumi', 'moring', 'bamu', 'mongul', 'kkomi'));

-- A point is a remembered interaction, independent of hunger, XP and days away.
CREATE TABLE pet_kkomi_affinity (
    user_id TEXT NOT NULL REFERENCES user_pets(user_id) ON DELETE CASCADE,
    day DATE NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('touch', 'hug', 'tickle', 'talk', 'snack', 'bath', 'breath', 'praise', 'love')),
    PRIMARY KEY (user_id, day, action)
);
