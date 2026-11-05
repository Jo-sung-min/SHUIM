-- No real accounts or circles are seeded. An authenticated administrator creates the
-- two-person allowlist transactionally through the dedicated private-test API.
ALTER TABLE communities ADD COLUMN private_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN space_capacity INTEGER NOT NULL DEFAULT 100;
ALTER TABLE communities ADD CONSTRAINT communities_space_capacity_check CHECK (space_capacity BETWEEN 1 AND 100);
ALTER TABLE communities ADD CONSTRAINT communities_private_test_policy_check CHECK (
    NOT private_test OR (pinned AND space_capacity = 4 AND visibility = 'members'
        AND join_mode = 'invite' AND domain IS NULL AND invite_code IS NULL)
);

CREATE TABLE community_private_members (
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_private_members_user_idx ON community_private_members(user_id, community_id);
