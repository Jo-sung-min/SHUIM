CREATE TABLE user_pets (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(20) NOT NULL DEFAULT '모루',
    food INTEGER NOT NULL DEFAULT 9 CHECK (food >= 0),
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    meal_date DATE NOT NULL,
    meals INTEGER NOT NULL DEFAULT 0 CHECK (meals BETWEEN 0 AND 3)
);
-- The reward ledger survives deletion/editing of a diary. Account deletion removes it.
CREATE TABLE pet_daily_rewards (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    rewarded INTEGER NOT NULL DEFAULT 0 CHECK (rewarded BETWEEN 0 AND 31),
    PRIMARY KEY (user_id, date)
);
-- Diary content has one owner: the existing private memo notebook.
ALTER TABLE memos ADD COLUMN pet_answers JSONB;
