-- 빛: 회원끼리 주고받는 가상 재화. 돈·폭죽 이용권·온기 포인트로 바꿀 수 없다.
-- 추가 전용(새 테이블·컬럼)이라 옛 백엔드도 그대로 돈다. 시각은 epoch ms, 날짜 경계는 Asia/Seoul.
-- 원화 모의 모금(donations, weekly_batches.fund_*)은 지우지 않고 더는 읽지 않는다.

CREATE TABLE light_wallets (
    user_id        VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance        BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_received BIGINT NOT NULL DEFAULT 0 CHECK (total_received >= 0),
    total_given    BIGINT NOT NULL DEFAULT 0 CHECK (total_given >= 0),
    updated_at     BIGINT NOT NULL
);

-- 빛 주기 한 건. id 는 클라이언트 요청 번호라 재시도·중복 클릭이 두 번 들어가지 않는다.
-- 준 사람이 떠나도 받은 빛은 남고(from_user NULL), 받은 사람이 떠나면 함께 지워진다.
CREATE TABLE light_gifts (
    id         UUID PRIMARY KEY,
    from_user  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    to_user    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    VARCHAR(36) REFERENCES shout_posts(id) ON DELETE SET NULL,
    amount     INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000),
    given_on   DATE NOT NULL,
    created_at BIGINT NOT NULL,
    CHECK (from_user IS NULL OR from_user <> to_user)
);
CREATE INDEX light_gifts_pair_day_idx ON light_gifts (from_user, to_user, given_on);
CREATE INDEX light_gifts_post_idx ON light_gifts (post_id);

-- 추가 전용 원장. 이벤트 키가 같은 일은 한 번만 반영된다.
CREATE TABLE light_ledger (
    id            UUID PRIMARY KEY,
    user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key     VARCHAR(120) NOT NULL UNIQUE,   -- daily:<userId>:<date> | gift:<giftId>:out | gift:<giftId>:in
    reason        VARCHAR(16) NOT NULL CHECK (reason IN ('daily', 'gift_sent', 'gift_received')),
    amount        INTEGER NOT NULL CHECK (amount <> 0),
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    gift_id       UUID REFERENCES light_gifts(id) ON DELETE SET NULL,
    created_at    BIGINT NOT NULL
);
CREATE INDEX light_ledger_history_idx ON light_ledger (user_id, created_at DESC, id);
CREATE INDEX light_ledger_gift_idx ON light_ledger (gift_id);

-- 주간 집계에 그 주 불행광장 글이 받은 빛(합계·건수·준 사람 수)을 함께 남긴다.
ALTER TABLE weekly_batches
    ADD COLUMN light_total  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN light_count  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN light_givers INTEGER NOT NULL DEFAULT 0;
