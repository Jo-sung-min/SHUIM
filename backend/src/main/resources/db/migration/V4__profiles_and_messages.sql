-- 공개 프로필(사진·소개) + 1:1 메시지

ALTER TABLE profiles ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE profiles ADD COLUMN bio VARCHAR(160) NOT NULL DEFAULT '';

-- 두 사람 사이의 대화. user_a < user_b 로 정규화해서 한 쌍에 하나만 생기게 한다.
CREATE TABLE conversations (
    id              VARCHAR(36) PRIMARY KEY,
    user_a          VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b          VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP,
    CONSTRAINT conversations_pair_uq UNIQUE (user_a, user_b),
    CONSTRAINT conversations_order_ck CHECK (user_a < user_b)
);
CREATE INDEX conversations_a_idx ON conversations(user_a, last_message_at DESC);
CREATE INDEX conversations_b_idx ON conversations(user_b, last_message_at DESC);

CREATE TABLE messages (
    id              VARCHAR(36)   PRIMARY KEY,
    conversation_id VARCHAR(36)   NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       VARCHAR(36)   NOT NULL REFERENCES users(id),
    text            VARCHAR(1000) NOT NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         TIMESTAMP
);
CREATE INDEX messages_conv_idx ON messages(conversation_id, created_at);
