-- Provider receipts remain unique after account/community deletion so they cannot be replayed.
-- No payment card details or raw provider response bodies are stored.
CREATE TABLE beach_fire_payment_orders (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    community_id VARCHAR(36) REFERENCES communities(id) ON DELETE SET NULL,
    provider VARCHAR(3) NOT NULL CHECK (provider IN ('web', 'ait')),
    color VARCHAR(12) NOT NULL CHECK (color IN ('rose', 'aurora', 'ocean', 'violet')),
    amount INTEGER NOT NULL CHECK (amount = 1000),
    sku VARCHAR(200),
    request_id UUID NOT NULL,
    provider_order_id VARCHAR(200),
    payment_key VARCHAR(200),
    status VARCHAR(12) NOT NULL CHECK (status IN ('CREATED', 'PAID', 'REFUNDED', 'FAILED')),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    starts_at BIGINT,
    expires_at BIGINT,
    UNIQUE (user_id, request_id),
    UNIQUE (provider, provider_order_id),
    UNIQUE (payment_key),
    CHECK ((starts_at IS NULL AND expires_at IS NULL) OR (starts_at IS NOT NULL AND expires_at > starts_at))
);
CREATE INDEX beach_fire_payment_history_idx ON beach_fire_payment_orders (user_id, community_id, created_at DESC);
CREATE INDEX beach_fire_payment_reconcile_idx ON beach_fire_payment_orders (updated_at) WHERE status IN ('CREATED', 'PAID');
