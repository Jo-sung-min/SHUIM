-- 커뮤니티 소로우 (대나무숲처럼 소속별 공간).
-- 멤버가 익명으로 보낸 사연(submissions)을 소로우지기가 검토해 '#번호 소로우'로 올린다.
-- 게시된 사연은 외침 글(shout_posts)과 같은 테이블을 써서 힘내요·댓글·신고·배지를 그대로 쓴다 (community_id 가 없으면 광장의 자유 외침).
-- 소속 인증 메일 주소는 저장하지 않는다 (해시와 도메인만).

CREATE TABLE communities (
    id          VARCHAR(36)  PRIMARY KEY,
    slug        VARCHAR(40)  NOT NULL UNIQUE,                -- 주소용 이름 (/c/slug)
    name        VARCHAR(30)  NOT NULL,                       -- 'OO 소로우'
    name_key    VARCHAR(30)  NOT NULL UNIQUE,                -- 같은 이름 막기 (공백 제거·소문자)
    kind        VARCHAR(12)  NOT NULL,                       -- school | company | region | interest
    domain      VARCHAR(100),                                -- 학교·회사 메일 도메인 (예: korea.ac.kr)
    verified    BOOLEAN      NOT NULL DEFAULT FALSE,         -- 개설자가 도메인 인증을 마쳤는지 ('인증 소로우')
    join_mode   VARCHAR(12)  NOT NULL DEFAULT 'open',        -- open | approve | invite | domain
    visibility  VARCHAR(12)  NOT NULL DEFAULT 'public',      -- public | members (방문자에게 사연 숨김)
    intro       VARCHAR(200) NOT NULL DEFAULT '',
    notice      VARCHAR(200) NOT NULL DEFAULT '',            -- 소로우지기 공지 한 줄
    invite_code VARCHAR(16),
    created_by  VARCHAR(36)  NOT NULL REFERENCES users(id),
    post_seq    INTEGER      NOT NULL DEFAULT 0,             -- 마지막으로 붙인 #번호
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE community_members (
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(10) NOT NULL DEFAULT 'member',      -- owner | keeper | member
    status       VARCHAR(10) NOT NULL DEFAULT 'active',      -- active | pending (승인 대기)
    is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,         -- 대표 소로우 (한 사람에 하나)
    verified_at  TIMESTAMP,                                  -- 메일 인증으로 들어왔으면 그 시각
    joined_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_idx ON community_members(user_id);
CREATE UNIQUE INDEX community_members_primary_uq ON community_members(user_id) WHERE is_primary;

-- 소속 인증: 메일 주소 대신 해시만. 같은 메일로 같은 소로우에 두 번 인증할 수 없다
CREATE TABLE community_email_codes (
    id           VARCHAR(36) PRIMARY KEY,
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_hash   VARCHAR(64) NOT NULL,
    code_hash    VARCHAR(64) NOT NULL,
    attempts     INTEGER     NOT NULL DEFAULT 0,
    expires_at   TIMESTAMP   NOT NULL,
    used_at      TIMESTAMP,
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX community_email_codes_user_idx ON community_email_codes(user_id, community_id, created_at DESC);
CREATE TABLE community_verifications (
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    email_hash   VARCHAR(64) NOT NULL,
    verified_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, email_hash)
);

-- 사연: 보낸 사람(author_id)은 소로우지기 화면에 내려가지 않는다
CREATE TABLE submissions (
    id            VARCHAR(36)   PRIMARY KEY,
    community_id  VARCHAR(36)   NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    author_id     VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cat           VARCHAR(16)   NOT NULL,
    text          VARCHAR(1200) NOT NULL,
    status        VARCHAR(10)   NOT NULL DEFAULT 'pending',  -- pending | held | published | rejected
    crisis        BOOLEAN       NOT NULL DEFAULT FALSE,      -- 위기 신호 → 큐 맨 위
    ai_draft      VARCHAR(1200),
    reason        VARCHAR(200),                              -- 보류·반려 사유 (보낸 사람에게 보임)
    reply         VARCHAR(300),                              -- 소로우지기의 익명 답장
    post_id       VARCHAR(36),
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at    TIMESTAMP
);
CREATE INDEX submissions_queue_idx ON submissions(community_id, status, created_at);
CREATE INDEX submissions_author_idx ON submissions(author_id, created_at DESC);

-- 소로우 리스닝 (구독)
CREATE TABLE community_follows (
    user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id VARCHAR(36) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, community_id)
);
CREATE INDEX community_follows_community_idx ON community_follows(community_id);

-- 게시된 사연 = 소로우 안의 외침 글. 소로우마다 #1 부터
ALTER TABLE shout_posts ADD COLUMN community_id VARCHAR(36) REFERENCES communities(id) ON DELETE CASCADE;
ALTER TABLE shout_posts ADD COLUMN post_no INTEGER;
CREATE UNIQUE INDEX shout_posts_community_no_uq ON shout_posts(community_id, post_no) WHERE community_id IS NOT NULL;
CREATE INDEX shout_posts_community_idx ON shout_posts(community_id, created_at DESC);

-- 프로필에 대표 소로우를 보여 줄지 (기본은 숨김: 소속이 드러나면 익명성이 약해진다)
ALTER TABLE profiles ADD COLUMN show_circle BOOLEAN NOT NULL DEFAULT FALSE;
