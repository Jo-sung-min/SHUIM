-- 위로 피드를 명화 큐레이션 10개로 다시 채운다 (2026-11-10 사용자 요청·승인)
-- 1) 공식 큐레이션 계정 "소로우" (로그인 수단 없음, 일반 사용자 권한)
-- 2) 샘플 계정(u1~u7)의 피드 글과 딸린 댓글·힘내요·신고·저장을 지운다. 실제 사용자 글은 건드리지 않는다.
-- 3) 메트로폴리탄 미술관 Open Access(CC0) 명화 + 저작권이 끝난 저자의 문장 10개를 넣는다.
--    이미지는 CDN feed/curation/*-v1.webp (public-assets.manifest.json), "오늘의" 필터로 보정한 1080x1920(9:16, 피드 전체 화면).

INSERT INTO users (id, nick, role, is_anonymous, created_at) VALUES ('sorow-curator', '소로우', 'user', FALSE, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
INSERT INTO creators (user_id, bio) VALUES ('sorow-curator', '매일 한 장, 오늘의 하늘과 공간')
ON CONFLICT (user_id) DO NOTHING;

DELETE FROM cheers WHERE target_kind = 'comment' AND target_id IN (
  SELECT id FROM comments WHERE post_kind = 'feed' AND post_id IN (SELECT id FROM feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7')));
DELETE FROM reports WHERE target_kind = 'comment' AND target_id IN (
  SELECT id FROM comments WHERE post_kind = 'feed' AND post_id IN (SELECT id FROM feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7')));
DELETE FROM comments WHERE post_kind = 'feed' AND post_id IN (SELECT id FROM feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7'));
DELETE FROM cheers WHERE target_kind = 'feed' AND target_id IN (SELECT id FROM feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7'));
DELETE FROM reports WHERE target_kind = 'feed' AND target_id IN (SELECT id FROM feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7'));
-- saves 는 feed_posts 를 ON DELETE CASCADE 로 참조한다
DELETE FROM feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7');

INSERT INTO feed_posts (id, author_id, title, text, bg, image, images, pages, created_at) VALUES
  ('curation-01', 'sorow-curator', '오늘의 하늘', '빈센트 반 고흐 ==「사이프러스가 있는 밀밭」==(1889)
메트로폴리탄 미술관 소장', 0, '/feed/curation/sky-wheat-cypresses-v1.webp', ARRAY['/feed/curation/sky-wheat-cypresses-v1.webp'], '[{"image":"/feed/curation/sky-wheat-cypresses-v1.webp","title":"오늘의 하늘","text":"빈센트 반 고흐 ==「사이프러스가 있는 밀밭」==(1889)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"구름이 내 삶에 떠다니는 것은\n비나 폭풍을 몰고 오기 위해서가 아니라\n저녁 하늘에 빛깔을 더하기 위해서다\n— 라빈드라나트 타고르","x":0.5,"y":0.24,"size":0.04,"color":"white","font":"serif","align":"center","style":"dim"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '0 hours'),
  ('curation-02', 'sorow-curator', '오늘의 공간', '요하네스 페르메이르 ==「물주전자를 든 젊은 여인」==(1662년경)
메트로폴리탄 미술관 소장', 0, '/feed/curation/space-water-pitcher-v1.webp', ARRAY['/feed/curation/space-water-pitcher-v1.webp'], '[{"image":"/feed/curation/space-water-pitcher-v1.webp","title":"오늘의 공간","text":"요하네스 페르메이르 ==「물주전자를 든 젊은 여인」==(1662년경)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"슬픔이 당신을 깊이 파낼수록\n그만큼 더 많은 기쁨을 담을 수 있다\n— 칼릴 지브란, 『예언자』","x":0.5,"y":0.17,"size":0.042,"color":"white","font":"serif","align":"center","style":"dim"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '3 hours'),
  ('curation-03', 'sorow-curator', '오늘의 하늘', '카스파르 다비트 프리드리히 ==「달을 바라보는 두 남자」==(1825–30년경)
메트로폴리탄 미술관 소장', 0, '/feed/curation/sky-two-men-moon-v1.webp', ARRAY['/feed/curation/sky-two-men-moon-v1.webp'], '[{"image":"/feed/curation/sky-two-men-moon-v1.webp","title":"오늘의 하늘","text":"카스파르 다비트 프리드리히 ==「달을 바라보는 두 남자」==(1825–30년경)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"별을 노래하는 마음으로\n모든 죽어 가는 것을 사랑해야지\n— 윤동주, 「서시」","x":0.5,"y":0.2,"size":0.05,"color":"cream","font":"serif","align":"center","style":"plain"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '6 hours'),
  ('curation-04', 'sorow-curator', '오늘의 공간', '빌헬름 함메르쇠이 ==「달빛, 스트란가데 30번지」==(1900–06)
메트로폴리탄 미술관 소장', 0, '/feed/curation/space-strandgade-moonlight-v1.webp', ARRAY['/feed/curation/space-strandgade-moonlight-v1.webp'], '[{"image":"/feed/curation/space-strandgade-moonlight-v1.webp","title":"오늘의 공간","text":"빌헬름 함메르쇠이 ==「달빛, 스트란가데 30번지」==(1900–06)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"상처는\n빛이 네 안으로 들어오는 자리다\n— 루미","x":0.5,"y":0.19,"size":0.056,"color":"cream","font":"song","align":"center","style":"plain"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '9 hours'),
  ('curation-05', 'sorow-curator', '오늘의 하늘', '존 컨스터블 ==「주교의 정원에서 본 솔즈베리 대성당」==(1825년경)
메트로폴리탄 미술관 소장', 0, '/feed/curation/sky-salisbury-v1.webp', ARRAY['/feed/curation/sky-salisbury-v1.webp'], '[{"image":"/feed/curation/sky-salisbury-v1.webp","title":"오늘의 하늘","text":"존 컨스터블 ==「주교의 정원에서 본 솔즈베리 대성당」==(1825년경)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"언젠가 이 일들마저\n기쁘게 떠올릴 날이 오리라\n— 베르길리우스, 『아이네이스』","x":0.5,"y":0.2,"size":0.048,"color":"white","font":"hahmlet","align":"center","style":"dim"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '12 hours'),
  ('curation-06', 'sorow-curator', '오늘의 공간', '피터르 더 호흐 ==「젊은 부부가 있는 실내」==(1662–65년경)
메트로폴리탄 미술관 소장', 0, '/feed/curation/space-young-couple-v1.webp', ARRAY['/feed/curation/space-young-couple-v1.webp'], '[{"image":"/feed/curation/space-young-couple-v1.webp","title":"오늘의 공간","text":"피터르 더 호흐 ==「젊은 부부가 있는 실내」==(1662–65년경)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"영혼은\n그 생각의 빛깔로 물든다\n— 마르쿠스 아우렐리우스, 『명상록』","x":0.5,"y":0.18,"size":0.05,"color":"cream","font":"hahmlet","align":"center","style":"plain"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '15 hours'),
  ('curation-07', 'sorow-curator', '오늘의 하늘', '알프레드 시슬레 ==「아침 햇살 속 사위르 초원」==(1894)
메트로폴리탄 미술관 소장', 0, '/feed/curation/sky-sahurs-morning-v1.webp', ARRAY['/feed/curation/sky-sahurs-morning-v1.webp'], '[{"image":"/feed/curation/sky-sahurs-morning-v1.webp","title":"오늘의 하늘","text":"알프레드 시슬레 ==「아침 햇살 속 사위르 초원」==(1894)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"천 리 길도\n발밑의 한 걸음에서 시작된다\n— 노자, 『도덕경』","x":0.5,"y":0.2,"size":0.058,"color":"white","font":"pen","align":"center","style":"dim"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '18 hours'),
  ('curation-08', 'sorow-curator', '오늘의 공간', '요하네스 페르메이르 ==「류트를 든 젊은 여인」==(1662–63년경)
메트로폴리탄 미술관 소장', 0, '/feed/curation/space-lute-v1.webp', ARRAY['/feed/curation/space-lute-v1.webp'], '[{"image":"/feed/curation/space-lute-v1.webp","title":"오늘의 공간","text":"요하네스 페르메이르 ==「류트를 든 젊은 여인」==(1662–63년경)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"이미 잃어버린 것을 슬퍼하느라\n아직 내게 남아 있는 것까지 잃지 마라\n— 세네카","x":0.5,"y":0.17,"size":0.04,"color":"white","font":"serif","align":"center","style":"dim"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '21 hours'),
  ('curation-09', 'sorow-curator', '오늘의 하늘', '우타가와 히로시게 ==「간바라의 저녁 눈」==, 『도카이도 53역참』(1833–34년경)
메트로폴리탄 미술관 소장', 0, '/feed/curation/sky-kanbara-snow-v1.webp', ARRAY['/feed/curation/sky-kanbara-snow-v1.webp'], '[{"image":"/feed/curation/sky-kanbara-snow-v1.webp","title":"오늘의 하늘","text":"우타가와 히로시게 ==「간바라의 저녁 눈」==, 『도카이도 53역참』(1833–34년경)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"날이 추워진 뒤에야\n소나무와 잣나무가 늦게 시듦을 안다\n— 공자, 『논어』","x":0.5,"y":0.2,"size":0.046,"color":"white","font":"song","align":"center","style":"dim"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '24 hours'),
  ('curation-10', 'sorow-curator', '오늘의 공간', '빈센트 반 고흐 ==「장미」==(1890)
메트로폴리탄 미술관 소장', 0, '/feed/curation/space-roses-v1.webp', ARRAY['/feed/curation/space-roses-v1.webp'], '[{"image":"/feed/curation/space-roses-v1.webp","title":"오늘의 공간","text":"빈센트 반 고흐 ==「장미」==(1890)\n메트로폴리탄 미술관 소장","ratio":0.5625,"overlays":[{"text":"부드럽고 약한 것이\n굳세고 강한 것을 이긴다\n— 노자, 『도덕경』","x":0.5,"y":0.17,"size":0.058,"color":"ink","font":"pen","align":"center","style":"plain"}]}]'::jsonb, CURRENT_TIMESTAMP - INTERVAL '27 hours');
