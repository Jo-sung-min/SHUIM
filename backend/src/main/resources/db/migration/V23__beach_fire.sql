-- Shared, durable campfire state. Times are server epoch milliseconds.
CREATE TABLE beach_fires (
    community_id VARCHAR(36) PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
    fuel_until BIGINT NOT NULL
);

CREATE TABLE beach_fire_wood_requests (
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    added_at BIGINT NOT NULL,
    PRIMARY KEY (community_id, user_id, request_id)
);
CREATE INDEX beach_fire_wood_cooldown_idx ON beach_fire_wood_requests (community_id, user_id, added_at DESC);

-- One immutable 24-hour window per verified provider order. Refunds revoke a
-- window without moving the promised times of later purchases.
CREATE TABLE beach_fire_colors (
    provider_order_id VARCHAR(200) PRIMARY KEY,
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    color VARCHAR(12) NOT NULL CHECK (color IN ('rose', 'aurora', 'ocean', 'violet')),
    starts_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL CHECK (expires_at > starts_at),
    revoked_at BIGINT
);
CREATE INDEX beach_fire_colors_queue_idx ON beach_fire_colors (community_id, starts_at, expires_at) WHERE revoked_at IS NULL;
