-- Earned points are separate from money and paid fire effects. No spending endpoint exists yet.
CREATE TABLE point_wallets (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned BIGINT NOT NULL DEFAULT 0 CHECK (total_earned >= balance),
    updated_at BIGINT NOT NULL
);

-- Every eligible event is consumed once, including zero-point events after a daily limit.
-- Application code only appends; account deletion removes personal records by FK cascade.
CREATE TABLE point_ledger (
    id UUID PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key VARCHAR(200) NOT NULL UNIQUE,
    reason VARCHAR(32) NOT NULL CHECK (reason IN ('comfort_write','comfort_accepted','cheers_5','cheers_15','cheers_30')),
    amount INTEGER NOT NULL CHECK (amount >= 0 AND amount <= 50),
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    earned_on DATE NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX point_ledger_user_day_idx ON point_ledger (user_id, earned_on);
CREATE INDEX point_ledger_history_idx ON point_ledger (user_id, created_at DESC, id);

-- Keep the selected ID when its comment is removed. A post can never select a replacement.
CREATE TABLE comment_acceptances (
    post_id VARCHAR(36) PRIMARY KEY REFERENCES shout_posts(id) ON DELETE CASCADE,
    comment_id VARCHAR(36) NOT NULL,
    recipient_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    accepted_at BIGINT NOT NULL
);

-- Milestone identity survives unlike/toggle and content deletion. No content text is retained.
CREATE TABLE point_cheer_checkpoints (
    target_kind VARCHAR(8) NOT NULL CHECK (target_kind IN ('comment','feed')),
    target_id VARCHAR(36) NOT NULL,
    milestone INTEGER NOT NULL CHECK (milestone IN (5,15,30)),
    PRIMARY KEY (target_kind, target_id, milestone)
);

-- Eligibility belongs to the action, so an old guest reaction does not start counting after signup.
ALTER TABLE cheers ADD COLUMN points_eligible BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE cheers c SET points_eligible=TRUE
FROM users voter
WHERE voter.id=c.user_id AND voter.is_anonymous=FALSE AND voter.blocked_at IS NULL
  AND voter.id NOT IN ('u1','u2','u3','u4','u5','u6','u7')
  AND ((c.target_kind='comment' AND EXISTS (SELECT 1 FROM comments cm WHERE cm.id=c.target_id AND cm.author_id<>c.user_id))
    OR (c.target_kind='feed' AND EXISTS (SELECT 1 FROM feed_posts f WHERE f.id=c.target_id AND f.author_id<>c.user_id)));

-- Deployment baseline: thresholds already reached by existing registered voters are consumed,
-- conservatively even for currently hidden content. A future vote can earn only a new threshold.
INSERT INTO point_cheer_checkpoints (target_kind,target_id,milestone)
SELECT votes.target_kind,votes.target_id,threshold.milestone
FROM (
    SELECT c.target_kind,c.target_id,count(*) AS count
    FROM cheers c
    JOIN users voter ON voter.id=c.user_id
    LEFT JOIN comments cm ON c.target_kind='comment' AND cm.id=c.target_id
    LEFT JOIN feed_posts f ON c.target_kind='feed' AND f.id=c.target_id
    WHERE c.target_kind IN ('comment','feed')
      AND COALESCE(cm.author_id,f.author_id) IS NOT NULL
      AND c.user_id <> COALESCE(cm.author_id,f.author_id)
      AND c.points_eligible=TRUE
    GROUP BY c.target_kind,c.target_id
) votes
CROSS JOIN (VALUES (5),(15),(30)) AS threshold(milestone)
WHERE votes.count >= threshold.milestone;
