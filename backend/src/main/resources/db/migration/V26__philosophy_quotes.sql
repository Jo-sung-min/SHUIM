-- Editorial material is never used until an administrator explicitly reviews it.
CREATE TABLE philosophy_quotes (
    id VARCHAR(36) PRIMARY KEY,
    text VARCHAR(600) NOT NULL CHECK (btrim(text) <> ''),
    author VARCHAR(100) NOT NULL CHECK (btrim(author) <> ''),
    source VARCHAR(300) NOT NULL CHECK (btrim(source) <> ''),
    source_url VARCHAR(2048) NOT NULL CHECK (source_url ~ '^https?://'),
    theme VARCHAR(60) NOT NULL CHECK (btrim(theme) <> ''),
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('paraphrase', 'translation')),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_at BIGINT,
    reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT,
    updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT,
    CONSTRAINT philosophy_quotes_review_before_use CHECK (NOT enabled OR reviewed_at IS NOT NULL)
);
CREATE INDEX philosophy_quotes_approved_idx ON philosophy_quotes (id)
    WHERE enabled = TRUE AND reviewed_at IS NOT NULL;
