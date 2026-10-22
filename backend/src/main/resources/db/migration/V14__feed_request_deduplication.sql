ALTER TABLE feed_posts ADD COLUMN client_request_id UUID;

CREATE UNIQUE INDEX feed_posts_author_request_unique
    ON feed_posts (author_id, client_request_id)
    WHERE client_request_id IS NOT NULL;
