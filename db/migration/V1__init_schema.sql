-- 마음 가속도 (SHUIM) 초기 스키마. PostgreSQL / Flyway 규칙(V<version>__<description>.sql)
-- 기준: lib/storage.ts, lib/community.ts 의 데이터 모델

-- ---------- 계정 ----------
CREATE TABLE users (
    id            VARCHAR(36)  PRIMARY KEY,
    email         VARCHAR(254) UNIQUE,
    password_hash VARCHAR(128),
    password_salt VARCHAR(64),
    nick          VARCHAR(24)  NOT NULL,
    role          VARCHAR(12)  NOT NULL DEFAULT 'user',   -- user | admin
    blocked_at    TIMESTAMP,
    blocked_reason VARCHAR(200),
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name    VARCHAR(20)  NOT NULL DEFAULT '',
    phone   VARCHAR(14)  NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 개인 기록 ----------
CREATE TABLE journal_entries (
    user_id  VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date     DATE        NOT NULL,
    cat      VARCHAR(12) NOT NULL,            -- money | work | relation | body | mind
    score    SMALLINT    NOT NULL CHECK (score BETWEEN -5 AND 5),
    delta    SMALLINT    CHECK (delta BETWEEN -5 AND 5),
    note     VARCHAR(500) NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, date, cat)
);

CREATE TABLE day_logs (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date    DATE        NOT NULL,
    did     TEXT[]      NOT NULL DEFAULT '{}',
    PRIMARY KEY (user_id, date)
);

CREATE TABLE memos (
    id         VARCHAR(36)  PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cat        VARCHAR(12)  NOT NULL,          -- money | work | relation | body | mind | etc
    text       VARCHAR(2000) NOT NULL,
    pinned     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX memos_user_created_idx ON memos(user_id, created_at);

CREATE TABLE goals (
    id         VARCHAR(36) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(60) NOT NULL,
    cat        VARCHAR(12) NOT NULL,
    why        VARCHAR(100) NOT NULL DEFAULT '',
    due        DATE,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_at    TIMESTAMP
);

CREATE TABLE goal_steps (
    id       VARCHAR(36) PRIMARY KEY,
    goal_id  VARCHAR(36) NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    position INTEGER     NOT NULL DEFAULT 0,
    text     VARCHAR(60) NOT NULL,
    done     BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE TABLE schedule_items (
    id      VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date    DATE        NOT NULL,
    time    TIME,
    title   VARCHAR(60) NOT NULL,
    cat     VARCHAR(12) NOT NULL DEFAULT 'etc',
    done    BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX schedule_user_date_idx ON schedule_items(user_id, date);

-- ---------- 외침 (커뮤니티) ----------
CREATE TABLE shout_posts (
    id          VARCHAR(36)   PRIMARY KEY,
    author_id   VARCHAR(36)   NOT NULL REFERENCES users(id),
    cat         VARCHAR(16)   NOT NULL,         -- misfortune | anxiety | money | work | relation | body | small-win | free
    text        VARCHAR(600)  NOT NULL,
    hidden      BOOLEAN       NOT NULL DEFAULT FALSE,
    reviewed_at TIMESTAMP,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX shout_posts_created_idx ON shout_posts(created_at DESC);
CREATE INDEX shout_posts_cat_created_idx ON shout_posts(cat, created_at DESC);

-- ---------- 위로 피드 ----------
CREATE TABLE creators (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio     VARCHAR(80)  NOT NULL DEFAULT '',
    since   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feed_posts (
    id          VARCHAR(36)  PRIMARY KEY,
    author_id   VARCHAR(36)  NOT NULL REFERENCES users(id),
    title       VARCHAR(24),
    text        VARCHAR(280) NOT NULL,
    bg          SMALLINT     NOT NULL DEFAULT 0 CHECK (bg BETWEEN 0 AND 5),
    image       VARCHAR(500),
    hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
    reviewed_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX feed_posts_created_idx ON feed_posts(created_at DESC);

CREATE TABLE follows (
    follower_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_id  VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, creator_id)
);

CREATE TABLE saves (
    user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feed_post_id VARCHAR(36) NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, feed_post_id)
);

-- ---------- 댓글 (외침 글 / 피드 글 공용) ----------
CREATE TABLE comments (
    id          VARCHAR(36)  PRIMARY KEY,
    post_kind   VARCHAR(8)   NOT NULL,          -- post | feed
    post_id     VARCHAR(36)  NOT NULL,
    author_id   VARCHAR(36)  NOT NULL REFERENCES users(id),
    text        VARCHAR(300) NOT NULL,
    hidden      BOOLEAN      NOT NULL DEFAULT FALSE,
    reviewed_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX comments_post_idx ON comments(post_kind, post_id, created_at);

-- ---------- 힘내요 (좋아요 대신) ----------
CREATE TABLE cheers (
    user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_kind VARCHAR(8)  NOT NULL,          -- post | comment | feed
    target_id   VARCHAR(36) NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, target_kind, target_id)
);
CREATE INDEX cheers_target_idx ON cheers(target_kind, target_id);

-- ---------- 신고 (1인 1회) ----------
CREATE TABLE reports (
    id          VARCHAR(36) PRIMARY KEY,
    reporter_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_kind VARCHAR(8)  NOT NULL,          -- post | comment | feed
    target_id   VARCHAR(36) NOT NULL,
    reason      VARCHAR(16) NOT NULL,          -- not_comfort | abuse | spam | other
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reporter_id, target_kind, target_id)
);
CREATE INDEX reports_target_idx ON reports(target_kind, target_id);

-- ---------- 불행 모금 ----------
CREATE TABLE donations (
    id         VARCHAR(36) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id),
    amount     INTEGER     NOT NULL CHECK (amount BETWEEN 100 AND 1000000),
    message    VARCHAR(60),
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX donations_created_idx ON donations(created_at);

-- ---------- 주간 집계 테이블 (배치가 채움, 화면은 이것만 읽음) ----------
CREATE TABLE weekly_batches (
    week        DATE      PRIMARY KEY,          -- 월요일
    computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized   BOOLEAN   NOT NULL DEFAULT FALSE,
    rows        JSONB     NOT NULL DEFAULT '[]', -- [{rank,userId,nick,cheers,posts,topPostId,topPostText,share,payout}]
    fund_total  INTEGER   NOT NULL DEFAULT 0,
    fund_count  INTEGER   NOT NULL DEFAULT 0,
    fund_donors INTEGER   NOT NULL DEFAULT 0
);

-- ---------- 알림 읽음 시각 ----------
CREATE TABLE notification_reads (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seen_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 관리자 설정 (AI 프롬프트 덮어쓰기, 모델) ----------
CREATE TABLE app_settings (
    key        VARCHAR(40) PRIMARY KEY,         -- prompt.briefing | prompt.praise | prompt.love | prompt.review | model
    value      TEXT        NOT NULL,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
