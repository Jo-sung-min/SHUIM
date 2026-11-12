-- 명화 큐레이션 10장(V39, curation-11~20)의 그림을 메트로폴리탄 미술관 원본 JPG(장당 2.2~6.2MB, 합계 44.5MB)에서
-- CDN feed/curation/met-<작품ID>-v1.webp(1080x1920 WebP, 합계 4.0MB)로 바꾼다.
-- 피드가 9:16 상자에 cover 로 보여 주던 가운데 부분과 같은 영역을 잘라 sRGB 로 맞춘 것이라 화면은 그대로다.
-- 파일·해시는 frontend/public-assets.manifest.json, 원본 주소는 frontend/lib/curation-nov11.json 의 image 에 남아 있다.
-- 원본 주소 그대로인 글만 바꾸므로, 그 사이 손댄 글이나 이미 바뀐 글은 건드리지 않는다.

UPDATE feed_posts SET image = '/feed/curation/met-437307-v1.webp', images = ARRAY['/feed/curation/met-437307-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DT1866.jpg', '/feed/curation/met-437307-v1.webp')::jsonb
WHERE id = 'curation-11' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DT1866.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-435983-v1.webp', images = ARRAY['/feed/curation/met-435983-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DP-14936-055.jpg', '/feed/curation/met-435983-v1.webp')::jsonb
WHERE id = 'curation-12' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DP-14936-055.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-459112-v1.webp', images = ARRAY['/feed/curation/met-459112-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/rl/original/DP-34501-001.jpg', '/feed/curation/met-459112-v1.webp')::jsonb
WHERE id = 'curation-13' AND image = 'https://images.metmuseum.org/CRDImages/rl/original/DP-34501-001.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-437686-v1.webp', images = ARRAY['/feed/curation/met-437686-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DP-33708-001.jpg', '/feed/curation/met-437686-v1.webp')::jsonb
WHERE id = 'curation-14' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DP-33708-001.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-459121-v1.webp', images = ARRAY['/feed/curation/met-459121-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/rl/original/DP-34504-001.jpg', '/feed/curation/met-459121-v1.webp')::jsonb
WHERE id = 'curation-15' AND image = 'https://images.metmuseum.org/CRDImages/rl/original/DP-34504-001.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-901617-v1.webp', images = ARRAY['/feed/curation/met-901617-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DP323410.jpg', '/feed/curation/met-901617-v1.webp')::jsonb
WHERE id = 'curation-16' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DP323410.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-437684-v1.webp', images = ARRAY['/feed/curation/met-437684-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DP323408.jpg', '/feed/curation/met-437684-v1.webp')::jsonb
WHERE id = 'curation-17' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DP323408.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-437381-v1.webp', images = ARRAY['/feed/curation/met-437381-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DT323419.jpg', '/feed/curation/met-437381-v1.webp')::jsonb
WHERE id = 'curation-18' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DT323419.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-437382-v1.webp', images = ARRAY['/feed/curation/met-437382-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DT2159.jpg', '/feed/curation/met-437382-v1.webp')::jsonb
WHERE id = 'curation-19' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DT2159.jpg';
UPDATE feed_posts SET image = '/feed/curation/met-437097-v1.webp', images = ARRAY['/feed/curation/met-437097-v1.webp'],
  pages = replace(pages::text, 'https://images.metmuseum.org/CRDImages/ep/original/DP124093.jpg', '/feed/curation/met-437097-v1.webp')::jsonb
WHERE id = 'curation-20' AND image = 'https://images.metmuseum.org/CRDImages/ep/original/DP124093.jpg';
