-- Add ten curated posts; never modifies existing posts or account credentials.
-- Sources and Korean translations: frontend/lib/curation-nov11.json.
-- Artwork: Met Open Access, isPublicDomain=true checked 2026-11-11.
-- Fonts: Gowun Batang / Song Myung, SIL OFL 1.1. All overlays use plain (transparent) backgrounds.
-- Original museum image URLs remain absolute, so no CDN deployment is required.
-- Flyway applies this once, transactionally. Stable IDs also protect against duplicate seed data.

INSERT INTO users (id, nick, role, is_anonymous, created_at)
VALUES ('sorow-curator', '소로우', 'user', FALSE, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
ON CONFLICT (id) DO NOTHING;
INSERT INTO creators (user_id, bio)
VALUES ('sorow-curator', '매일 한 장, 오늘의 하늘과 공간')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO feed_posts (id, author_id, title, text, bg, image, images, pages, created_at) VALUES
  ('curation-11', 'sorow-curator', '오늘의 희망', '카미유 피사로 · 에라니의 포플러 (1895)
메트로폴리탄 미술관 · Open Access
문장: 에밀리 디킨슨, 「희망은 깃털 달린 것」 1연 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/437307', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DT1866.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DT1866.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DT1866.jpg","title":"오늘의 희망","text":"카미유 피사로 · 에라니의 포플러 (1895)\n메트로폴리탄 미술관 · Open Access\n문장: 에밀리 디킨슨, 「희망은 깃털 달린 것」 1연 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/437307","ratio":0.5625,"overlays":[{"text":"희망은 영혼에 내려앉아\n말 없는 노래를 부르는\n깃털 달린 것.","x":0.5,"y":0.17,"size":0.048,"color":"ink","font":"serif","align":"center","style":"plain"},{"text":"— 에밀리 디킨슨","x":0.5,"y":0.25751,"size":0.03,"color":"ink","font":"serif","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '0 seconds'),
  ('curation-12', 'sorow-curator', '오늘의 고요', '카미유 코로 · 멀리 탑이 보이는 강 (1865)
메트로폴리탄 미술관 · Open Access
문장: 마르쿠스 아우렐리우스, 『명상록』 4.3 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/435983', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DP-14936-055.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DP-14936-055.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DP-14936-055.jpg","title":"오늘의 고요","text":"카미유 코로 · 멀리 탑이 보이는 강 (1865)\n메트로폴리탄 미술관 · Open Access\n문장: 마르쿠스 아우렐리우스, 『명상록』 4.3 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/435983","ratio":0.5625,"overlays":[{"text":"자주 마음속 쉼터로 돌아가\n너 자신을 새롭게 하라.","x":0.5,"y":0.18,"size":0.049,"color":"ink","font":"song","align":"center","style":"plain"},{"text":"— 마르쿠스 아우렐리우스","x":0.5,"y":0.24913875,"size":0.03,"color":"ink","font":"song","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 seconds'),
  ('curation-13', 'sorow-curator', '오늘의 다정함', '오귀스트 르누아르 · 피아노 앞의 두 소녀 (1892)
메트로폴리탄 미술관 · Open Access
문장: 랠프 월도 에머슨, 『에세이』 「우정」 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/459112', 0, 'https://images.metmuseum.org/CRDImages/rl/original/DP-34501-001.jpg', ARRAY['https://images.metmuseum.org/CRDImages/rl/original/DP-34501-001.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/rl/original/DP-34501-001.jpg","title":"오늘의 다정함","text":"오귀스트 르누아르 · 피아노 앞의 두 소녀 (1892)\n메트로폴리탄 미술관 · Open Access\n문장: 랠프 월도 에머슨, 『에세이』 「우정」 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/459112","ratio":0.5625,"overlays":[{"text":"친구를 얻는 유일한 길은\n스스로 친구가 되는 것이다.","x":0.5,"y":0.14,"size":0.047,"color":"cream","font":"serif","align":"center","style":"plain"},{"text":"— 랠프 월도 에머슨","x":0.5,"y":0.20754125,"size":0.03,"color":"cream","font":"serif","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '2 seconds'),
  ('curation-14', 'sorow-curator', '오늘의 걸음', '알프레드 시슬레 · 모레의 외젠 무수아르 거리, 겨울 (1891)
메트로폴리탄 미술관 · Open Access
문장: 헨리 데이비드 소로, 『월든』 「결론」 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/437686', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DP-33708-001.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DP-33708-001.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DP-33708-001.jpg","title":"오늘의 걸음","text":"알프레드 시슬레 · 모레의 외젠 무수아르 거리, 겨울 (1891)\n메트로폴리탄 미술관 · Open Access\n문장: 헨리 데이비드 소로, 『월든』 「결론」 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/437686","ratio":0.5625,"overlays":[{"text":"저마다 들리는 음악에 맞춰\n걸어가게 하라.\n박자가 다르고 멀리 들리더라도.","x":0.5,"y":0.16,"size":0.046,"color":"ink","font":"song","align":"center","style":"plain"},{"text":"— 헨리 데이비드 소로","x":0.5,"y":0.24511375,"size":0.03,"color":"ink","font":"song","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '3 seconds'),
  ('curation-15', 'sorow-curator', '오늘의 시작', '알프레드 시슬레 · 밤나무 가로수길 (1878)
메트로폴리탄 미술관 · Open Access
문장: 노자, 『도덕경』 64장 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/459121', 0, 'https://images.metmuseum.org/CRDImages/rl/original/DP-34504-001.jpg', ARRAY['https://images.metmuseum.org/CRDImages/rl/original/DP-34504-001.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/rl/original/DP-34504-001.jpg","title":"오늘의 시작","text":"알프레드 시슬레 · 밤나무 가로수길 (1878)\n메트로폴리탄 미술관 · Open Access\n문장: 노자, 『도덕경』 64장 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/459121","ratio":0.5625,"overlays":[{"text":"아름드리나무도\n작은 싹에서 자라난다.","x":0.5,"y":0.16,"size":0.054,"color":"cream","font":"serif","align":"center","style":"plain"},{"text":"— 노자","x":0.5,"y":0.2331325,"size":0.03,"color":"cream","font":"serif","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '4 seconds'),
  ('curation-16', 'sorow-curator', '오늘의 마음', '알프레드 시슬레 · 부지발의 센강 (1876)
메트로폴리탄 미술관 · Open Access
문장: 에픽테토스, 『엥케이리디온』 1장 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/901617', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DP323410.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DP323410.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DP323410.jpg","title":"오늘의 마음","text":"알프레드 시슬레 · 부지발의 센강 (1876)\n메트로폴리탄 미술관 · Open Access\n문장: 에픽테토스, 『엥케이리디온』 1장 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/901617","ratio":0.5625,"overlays":[{"text":"우리에게 달린 일이 있고,\n우리에게 달려 있지 않은 일도 있다.","x":0.5,"y":0.16,"size":0.044,"color":"ink","font":"song","align":"center","style":"plain"},{"text":"— 에픽테토스","x":0.5,"y":0.225145,"size":0.03,"color":"ink","font":"song","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '5 seconds'),
  ('curation-17', 'sorow-curator', '오늘의 빛', '알프레드 시슬레 · 모레에서 생마메스로 가는 길 (1883–85)
메트로폴리탄 미술관 · Open Access
문장: 헨리 데이비드 소로, 『월든』 「결론」 마지막 문장 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/437684', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DP323408.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DP323408.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DP323408.jpg","title":"오늘의 빛","text":"알프레드 시슬레 · 모레에서 생마메스로 가는 길 (1883–85)\n메트로폴리탄 미술관 · Open Access\n문장: 헨리 데이비드 소로, 『월든』 「결론」 마지막 문장 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/437684","ratio":0.5625,"overlays":[{"text":"아직 밝아올 날이 더 있다.\n태양은 다만 아침의 별일 뿐.","x":0.5,"y":0.15,"size":0.049,"color":"ink","font":"serif","align":"center","style":"plain"},{"text":"— 헨리 데이비드 소로","x":0.5,"y":0.21913875,"size":0.03,"color":"ink","font":"serif","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '6 seconds'),
  ('curation-18', 'sorow-curator', '오늘의 믿음', '오딜롱 르동 · 꽃이 꽂힌 에트루리아 꽃병 (1900–1910)
메트로폴리탄 미술관 · Open Access
문장: 랠프 월도 에머슨, 『에세이』 「자기 신뢰」 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/437381', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DT323419.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DT323419.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DT323419.jpg","title":"오늘의 믿음","text":"오딜롱 르동 · 꽃이 꽂힌 에트루리아 꽃병 (1900–1910)\n메트로폴리탄 미술관 · Open Access\n문장: 랠프 월도 에머슨, 『에세이』 「자기 신뢰」 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/437381","ratio":0.5625,"overlays":[{"text":"너 자신을 믿어라.\n모든 마음은 그 굳센 현에 울린다.","x":0.5,"y":0.16,"size":0.047,"color":"ink","font":"song","align":"center","style":"plain"},{"text":"— 랠프 월도 에머슨","x":0.5,"y":0.22754125,"size":0.03,"color":"ink","font":"song","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '7 seconds'),
  ('curation-19', 'sorow-curator', '오늘의 충분함', '오딜롱 르동 · 분홍색 배경의 꽃병 (1906년경)
메트로폴리탄 미술관 · Open Access
문장: 노자, 『도덕경』 33장 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/437382', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DT2159.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DT2159.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DT2159.jpg","title":"오늘의 충분함","text":"오딜롱 르동 · 분홍색 배경의 꽃병 (1906년경)\n메트로폴리탄 미술관 · Open Access\n문장: 노자, 『도덕경』 33장 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/437382","ratio":0.5625,"overlays":[{"text":"만족할 줄 아는 사람이\n부유한 사람이다.","x":0.5,"y":0.16,"size":0.052,"color":"ink","font":"serif","align":"center","style":"plain"},{"text":"— 노자","x":0.5,"y":0.231535,"size":0.03,"color":"ink","font":"serif","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '8 seconds'),
  ('curation-20', 'sorow-curator', '오늘의 아름다움', '장프랑수아 밀레 · 건초더미, 가을 (1874년경)
메트로폴리탄 미술관 · Open Access
문장: 마르쿠스 아우렐리우스, 『명상록』 4.20 · 소로우 옮김
https://www.metmuseum.org/art/collection/search/437097', 0, 'https://images.metmuseum.org/CRDImages/ep/original/DP124093.jpg', ARRAY['https://images.metmuseum.org/CRDImages/ep/original/DP124093.jpg'], '[{"image":"https://images.metmuseum.org/CRDImages/ep/original/DP124093.jpg","title":"오늘의 아름다움","text":"장프랑수아 밀레 · 건초더미, 가을 (1874년경)\n메트로폴리탄 미술관 · Open Access\n문장: 마르쿠스 아우렐리우스, 『명상록』 4.20 · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/437097","ratio":0.5625,"overlays":[{"text":"아름다운 것은\n그 자체로 아름답다.\n칭찬이 그것을 더 낫게 만들지는 않는다.","x":0.5,"y":0.16,"size":0.042,"color":"ink","font":"song","align":"center","style":"plain"},{"text":"— 마르쿠스 아우렐리우스","x":0.5,"y":0.24032125000000001,"size":0.03,"color":"ink","font":"song","align":"center","style":"plain"}]}]'::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '9 seconds')
ON CONFLICT (id) DO NOTHING;
