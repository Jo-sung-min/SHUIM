-- 세션 로그인 (쿠키 토큰의 SHA-256 해시 저장) + 익명 유저 구분
CREATE TABLE auth_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP   NOT NULL
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);

ALTER TABLE users ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
-- 샘플 유저는 로그인 불가(비밀번호 없음)지만 익명은 아님
