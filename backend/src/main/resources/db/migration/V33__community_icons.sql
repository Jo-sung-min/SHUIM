-- 소로우 아이콘. 기본 아이콘 id(icon) 를 고르거나 작은 사진을 올린다 (base64 로 두고 /api/circles/{slug}/icon 이 바이트로 내려준다).
ALTER TABLE communities ADD COLUMN icon      VARCHAR(24);
ALTER TABLE communities ADD COLUMN icon_type VARCHAR(40);
ALTER TABLE communities ADD COLUMN icon_data TEXT;
ALTER TABLE communities ADD COLUMN icon_at   BIGINT;
-- 연 사람이 닫은 소로우. 지우지 않고 표시만 해 둘러보기·내 소로우·바닷가에서 사라진다 (올라간 사연은 남는다).
ALTER TABLE communities ADD COLUMN closed_at BIGINT;
