-- Member types describe membership; users.role remains the sole source of admin authority.
ALTER TABLE users ADD COLUMN member_type VARCHAR(12) NOT NULL DEFAULT 'member'
    CHECK (member_type IN ('member', 'partner', 'keeper'));

-- Historical anonymous-to-member transitions were not dated. Keep them unknown rather than inventing a signup time.
ALTER TABLE users ADD COLUMN registered_at TIMESTAMP;

CREATE INDEX users_registered_recent_idx ON users ((COALESCE(registered_at, created_at)) DESC, id DESC)
    WHERE is_anonymous = FALSE AND (password_hash IS NOT NULL OR kakao_id IS NOT NULL OR toss_user_key IS NOT NULL);
