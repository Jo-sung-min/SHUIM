-- 기업 후원 배너 + 후원 기업 + 폭죽 이용권. 추가 전용(테이블·컬럼 추가, CHECK 완화)이라 옛 백엔드도 그대로 돈다.
-- 시각은 beach 계열과 같은 epoch ms, 날짜 경계는 PointsPolicy.day()(Asia/Seoul).

-- 후원 기업: 후원액 1,000원 = 폭죽 1개 충전. 멋져요 한 번에 1개가 회원의 이용권 1장이 된다.
CREATE TABLE sponsors (
    id              UUID PRIMARY KEY,
    name            VARCHAR(40)  NOT NULL,
    tagline         VARCHAR(80)  NOT NULL DEFAULT '',
    link_url        VARCHAR(500),
    logo_type       VARCHAR(40),
    logo_data       TEXT,
    logo_at         BIGINT,
    amount_won      BIGINT  NOT NULL DEFAULT 0 CHECK (amount_won >= 0),
    fireworks_total INTEGER NOT NULL DEFAULT 0 CHECK (fireworks_total >= 0),
    fireworks_given INTEGER NOT NULL DEFAULT 0 CHECK (fireworks_given >= 0 AND fireworks_given <= fireworks_total),
    published       BOOLEAN NOT NULL DEFAULT TRUE,
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      BIGINT  NOT NULL,
    updated_at      BIGINT  NOT NULL
);

-- 후원 입금 내역(관리자 입력, 수정 없음). 금액과 그때 충전한 폭죽 수를 남긴다.
CREATE TABLE sponsor_contributions (
    id          UUID PRIMARY KEY,
    sponsor_id  UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
    amount_won  BIGINT  NOT NULL CHECK (amount_won > 0),
    fireworks   INTEGER NOT NULL CHECK (fireworks >= 0),
    note        VARCHAR(200),
    created_by  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at  BIGINT NOT NULL
);
CREATE INDEX sponsor_contributions_sponsor_idx ON sponsor_contributions (sponsor_id, created_at DESC);

-- PC 양옆 홍보 배너. 이미지는 작아서 base64 로 두고 /api/sponsors/banners/{id}/image 가 바이트로 내려준다.
CREATE TABLE sponsor_banners (
    id          UUID PRIMARY KEY,
    title       VARCHAR(40)  NOT NULL,
    tagline     VARCHAR(80)  NOT NULL DEFAULT '',
    link_url    VARCHAR(500) NOT NULL,
    image_type  VARCHAR(40),
    image_data  TEXT,
    image_at    BIGINT,
    position    INTEGER NOT NULL DEFAULT 0,
    starts_at   BIGINT NOT NULL,
    ends_at     BIGINT NOT NULL CHECK (ends_at > starts_at),
    published   BOOLEAN NOT NULL DEFAULT TRUE,
    sponsor_id  UUID REFERENCES sponsors(id) ON DELETE SET NULL,
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
);
CREATE INDEX sponsor_banners_live_idx ON sponsor_banners (starts_at, ends_at) WHERE published;

-- 배너 클릭 수(참고용). 누가 눌렀는지는 남기지 않는다.
CREATE TABLE sponsor_banner_clicks (
    banner_id UUID NOT NULL REFERENCES sponsor_banners(id) ON DELETE CASCADE,
    day       DATE NOT NULL,
    count     INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (banner_id, day)
);

-- 멋져요: 한 기업에 한 회원이 하루 한 번(UNIQUE). 계정 삭제 시 함께 지워지고 기업의 fireworks_given 은 그대로다.
CREATE TABLE sponsor_cheers (
    id          UUID PRIMARY KEY,
    sponsor_id  UUID NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
    user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cheered_on  DATE NOT NULL,
    created_at  BIGINT NOT NULL,
    UNIQUE (sponsor_id, user_id, cheered_on)
);
CREATE INDEX sponsor_cheers_user_day_idx ON sponsor_cheers (user_id, cheered_on);

-- 폭죽 이용권 지갑과 추가 전용 원장. 이벤트 키로 재시도·중복 클릭이 두 번 반영되지 않는다.
CREATE TABLE firework_ticket_wallets (
    user_id    VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at BIGINT NOT NULL
);
CREATE TABLE firework_ticket_ledger (
    id            UUID PRIMARY KEY,
    user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key     VARCHAR(160) NOT NULL UNIQUE,   -- buy:<requestId> | cheer:<sponsorId>:<userId>:<date> | use:<requestId>
    reason        VARCHAR(16) NOT NULL CHECK (reason IN ('points_buy', 'sponsor_cheer', 'launch')),
    amount        INTEGER NOT NULL CHECK (amount IN (-1, 1)),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    sponsor_id    UUID REFERENCES sponsors(id) ON DELETE SET NULL,
    community_id  VARCHAR(36),
    map_id        VARCHAR(12),
    variant       VARCHAR(12),
    created_at    BIGINT NOT NULL
);
CREATE INDEX firework_ticket_history_idx ON firework_ticket_ledger (user_id, created_at DESC, id);

-- 온기 포인트 사용: 같은 원장에 음수 행(폭죽 이용권 -1,000)을 남긴다. 옛 코드가 넣는 0~50·기존 사유는 그대로 유효하다.
ALTER TABLE point_ledger DROP CONSTRAINT point_ledger_amount_check;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_amount_check CHECK (amount >= -1000 AND amount <= 50);
ALTER TABLE point_ledger DROP CONSTRAINT point_ledger_reason_check;
ALTER TABLE point_ledger ADD CONSTRAINT point_ledger_reason_check
    CHECK (reason IN ('comfort_write', 'comfort_accepted', 'cheers_5', 'cheers_15', 'cheers_30', 'firework_ticket'));
ALTER TABLE point_wallets ADD COLUMN total_spent BIGINT NOT NULL DEFAULT 0 CHECK (total_spent >= 0);
