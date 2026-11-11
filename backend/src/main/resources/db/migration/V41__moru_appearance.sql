ALTER TABLE user_pets ADD COLUMN appearance VARCHAR(20) NOT NULL DEFAULT 'moru'
    CHECK (appearance IN ('moru', 'noa', 'leo', 'lumi'));
