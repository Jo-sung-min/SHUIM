-- 외침에 사진 (최대 4장). 피드처럼 S3 공개 주소를 배열로 둔다. 기존 글은 빈 배열
ALTER TABLE shout_posts ADD COLUMN images TEXT[] NOT NULL DEFAULT '{}';
