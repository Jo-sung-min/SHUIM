-- 피드 글 하나에 사진 여러 장 (가로로 넘겨 보기). image 는 대표(첫 장)로 유지.
ALTER TABLE feed_posts ADD COLUMN images TEXT[] NOT NULL DEFAULT '{}';
UPDATE feed_posts SET images = ARRAY[image] WHERE image IS NOT NULL;

-- 샘플: 잎을 떨어뜨린 나무 글에 그림 5장
UPDATE feed_posts
   SET images = ARRAY['/feed/one-tree.svg', '/feed/moon-wave.svg', '/feed/mountain-fog.svg', '/feed/rain-window.svg', '/feed/dawn-stars.svg']
 WHERE id = 'f11';
