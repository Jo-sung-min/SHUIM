-- Outing growth is independent of meals and room upgrades. Only completed outings count.
CREATE TABLE outing_progress (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    days INTEGER NOT NULL DEFAULT 0 CHECK (days BETWEEN 0 AND 100),
    last_reward_date DATE,
    active_token VARCHAR(36),
    active_action VARCHAR(40),
    active_started_at TIMESTAMPTZ,
    last_completed_token VARCHAR(36),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outing_memories (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    action_id VARCHAR(40) NOT NULL,
    note VARCHAR(240) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, day, action_id)
);
CREATE INDEX outing_memories_recent ON outing_memories(user_id, created_at DESC);
