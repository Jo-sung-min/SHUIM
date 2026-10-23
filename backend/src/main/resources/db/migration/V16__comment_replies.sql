-- 대댓글: 댓글이 어느 댓글의 답글인지 (한 단계만. 답글의 답글은 같은 부모에 붙는다). 부모가 지워지면 답글도 함께
ALTER TABLE comments ADD COLUMN parent_id VARCHAR(36) REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX comments_parent_idx ON comments(parent_id);
