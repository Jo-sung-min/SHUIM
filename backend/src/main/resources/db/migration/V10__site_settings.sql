-- 사이트 설정: 관리자가 바꾸는 제목·설명·파비콘·공유(OG) 이미지. 이미지는 작아서 base64 로 그대로 둔다 (S3 없이도 동작)
CREATE TABLE site_settings (
    key        VARCHAR(40) PRIMARY KEY,   -- title, description, favicon.type, favicon.data, og.type, og.data
    value      TEXT        NOT NULL,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
