-- 샘플 커뮤니티 소로우: 회사 10 · 대학 10, 소로우마다 사연 3개 + 위로 댓글 + 힘내요.
-- 실제 회사·학교와 관계없는 예시 데이터라 communities.sample = TRUE 로 표시하고(화면에 '샘플'), 메일 인증 표시(verified)는 붙이지 않는다.
-- 사연은 특정 회사·학교에 대한 사실 주장이 아닌 가벼운 일상 이야기만. 시각은 적용 시점 기준 상대값.
-- 지우려면: DELETE FROM comments WHERE id LIKE 'csc-%'; DELETE FROM cheers WHERE target_id LIKE 'csp-%'; DELETE FROM communities WHERE sample;

ALTER TABLE communities ADD COLUMN sample BOOLEAN NOT NULL DEFAULT FALSE;

-- 샘플 유저 (V2 의 demo·u1~u7 + 새 s01~s12)
INSERT INTO users (id, nick, role, created_at) VALUES
  ('demo', '데모', 'admin', CURRENT_TIMESTAMP - INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, nick, role, created_at) VALUES
  ('u1', '느린 구름 27', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u2', '따뜻한 강 58', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u3', '고요한 숲 13', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u4', '흐린 달 71', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u5', '작은 바람 40', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u6', '낮은 돌 09', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u7', '푸른 파도 64', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('s01', '맑은 새벽 12', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s02', '느긋한 별 33', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s03', '단단한 나무 08', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s04', '포근한 눈 51', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s05', '환한 창 26', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s06', '조용한 비 44', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s07', '가벼운 구름 19', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s08', '깊은 바다 72', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s09', '둥근 달 05', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s10', '부드러운 빛 38', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s11', '고운 노을 61', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('s12', '작은 등불 90', 'user', CURRENT_TIMESTAMP - INTERVAL '20 days')
ON CONFLICT (id) DO NOTHING;

-- 소로우 (연 사람 = demo)
INSERT INTO communities (id, slug, name, name_key, kind, domain, verified, join_mode, visibility, intro, notice, created_by, post_seq, sample, created_at) VALUES
  ('cs-samsung', 'samsung', '삼성전자 소로우', '삼성전자소로우', 'company', 'samsung.com', FALSE, 'domain', 'public', '반도체부터 가전까지, 같은 사원증 목걸이를 건 사람들의 사연함', '부서·실명이 드러나는 사연은 가려서 올려요', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '14 days'),
  ('cs-skhynix', 'skhynix', 'SK하이닉스 소로우', 'sk하이닉스소로우', 'company', 'skhynix.com', FALSE, 'domain', 'public', '클린룸 안팎의 이야기', '교대근무 하시는 분들, 새벽 사연도 환영해요', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '15 days'),
  ('cs-hyundai-motor', 'hyundai-motor', '현대자동차 소로우', '현대자동차소로우', 'company', 'hyundai.com', FALSE, 'domain', 'public', '차를 만드는 사람들의 진짜 이야기', '특정인을 저격하는 사연은 올리지 않아요', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '16 days'),
  ('cs-lg-elec', 'lg-elec', 'LG전자 소로우', 'lg전자소로우', 'company', 'lge.com', FALSE, 'domain', 'public', '가전처럼 매일 곁에 있는 사연들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '17 days'),
  ('cs-naver', 'naver', '네이버 소로우', '네이버소로우', 'company', 'navercorp.com', FALSE, 'domain', 'public', '초록창 뒤의 사람들', '코드 리뷰에 지친 날, 털어놓고 가요', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '18 days'),
  ('cs-kakao', 'kakao', '카카오 소로우', '카카오소로우', 'company', 'kakaocorp.com', FALSE, 'domain', 'public', '숫자 1이 사라지길 기다리는 사람들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '19 days'),
  ('cs-coupang', 'coupang', '쿠팡 소로우', '쿠팡소로우', 'company', 'coupang.com', FALSE, 'domain', 'public', '새벽을 달리는 사람들의 사연', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('cs-toss', 'toss', '토스 소로우', '토스소로우', 'company', 'toss.im', FALSE, 'domain', 'public', '버튼 하나에 진심인 사람들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '21 days'),
  ('cs-baemin', 'baemin', '배달의민족 소로우', '배달의민족소로우', 'company', 'woowahan.com', FALSE, 'domain', 'public', '오늘 뭐 먹지를 진지하게 고민하는 사람들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '22 days'),
  ('cs-cj-cheiljedang', 'cj-cheiljedang', 'CJ제일제당 소로우', 'cj제일제당소로우', 'company', 'cj.net', FALSE, 'domain', 'public', '밥상 뒤의 사연들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '23 days'),
  ('cs-snu', 'snu', '서울대 소로우', '서울대소로우', 'school', 'snu.ac.kr', FALSE, 'domain', 'public', '관악의 언덕을 오르는 사람들', '시험 기간엔 서로 힘내요 넉넉히 눌러 주세요', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '24 days'),
  ('cs-yonsei', 'yonsei', '연세대 소로우', '연세대소로우', 'school', 'yonsei.ac.kr', FALSE, 'domain', 'public', '백양로를 걷는 사람들의 사연함', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '25 days'),
  ('cs-korea-univ', 'korea-univ', '고려대 소로우', '고려대소로우', 'school', 'korea.ac.kr', FALSE, 'domain', 'public', '안암의 호랑이들이 털어놓는 곳', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '26 days'),
  ('cs-kaist', 'kaist', 'KAIST 소로우', 'kaist소로우', 'school', 'kaist.ac.kr', FALSE, 'domain', 'public', '과제와 거위 사이에서', '새벽 사연 많아요. 일단 주무세요', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '27 days'),
  ('cs-postech', 'postech', 'POSTECH 소로우', 'postech소로우', 'school', 'postech.ac.kr', FALSE, 'domain', 'public', '바닷바람 부는 캠퍼스의 사연들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '28 days'),
  ('cs-skku', 'skku', '성균관대 소로우', '성균관대소로우', 'school', 'skku.edu', FALSE, 'domain', 'public', '명륜과 율전을 오가는 사람들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '29 days'),
  ('cs-hanyang', 'hanyang', '한양대 소로우', '한양대소로우', 'school', 'hanyang.ac.kr', FALSE, 'domain', 'public', '길 잃는 것도 추억이 되는 곳', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '30 days'),
  ('cs-sogang', 'sogang', '서강대 소로우', '서강대소로우', 'school', 'sogang.ac.kr', FALSE, 'domain', 'public', '작아서 더 가까운 사람들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '31 days'),
  ('cs-cau', 'cau', '중앙대 소로우', '중앙대소로우', 'school', 'cau.ac.kr', FALSE, 'domain', 'public', '흑석의 언덕을 오르내리는 사람들', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '32 days'),
  ('cs-khu', 'khu', '경희대 소로우', '경희대소로우', 'school', 'khu.ac.kr', FALSE, 'domain', 'public', '봄이면 꽃보다 사람이 많은 곳', '', 'demo', 3, TRUE, CURRENT_TIMESTAMP - INTERVAL '33 days')
ON CONFLICT DO NOTHING;

-- 멤버: demo 가 연 사람, 샘플 유저 10명은 모든 소로우에, 나머지 9명은 소로우마다 대략 4명 중 3명꼴
INSERT INTO community_members (community_id, user_id, role, status, verified_at, joined_at)
SELECT c.id, 'demo', 'owner', 'active', NULL, c.created_at FROM communities c WHERE c.sample
ON CONFLICT DO NOTHING;
INSERT INTO community_members (community_id, user_id, role, status, verified_at, joined_at)
SELECT c.id, u.id, 'member', 'active', NULL, c.created_at + INTERVAL '1 day'
  FROM communities c CROSS JOIN users u
 WHERE c.sample
   AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7')
   AND (u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10') OR (abs(hashtext(c.id || u.id)) % 4) <> 0)
ON CONFLICT DO NOTHING;

-- 사연 (#1~#3). 작성자는 샘플 유저지만 화면에는 'OO 소로우 #번호'로만 보인다
INSERT INTO shout_posts (id, author_id, cat, text, images, community_id, post_no, created_at) VALUES
  ('csp-samsung-1', 's01', 'work', '신입 3주 차. 사내 메신저로 동기한테 ''팀장님 오늘 기분 좋아 보임ㅋㅋ'' 보낸다는 게 팀장님한테 갔어요. 답장이 ''감사합니다^^'' 였는데 이게 제일 무서워요.', '{}', 'cs-samsung', 1, CURRENT_TIMESTAMP - INTERVAL '31 hours'),
  ('csp-samsung-2', 's08', 'small-win', '오늘 셔틀 놓칠 뻔했는데 기사님이 10초 기다려 주셨어요. 뛰어서 타는 순간 버스 안에서 작은 박수가 나왔어요. 출근하자마자 하루치 체력 다 썼지만 기분은 최고.', '{}', 'cs-samsung', 2, CURRENT_TIMESTAMP - INTERVAL '17 hours'),
  ('csp-samsung-3', 'u3', 'free', '구내식당 메뉴 보는 게 하루 낙인데 오늘 두 코너 다 맛있어 보여서 10분 고민했어요. 그 사이 줄이 끝까지 길어져서 결국 샐러드. 인생이 이래요.', '{}', 'cs-samsung', 3, CURRENT_TIMESTAMP - INTERVAL '3 hours'),
  ('csp-skhynix-1', 's04', 'body', '방진복 다 입고 들어갔는데 화장실 가고 싶을 때의 절망. 아는 사람만 이 글에 힘내요 눌러 주세요.', '{}', 'cs-skhynix', 1, CURRENT_TIMESTAMP - INTERVAL '56 hours'),
  ('csp-skhynix-2', 's11', 'relation', '엄마가 친척들한테 ''우리 애가 반도체 만든다''고 자랑하셨대요. 저는 엑셀 만드는데요… 그래도 엄마 목소리가 너무 신나 보여서 정정 안 했어요.', '{}', 'cs-skhynix', 2, CURRENT_TIMESTAMP - INTERVAL '36 hours'),
  ('csp-skhynix-3', 'u6', 'small-win', '야간 근무 끝나고 아침에 퇴근하는데 해 뜨는 게 너무 예뻐서 사진 찍었어요. 다들 출근할 때 저는 퇴근. 오늘은 이게 특권 같아요.', '{}', 'cs-skhynix', 3, CURRENT_TIMESTAMP - INTERVAL '16 hours'),
  ('csp-hyundai-motor-1', 's07', 'relation', '명절마다 친척들이 ''차 좀 싸게 사 줄 수 있지?'' 물어봐요. 삼촌, 저도 할부 갚는 중이에요.', '{}', 'cs-hyundai-motor', 1, CURRENT_TIMESTAMP - INTERVAL '81 hours'),
  ('csp-hyundai-motor-2', 'u2', 'work', '신차 공개 영상을 사무실에서 같이 봤는데 옆자리 선배가 조용히 울고 있었어요. 3년 동안 그 차에 들어가는 부품 하나 붙잡고 있던 분이래요. 저도 언젠가 저렇게 울어 보고 싶어요.', '{}', 'cs-hyundai-motor', 2, CURRENT_TIMESTAMP - INTERVAL '55 hours'),
  ('csp-hyundai-motor-3', 's02', 'free', '주차장에서 내 차 찾는데 같은 모델 같은 색이 일곱 대. 리모컨 누르면서 주차장을 한 바퀴 돌았어요. 회사 주차장의 숙명.', '{}', 'cs-hyundai-motor', 3, CURRENT_TIMESTAMP - INTERVAL '29 hours'),
  ('csp-lg-elec-1', 's10', 'free', '집 가전을 다 우리 회사 걸로 맞췄는데 냉장고만 결혼할 때 장모님이 사 주신 다른 브랜드예요. 매일 아침 그 냉장고 열 때마다 묘한 기분이 들어요.', '{}', 'cs-lg-elec', 1, CURRENT_TIMESTAMP - INTERVAL '106 hours'),
  ('csp-lg-elec-2', 'u5', 'work', '회의에서 ''고객 입장에서 생각해 보면요'' 했더니 다들 고개를 끄덕였어요. 근데 저 사실 그 제품 아직 안 써 봤어요. 오늘 퇴근길에 매장 들러 볼게요.', '{}', 'cs-lg-elec', 2, CURRENT_TIMESTAMP - INTERVAL '74 hours'),
  ('csp-lg-elec-3', 's05', 'small-win', '입사 1년. 처음으로 제 이름이 들어간 보고서가 위로 올라갔어요. 별거 아닌데 화장실에서 혼자 주먹 쥐었어요.', '{}', 'cs-lg-elec', 3, CURRENT_TIMESTAMP - INTERVAL '42 hours'),
  ('csp-naver-1', 'u1', 'anxiety', '코드 리뷰 코멘트가 47개 달렸어요. 다 맞는 말이라 더 아파요. 그래도 하나씩 고치니까 47이 12가 됐어요.', '{}', 'cs-naver', 1, CURRENT_TIMESTAMP - INTERVAL '131 hours'),
  ('csp-naver-2', 's01', 'small-win', '점심시간에 사내 도서관에서 책 30쪽 읽었어요. 입사하고 처음이에요. 늘 ''나중에 읽어야지'' 했던 그 책.', '{}', 'cs-naver', 2, CURRENT_TIMESTAMP - INTERVAL '93 hours'),
  ('csp-naver-3', 's08', 'free', '검색 관련 회의 들어갔다가 혹시 내 검색 기록이 화면에 뜰까 봐 혼자 식은땀. 아무도 제 검색 기록 안 본다는 거 알아요. 그래도요.', '{}', 'cs-naver', 3, CURRENT_TIMESTAMP - INTERVAL '55 hours'),
  ('csp-kakao-1', 'u4', 'relation', '단톡방에서 읽씹 당한 기분일 때 ''이 숫자 1, 우리 회사가 만든 건데…'' 생각하면 혼자 웃음이 나요.', '{}', 'cs-kakao', 1, CURRENT_TIMESTAMP - INTERVAL '36 hours'),
  ('csp-kakao-2', 's04', 'work', '회사에서 서로 영어 이름으로 부르다 보니 이제 엄마가 제 본명을 부르면 순간 누군지 모르겠어요.', '{}', 'cs-kakao', 2, CURRENT_TIMESTAMP - INTERVAL '22 hours'),
  ('csp-kakao-3', 's11', 'free', '출근길 지하철에서 옆 사람이 우리 앱을 쓰다가 ''아 이거 왜 이래'' 하는데 너무 찔려서 다음 역에서 내렸어요. 제 담당도 아닌데.', '{}', 'cs-kakao', 3, CURRENT_TIMESTAMP - INTERVAL '8 hours'),
  ('csp-coupang-1', 'u7', 'money', '새벽에 시킨 게 아침에 문 앞에 와 있으면 감탄하는데, 월말에 카드 명세서 보면 그 감탄이 반성으로 바뀌어요.', '{}', 'cs-coupang', 1, CURRENT_TIMESTAMP - INTERVAL '61 hours'),
  ('csp-coupang-2', 's07', 'work', '숫자 하나에 다들 엄청 진지해요. 오늘은 소수점 둘째 자리 때문에 회의 40분. 그래도 그 소수점이 맞았을 때의 쾌감이란.', '{}', 'cs-coupang', 2, CURRENT_TIMESTAMP - INTERVAL '41 hours'),
  ('csp-coupang-3', 'u2', 'small-win', '물류센터 견학을 다녀왔어요. 상자 하나가 집까지 가는 길에 이렇게 많은 손을 거치는 줄 몰랐어요. 오늘 받은 택배 상자를 괜히 한 번 쓰다듬었어요.', '{}', 'cs-coupang', 3, CURRENT_TIMESTAMP - INTERVAL '21 hours'),
  ('csp-toss-1', 's03', 'work', '버튼 문구를 ''보내기''로 할지 ''송금하기''로 할지 회의만 세 번. 엄마는 그냥 ''그거 눌러''라고 하세요.', '{}', 'cs-toss', 1, CURRENT_TIMESTAMP - INTERVAL '86 hours'),
  ('csp-toss-2', 's10', 'money', '금융 회사 다니는데 제 통장은 금융 문맹 수준이에요. 내일부터 가계부 씁니다 (N번째).', '{}', 'cs-toss', 2, CURRENT_TIMESTAMP - INTERVAL '60 hours'),
  ('csp-toss-3', 'u5', 'small-win', '제가 고친 화면을 친구가 써 보더니 ''이거 편해졌네?'' 했어요. 출시 노트보다 그 한마디가 더 좋았어요.', '{}', 'cs-toss', 3, CURRENT_TIMESTAMP - INTERVAL '34 hours'),
  ('csp-baemin-1', 's06', 'free', '배달 앱 만드는 회사 다니면서 퇴근하자마자 또 배달 시키는 나. 이건 직업윤리일까요, 직업병일까요.', '{}', 'cs-baemin', 1, CURRENT_TIMESTAMP - INTERVAL '111 hours'),
  ('csp-baemin-2', 'u1', 'work', '리뷰 이벤트 문구 쓰다가 ''맛있어요'' 비슷한 말을 23개 찾았어요. 오늘 저녁은 ''감칠맛 폭발''로 정했습니다.', '{}', 'cs-baemin', 2, CURRENT_TIMESTAMP - INTERVAL '79 hours'),
  ('csp-baemin-3', 's01', 'relation', '동생이 우리 회사 앱으로 치킨을 시켜 줬어요. 쿠폰은 제 거 썼더라고요. 그래도 같이 먹으니 좋았어요.', '{}', 'cs-baemin', 3, CURRENT_TIMESTAMP - INTERVAL '47 hours'),
  ('csp-cj-cheiljedang-1', 's09', 'free', '신제품 시식 담당이 됐어요. 행복할 줄 알았는데 만두 14종을 먹고 나니 오후 내내 말이 없어졌어요.', '{}', 'cs-cj-cheiljedang', 1, CURRENT_TIMESTAMP - INTERVAL '136 hours'),
  ('csp-cj-cheiljedang-2', 'u4', 'relation', '자취하는 동생한테 즉석밥 한 박스 보냈더니 ''회사에서 공짜로 받은 거지?'' 하는 답장. 내 돈 주고 산 거야…', '{}', 'cs-cj-cheiljedang', 2, CURRENT_TIMESTAMP - INTERVAL '98 hours'),
  ('csp-cj-cheiljedang-3', 's04', 'small-win', '명절 선물세트 포장 아이디어가 채택됐어요. 마트에서 그 상자 보고 사진 찍다가 직원분이랑 눈이 마주쳤어요.', '{}', 'cs-cj-cheiljedang', 3, CURRENT_TIMESTAMP - INTERVAL '60 hours'),
  ('csp-snu-1', 's12', 'body', '셔틀 줄이 너무 길어서 걸어 올라갔어요. 강의실에 도착하니 수업 끝나기 10분 전. 관악산이 저를 단련시키고 있어요.', '{}', 'cs-snu', 1, CURRENT_TIMESTAMP - INTERVAL '41 hours'),
  ('csp-snu-2', 'u7', 'anxiety', '다들 뭐 하나씩은 엄청 잘하는 것 같은데 저만 평범한 것 같아요. 근데 이 글 쓰다 보니, 다들 그렇게 생각하는 거 아닐까 싶기도 해요.', '{}', 'cs-snu', 2, CURRENT_TIMESTAMP - INTERVAL '27 hours'),
  ('csp-snu-3', 's07', 'small-win', '중앙도서관에서 아침 9시부터 밤 10시까지 버텼어요. 공부는 4시간 했지만 버틴 건 13시간이니까요.', '{}', 'cs-snu', 3, CURRENT_TIMESTAMP - INTERVAL '13 hours'),
  ('csp-yonsei-1', 'u3', 'free', '연고전 끝나고 목이 쉬어서 다음 날 발표를 속삭이면서 했어요. 교수님이 ''다음엔 마이크 쓰세요'' 하셨어요.', '{}', 'cs-yonsei', 1, CURRENT_TIMESTAMP - INTERVAL '66 hours'),
  ('csp-yonsei-2', 's03', 'relation', '같은 과 동기랑 백양로를 걷다가 고백할까 말까 왕복 세 번 했어요. 결국 못 했고 다리만 아파요.', '{}', 'cs-yonsei', 2, CURRENT_TIMESTAMP - INTERVAL '46 hours'),
  ('csp-yonsei-3', 's10', 'small-win', '신촌에서 처음으로 혼밥 해 봤어요. 생각보다 아무도 안 봐요. 다음엔 고깃집 도전.', '{}', 'cs-yonsei', 3, CURRENT_TIMESTAMP - INTERVAL '26 hours'),
  ('csp-korea-univ-1', 'u6', 'free', '고연전 응원가 연습하다가 자던 룸메이트가 깨서 같이 불렀어요. 우리 기숙사 방은 오늘부로 응원단입니다.', '{}', 'cs-korea-univ', 1, CURRENT_TIMESTAMP - INTERVAL '91 hours'),
  ('csp-korea-univ-2', 's06', 'money', '막걸리 약속이 이번 달에만 일곱 번. 통장이 호랑이에서 고양이가 되어 가요.', '{}', 'cs-korea-univ', 2, CURRENT_TIMESTAMP - INTERVAL '65 hours'),
  ('csp-korea-univ-3', 'u1', 'anxiety', '4학년인데 아직 뭘 하고 싶은지 모르겠어요. 중앙광장 잔디에 누워 있으면 괜찮을 것 같다가, 일어나면 다시 불안해져요.', '{}', 'cs-korea-univ', 3, CURRENT_TIMESTAMP - INTERVAL '39 hours'),
  ('csp-kaist-1', 's02', 'free', '캠퍼스 거위한테 길을 비켜 줬어요. 거위는 고맙다는 말도 없이 지나갔어요. 이 학교 서열 1위는 거위입니다.', '{}', 'cs-kaist', 1, CURRENT_TIMESTAMP - INTERVAL '116 hours'),
  ('csp-kaist-2', 's09', 'body', '과제 마감 세 개가 같은 날이라 이틀 동안 4시간 잤어요. 오늘은 일찍 잘 거예요. 이 글 쓰는 지금 새벽 3시.', '{}', 'cs-kaist', 2, CURRENT_TIMESTAMP - INTERVAL '84 hours'),
  ('csp-kaist-3', 'u4', 'small-win', '처음으로 코드가 한 번에 돌아갔어요. 너무 이상해서 오히려 버그 찾느라 한 시간 썼어요. 버그 없었어요.', '{}', 'cs-kaist', 3, CURRENT_TIMESTAMP - INTERVAL '52 hours'),
  ('csp-postech-1', 's05', 'free', '포항 바닷바람에 우산이 뒤집어졌어요. 이번 학기에만 세 개째. 이제 우비 입고 다녀요.', '{}', 'cs-postech', 1, CURRENT_TIMESTAMP - INTERVAL '81 hours'),
  ('csp-postech-2', 's12', 'relation', '학교가 작아서 헤어진 사람을 하루에 다섯 번 마주쳐요. 오늘은 학생식당 같은 줄. 메뉴도 같은 거 골랐어요.', '{}', 'cs-postech', 2, CURRENT_TIMESTAMP - INTERVAL '43 hours'),
  ('csp-postech-3', 'u7', 'small-win', '기숙사 친구랑 바다까지 걸어갔다 왔어요. 연구실 밖 세상이 이렇게 넓었네요.', '{}', 'cs-postech', 3, CURRENT_TIMESTAMP - INTERVAL '5 hours'),
  ('csp-skku-1', 's08', 'body', '캠퍼스 오가는 셔틀에서 잠들었다가 종점에서 깼어요. 수업은 반대편 캠퍼스였어요.', '{}', 'cs-skku', 1, CURRENT_TIMESTAMP - INTERVAL '46 hours'),
  ('csp-skku-2', 'u3', 'work', '인턴 면접에서 ''본인을 한 단어로 표현하면?'' 질문에 긴장해서 ''성실…균관대''라고 했어요. 붙었어요. 왜죠.', '{}', 'cs-skku', 2, CURRENT_TIMESTAMP - INTERVAL '32 hours'),
  ('csp-skku-3', 's03', 'small-win', '은행나무 길에서 은행 한 번도 안 밟고 강의실까지 갔어요. 이번 가을 최대의 업적.', '{}', 'cs-skku', 3, CURRENT_TIMESTAMP - INTERVAL '18 hours'),
  ('csp-hanyang-1', 's11', 'free', '건물이 너무 많아서 2학년인데 아직도 길을 잃어요. 오늘은 처음 보는 강의실에 들어갔는데 다른 과 수업이었어요. 끝까지 들었어요.', '{}', 'cs-hanyang', 1, CURRENT_TIMESTAMP - INTERVAL '71 hours'),
  ('csp-hanyang-2', 'u6', 'relation', '조별과제 단톡방에 ''다들 바쁘시죠? 제가 할게요'' 보냈더니 1분 만에 모두 답장했어요. 고맙다는 말만요.', '{}', 'cs-hanyang', 2, CURRENT_TIMESTAMP - INTERVAL '51 hours'),
  ('csp-hanyang-3', 's06', 'small-win', '역에서 학교까지 한 번도 안 쉬고 걸어 올라갔어요. 숨은 찼지만 뿌듯해요.', '{}', 'cs-hanyang', 3, CURRENT_TIMESTAMP - INTERVAL '31 hours'),
  ('csp-sogang-1', 'u2', 'free', '학교가 작아서 아는 사람을 하루에 스무 번 만나요. 인사하다가 하루가 끝나요.', '{}', 'cs-sogang', 1, CURRENT_TIMESTAMP - INTERVAL '96 hours'),
  ('csp-sogang-2', 's02', 'anxiety', '학점에 동아리에 알바까지. 알바트로스처럼 날고 싶은데 지금은 그냥 바쁜 비둘기예요.', '{}', 'cs-sogang', 2, CURRENT_TIMESTAMP - INTERVAL '70 hours'),
  ('csp-sogang-3', 's09', 'small-win', '도서관 창가 자리를 처음 잡았어요. 공부는 안 하고 노을만 봤는데, 오늘은 그걸로 됐어요.', '{}', 'cs-sogang', 3, CURRENT_TIMESTAMP - INTERVAL '44 hours'),
  ('csp-cau-1', 'u5', 'body', '언덕 덕분에 허벅지가 단단해졌어요. 대학에서 얻은 첫 번째 스펙.', '{}', 'cs-cau', 1, CURRENT_TIMESTAMP - INTERVAL '121 hours'),
  ('csp-cau-2', 's05', 'relation', '과 선배가 밥 사 주면서 ''나도 1학년 때 너처럼 불안했어'' 했어요. 그 말에 마음이 놓였는데, 선배는 지금 더 불안해 보였어요.', '{}', 'cs-cau', 2, CURRENT_TIMESTAMP - INTERVAL '89 hours'),
  ('csp-cau-3', 's12', 'small-win', '연못 앞 벤치에서 처음으로 혼자 도시락 먹었어요. 생각보다 평화로웠어요.', '{}', 'cs-cau', 3, CURRENT_TIMESTAMP - INTERVAL '57 hours'),
  ('csp-khu-1', 's01', 'free', '벚꽃 시즌에 강의실 가는 길에 사진 찍어 달라는 부탁을 다섯 번 받았어요. 정작 제 사진은 한 장도 없어요.', '{}', 'cs-khu', 1, CURRENT_TIMESTAMP - INTERVAL '86 hours'),
  ('csp-khu-2', 's08', 'anxiety', '졸업사진 찍는 선배들 보면서 ''나도 저 날이 올까'' 싶었어요. 오겠죠. 일단 이번 중간고사부터.', '{}', 'cs-khu', 2, CURRENT_TIMESTAMP - INTERVAL '48 hours'),
  ('csp-khu-3', 'u3', 'small-win', '학교 앞 파전집에서 혼자 막걸리 반 병. 사장님이 파전 귀퉁이를 서비스로 주셨어요. 오늘은 성공한 하루.', '{}', 'cs-khu', 3, CURRENT_TIMESTAMP - INTERVAL '10 hours')
ON CONFLICT DO NOTHING;

-- 위로 댓글
INSERT INTO comments (id, post_kind, post_id, author_id, text, created_at)
SELECT v.id, 'post', v.post_id, v.author_id, v.text, p.created_at + (v.mins || ' minutes')::interval FROM (VALUES
  ('csc-1', 'csp-samsung-1', 's04', '''감사합니다^^''는 진짜 무서운 거 맞아요ㅋㅋ 그래도 웃어 주신 걸 거예요', '20'),
  ('csc-2', 'csp-samsung-1', 's09', '저도 비슷한 실수 해 봤는데 다들 금방 잊어요. 살아남으실 거예요', '29'),
  ('csc-3', 'csp-skhynix-1', 'u2', '눌렀습니다. 진심으로.', '38'),
  ('csc-4', 'csp-skhynix-2', 'u7', '엄마 목소리 신나 보였다는 게 왜 이렇게 뭉클하죠', '47'),
  ('csc-5', 'csp-hyundai-motor-1', 's05', '할부 동지 여기 있어요', '56'),
  ('csc-6', 'csp-hyundai-motor-2', 's10', '그 선배님 너무 멋있다… 언젠가 꼭 그런 날 와요', '65'),
  ('csc-7', 'csp-lg-elec-3', 'u3', '화장실 주먹 쥐기 저도 해요. 축하해요!', '74'),
  ('csc-8', 'csp-naver-1', 's01', '47이 12가 된 건 엄청난 거예요. 오늘 퇴근은 당당하게', '20'),
  ('csc-9', 'csp-kakao-1', 's06', '숫자 1 만드신 분… 덕분에 매일 설레고 매일 상처받아요ㅋㅋ', '29'),
  ('csc-10', 'csp-kakao-2', 's11', '본명 불리면 놀라는 거 너무 공감돼요', '38'),
  ('csc-11', 'csp-coupang-3', 'u4', '택배 상자 쓰다듬는 마음이 너무 따뜻해요', '47'),
  ('csc-12', 'csp-toss-1', 's02', '엄마 말씀이 정답이에요. ''그거 눌러''', '56'),
  ('csc-13', 'csp-baemin-1', 's07', '직업윤리 쪽에 한 표. 이건 시장 조사예요', '65'),
  ('csc-14', 'csp-cj-cheiljedang-1', 's12', '만두 14종… 부럽다가 갑자기 배불러졌어요', '74'),
  ('csc-15', 'csp-snu-2', 'u5', '다들 그렇게 생각하는 거 맞아요. 저도요. 평범해도 괜찮아요', '20'),
  ('csc-16', 'csp-snu-3', 's03', '버틴 13시간도 공부예요. 진짜로.', '29'),
  ('csc-17', 'csp-yonsei-1', 's08', '속삭이는 발표 상상하니까 너무 귀엽잖아요', '38'),
  ('csc-18', 'csp-yonsei-2', 'u1', '네 번째 왕복 때는 꼭 말할 수 있을 거예요', '47'),
  ('csc-19', 'csp-korea-univ-1', 'u6', '룸메이트 분 최고. 응원단 입단 축하드려요', '56'),
  ('csc-20', 'csp-korea-univ-3', 's04', '4학년인데 모르는 사람 여기 한 명 더 있어요. 같이 누워요', '65'),
  ('csc-21', 'csp-kaist-1', 's09', '거위 > 교수님 > 학생, 이 서열 맞나요', '74'),
  ('csc-22', 'csp-kaist-3', 'u2', '버그 없을 때가 제일 무서운 거 공감해요ㅋㅋ', '20'),
  ('csc-23', 'csp-postech-2', 'u7', '메뉴까지 같은 건 운명 아닌가요…', '29'),
  ('csc-24', 'csp-skku-2', 's05', '성실…균관대 레전드. 면접관도 웃으셨을 듯', '38'),
  ('csc-25', 'csp-hanyang-1', 's10', '끝까지 들은 게 진짜 멋있어요. 교양 하나 번 거예요', '47'),
  ('csc-26', 'csp-sogang-2', 'u3', '바쁜 비둘기도 날 수 있어요! 힘내요', '56'),
  ('csc-27', 'csp-cau-2', 's01', '선배도 아직 불안하다는 게 왜 이렇게 위로가 되죠', '65'),
  ('csc-28', 'csp-khu-1', 's06', '다음엔 사진 찍어 준 분께 한 장 부탁해 봐요!', '74'),
  ('csc-29', 'csp-khu-3', 's11', '파전 귀퉁이 서비스는 성공한 하루 인증이에요', '20')
) AS v(id, post_id, author_id, text, mins) JOIN shout_posts p ON p.id = v.post_id
ON CONFLICT DO NOTHING;

-- 힘내요: 샘플 유저가 사연마다 대략 3명 중 1명꼴, 댓글에는 5명 중 1명꼴
INSERT INTO cheers (user_id, target_kind, target_id, created_at)
SELECT u.id, 'post', p.id, p.created_at + INTERVAL '40 minutes'
  FROM shout_posts p CROSS JOIN users u
 WHERE p.id LIKE 'csp-%' AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7') AND u.id <> p.author_id AND (abs(hashtext(p.id || u.id)) % 3) = 0
ON CONFLICT DO NOTHING;
INSERT INTO cheers (user_id, target_kind, target_id, created_at)
SELECT u.id, 'comment', c.id, c.created_at + INTERVAL '30 minutes'
  FROM comments c CROSS JOIN users u
 WHERE c.id LIKE 'csc-%' AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7') AND u.id <> c.author_id AND (abs(hashtext(c.id || u.id)) % 5) = 0
ON CONFLICT DO NOTHING;
