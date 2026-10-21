-- Personal blocks are separate from moderator-wide user suspension.
CREATE TABLE user_blocks (
    blocker_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks(blocked_id);

-- Record every issued upload, including images never attached to a post.
CREATE TABLE uploaded_objects (
    object_key VARCHAR(1024) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX uploaded_objects_user_idx ON uploaded_objects(user_id);

-- Committed deletion jobs survive account deletion and temporary S3 failures.
-- No user FK: jobs disappear after successful object deletion.
CREATE TABLE object_deletion_jobs (
    object_key VARCHAR(1024) PRIMARY KEY,
    not_before TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE safety_reports (
    id VARCHAR(36) PRIMARY KEY,
    reporter_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('user', 'message', 'ai')),
    target_id VARCHAR(36),
    detail VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX safety_reports_pending_idx ON safety_reports(reviewed_at, created_at);
