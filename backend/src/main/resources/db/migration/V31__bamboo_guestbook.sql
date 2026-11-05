CREATE TABLE bamboo_guestbook (
    id BIGSERIAL PRIMARY KEY,
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    author_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    display_name VARCHAR(24) NOT NULL CHECK (char_length(trim(display_name)) > 0),
    story VARCHAR(500) NOT NULL CHECK (char_length(trim(story)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (community_id, author_id, request_id)
);
CREATE INDEX bamboo_guestbook_pages ON bamboo_guestbook (community_id, id DESC);
