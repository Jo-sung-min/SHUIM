-- 카카오 로그인: users 에 카카오 회원번호, OAuth 왕복 중 state 보관 테이블
ALTER TABLE users ADD COLUMN kakao_id VARCHAR(32) UNIQUE;

CREATE TABLE oauth_states (
    state        VARCHAR(64)  PRIMARY KEY,
    provider     VARCHAR(16)  NOT NULL,            -- kakao
    return_to    VARCHAR(500) NOT NULL DEFAULT '/',
    anon_user_id VARCHAR(36),                      -- 로그인 전 익명 유저가 있으면 그 행을 승격하기 위해
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP    NOT NULL
);
