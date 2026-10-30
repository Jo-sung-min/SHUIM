-- 즐기고 살아가는 소로우: 신분·직함(회사원·공무원·대학생)보다 즐기는 일, 살아가는 일, 사람의 근본 고민으로 모이는 소로우를 더한다.
-- 미식·여행·운동·덕질·책·게임(즐기는 중), 자취·출퇴근·반려생활·새벽(살아가는 중),
-- 싱글·모솔·이별·이혼·돌싱·외로움(사랑·혼자). 자영업·육아는 V21 에 이미 있다.
-- 소로우마다 사연 2개(#1·#2)와 위로 댓글, 힘내요를 샘플로 넣는다 (id 가 lc-·lsp-·lsc- 로 시작).
-- 둘러보기는 연 순서대로라, 이 소로우들이 맨 앞에 오도록 V21 소로우보다 하루 이르게 연다.
-- kind: enjoy(즐기는 중) | live(살아가는 중) | love(사랑·혼자)

INSERT INTO communities (id, slug, name, name_key, kind, domain, verified, join_mode, visibility, intro, notice, created_by, post_seq, sample, created_at) VALUES
  ('lc-food', 'food', '미식 소로우', '미식소로우', 'enjoy', NULL, FALSE, 'open', 'public', '맛있는 걸 찾아다니고, 먹는 걸로 하루를 버티는 사람들', '가게 이름은 써도 돼요. 사장님 저격은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days'),
  ('lc-travel', 'travel', '여행 소로우', '여행소로우', 'enjoy', NULL, FALSE, 'open', 'public', '떠나는 걸로 숨 쉬는 사람들. 떠나지 못하는 날의 이야기도', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '1 minute'),
  ('lc-living-alone', 'living-alone', '자취 소로우', '자취소로우', 'live', NULL, FALSE, 'open', 'public', '혼자 밥 짓고, 혼자 아프고, 혼자 버티는 사람들', '사는 동네가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '2 minutes'),
  ('lc-workout', 'workout', '운동 소로우', '운동소로우', 'enjoy', NULL, FALSE, 'open', 'public', '땀 흘리며 버티는 사람들. 작심삼일도 환영해요', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '3 minutes'),
  ('lc-commute', 'commute', '출퇴근 소로우', '출퇴근소로우', 'live', NULL, FALSE, 'open', 'public', '매일 같은 길을 오가는 사람들. 지하철, 버스, 운전대 위에서', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '4 minutes'),
  ('lc-fandom', 'fandom', '덕질 소로우', '덕질소로우', 'enjoy', NULL, FALSE, 'open', 'public', '좋아하는 게 있어서 오늘을 사는 사람들', '다른 팬덤을 깎아내리는 사연은 올리지 않아요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '5 minutes'),
  ('lc-pets', 'pets', '반려생활 소로우', '반려생활소로우', 'live', NULL, FALSE, 'open', 'public', '털 뭉치와 함께 사는 사람들. 기쁨도 병원비도 같이', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '6 minutes'),
  ('lc-books', 'books', '책 소로우', '책소로우', 'enjoy', NULL, FALSE, 'open', 'public', '책 속으로 잠깐 숨는 사람들. 쌓아 두기만 해도 괜찮아요', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '7 minutes'),
  ('lc-games', 'games', '게임 소로우', '게임소로우', 'enjoy', NULL, FALSE, 'open', 'public', '한 판만 더를 외치는 사람들', '닉네임·아이디가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '8 minutes'),
  ('lc-sleepless', 'sleepless', '새벽 소로우', '새벽소로우', 'live', NULL, FALSE, 'open', 'public', '잠 못 드는 새벽을 보내는 사람들', '새벽 사연은 아침에 올라갈 수 있어요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '9 minutes'),
  ('lc-single', 'single', '싱글 소로우', '싱글소로우', 'love', NULL, FALSE, 'open', 'public', '혼자인 지금을 살아가는 사람들. ''너는 언제?''에 지친 날의 이야기도', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '10 minutes'),
  ('lc-never-dated', 'never-dated', '모솔 소로우', '모솔소로우', 'love', NULL, FALSE, 'open', 'public', '아직 연애를 해 보지 않은 사람들. 늦은 게 아니라 아직인 거예요', '놀리거나 훈계하는 댓글은 가려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '11 minutes'),
  ('lc-breakup', 'breakup', '이별 소로우', '이별소로우', 'love', NULL, FALSE, 'open', 'public', '헤어지고 하루하루를 지나는 사람들', '상대가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '12 minutes'),
  ('lc-divorce', 'divorce', '이혼 소로우', '이혼소로우', 'love', NULL, FALSE, 'open', 'public', '이혼을 고민하거나 지나는 중인 사람들', '상대·아이가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '13 minutes'),
  ('lc-re-single', 're-single', '돌싱 소로우', '돌싱소로우', 'love', NULL, FALSE, 'open', 'public', '다시 혼자가 된 뒤의 삶을 꾸려 가는 사람들', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '14 minutes'),
  ('lc-lonely', 'lonely', '외로움 소로우', '외로움소로우', 'love', NULL, FALSE, 'open', 'public', '사람들 사이에서도, 혼자서도 외로운 사람들. 잠깐 앉았다 가요', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '31 days' + INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;

-- 멤버: demo 가 연 사람, 샘플 유저는 소로우마다 대략 3명 중 2명꼴
INSERT INTO community_members (community_id, user_id, role, status, joined_at)
SELECT c.id, 'demo', 'owner', 'active', c.created_at FROM communities c WHERE c.id LIKE 'lc-%'
ON CONFLICT DO NOTHING;
INSERT INTO community_members (community_id, user_id, role, status, joined_at)
SELECT c.id, u.id, 'member', 'active', c.created_at + INTERVAL '1 day'
  FROM communities c CROSS JOIN users u
 WHERE c.id LIKE 'lc-%'
   AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7')
   AND (abs(hashtext(c.id || u.id)) % 3) <> 0
ON CONFLICT DO NOTHING;

-- 사연 (#1·#2). 화면에는 'OO 소로우 #번호'로만 보인다
INSERT INTO shout_posts (id, author_id, cat, text, images, community_id, post_no, created_at) VALUES
  ('lsp-food-1', 's06', 'misfortune', '세 시간 줄 서서 들어간 맛집이 제 앞에서 재료 소진이었어요. 사장님이 미안하다고 사탕을 주셨어요. 사탕은 맛있었어요.', '{}', 'lc-food', 1, CURRENT_TIMESTAMP - INTERVAL '47 hours'),
  ('lsp-food-2', 'u3', 'small-win', '혼밥 고깃집 첫 도전 성공. 2인분부터라 2인분 시켰고, 다 먹었어요. 오늘은 저를 칭찬하기로 했어요.', '{}', 'lc-food', 2, CURRENT_TIMESTAMP - INTERVAL '5 hours'),
  ('lsp-travel-1', 's10', 'money', '다음 달 여행 가려고 모은 돈이 이번 달 카드값으로 사라졌어요. 캐리어만 현관에 서 있어요.', '{}', 'lc-travel', 1, CURRENT_TIMESTAMP - INTERVAL '62 hours'),
  ('lsp-travel-2', 'u1', 'anxiety', '여행 가서도 일 메신저 알림이 신경 쓰여요. 바다 앞에서 휴대폰만 보다가 왔어요.', '{}', 'lc-travel', 2, CURRENT_TIMESTAMP - INTERVAL '21 hours'),
  ('lsp-living-alone-1', 's11', 'body', '아파서 누웠는데 물 떠다 줄 사람이 없어요. 배달 앱으로 죽을 시키면서 조금 울었어요.', '{}', 'lc-living-alone', 1, CURRENT_TIMESTAMP - INTERVAL '38 hours'),
  ('lsp-living-alone-2', 's03', 'small-win', '처음으로 김치찌개를 끓였는데 엄마 맛이 났어요. 전화해서 자랑했더니 엄마가 더 좋아하셨어요.', '{}', 'lc-living-alone', 2, CURRENT_TIMESTAMP - INTERVAL '8 hours'),
  ('lsp-workout-1', 's04', 'body', '헬스장 석 달 끊고 나간 날이 나흘이에요. 하루 단가를 계산하다가 운동보다 마음이 더 아파졌어요.', '{}', 'lc-workout', 1, CURRENT_TIMESTAMP - INTERVAL '70 hours'),
  ('lsp-workout-2', 's07', 'small-win', '처음으로 5km를 안 쉬고 뛰었어요. 기록은 느렸지만 끝까지 간 게 처음이에요.', '{}', 'lc-workout', 2, CURRENT_TIMESTAMP - INTERVAL '14 hours'),
  ('lsp-commute-1', 's05', 'body', '왕복 세 시간이에요. 지하철에서 서서 졸다가 무릎이 꺾였는데, 다들 못 본 척해 줘서 고마웠어요.', '{}', 'lc-commute', 1, CURRENT_TIMESTAMP - INTERVAL '55 hours'),
  ('lsp-commute-2', 'u2', 'anxiety', '일요일 저녁만 되면 월요일 출근길이 미리 무거워요. 아직 일요일인데요.', '{}', 'lc-commute', 2, CURRENT_TIMESTAMP - INTERVAL '26 hours'),
  ('lsp-fandom-1', 's02', 'relation', '좋아하는 가수 콘서트 티켓팅에 또 실패했어요. 친구들은 ''그게 뭐라고'' 하는데, 저한텐 한 달을 버틸 이유였어요.', '{}', 'lc-fandom', 1, CURRENT_TIMESTAMP - INTERVAL '44 hours'),
  ('lsp-fandom-2', 'u7', 'free', '최애가 잘되는 게 기쁜데, 점점 멀어지는 것 같아서 조금 쓸쓸해요. 이런 마음이 이상한 건가요.', '{}', 'lc-fandom', 2, CURRENT_TIMESTAMP - INTERVAL '11 hours'),
  ('lsp-pets-1', 's10', 'anxiety', '강아지가 나이 들어 산책 거리가 점점 줄어요. 오늘은 골목 끝에서 돌아왔어요. 그 골목이 자꾸 생각나요.', '{}', 'lc-pets', 1, CURRENT_TIMESTAMP - INTERVAL '33 hours'),
  ('lsp-pets-2', 's04', 'money', '고양이 병원비 영수증을 보고 제 밥은 일주일째 라면이에요. 그래도 걔가 밥을 잘 먹으니 됐어요.', '{}', 'lc-pets', 2, CURRENT_TIMESTAMP - INTERVAL '6 hours'),
  ('lsp-books-1', 's12', 'anxiety', '책 사는 속도가 읽는 속도를 이긴 지 오래예요. 쌓인 책을 보면 숙제 같아서 더 못 펴요.', '{}', 'lc-books', 1, CURRENT_TIMESTAMP - INTERVAL '58 hours'),
  ('lsp-books-2', 'u5', 'small-win', '오늘 출근길에 20쪽 읽었어요. 휴대폰 대신 책을 편 게 몇 달 만인지 모르겠어요.', '{}', 'lc-books', 2, CURRENT_TIMESTAMP - INTERVAL '17 hours'),
  ('lsp-games-1', 's08', 'misfortune', '연패 중이라 오늘은 한 판만 하자 했는데 새벽 세 시예요. 졌어요. 잘게요.', '{}', 'lc-games', 1, CURRENT_TIMESTAMP - INTERVAL '36 hours'),
  ('lsp-games-2', 'u4', 'relation', '같이 게임하던 친구들이 하나둘 바빠져서 이제 저 혼자 접속해요. 친구 목록 초록불이 저 하나예요.', '{}', 'lc-games', 2, CURRENT_TIMESTAMP - INTERVAL '9 hours'),
  ('lsp-sleepless-1', 's09', 'anxiety', '새벽 네 시인데 내일 할 일을 머릿속으로 열 번째 연습 중이에요. 잠은 연습이 안 돼요.', '{}', 'lc-sleepless', 1, CURRENT_TIMESTAMP - INTERVAL '29 hours'),
  ('lsp-sleepless-2', 'u1', 'free', '다들 자는 시간에 깨어 있으면 세상에 나만 남은 것 같아요. 그래서 여기 적어요. 누구 깨어 있나요.', '{}', 'lc-sleepless', 2, CURRENT_TIMESTAMP - INTERVAL '2 hours'),
  ('lsp-single-1', 's07', 'relation', '결혼식 축가 부탁이 이번 달만 세 번이에요. 노래 실력은 늘어 가는데 제 차례는 안 와요.', '{}', 'lc-single', 1, CURRENT_TIMESTAMP - INTERVAL '53 hours'),
  ('lsp-single-2', 'u5', 'free', '혼자 사는 게 좋은데 명절만 되면 ''너는 언제?''가 따라와요. 지금이 좋다고 열 번째 말하는 중이에요.', '{}', 'lc-single', 2, CURRENT_TIMESTAMP - INTERVAL '13 hours'),
  ('lsp-never-dated-1', 's12', 'anxiety', '연애를 한 번도 안 해 봤다고 하면 다들 놀라요. 놀라는 얼굴을 보는 게 연애를 안 한 것보다 더 힘들어요.', '{}', 'lc-never-dated', 1, CURRENT_TIMESTAMP - INTERVAL '41 hours'),
  ('lsp-never-dated-2', 's02', 'small-win', '소개팅 나가서 처음으로 두 시간 넘게 대화했어요. 애프터는 없었지만 저는 오늘 꽤 잘했어요.', '{}', 'lc-never-dated', 2, CURRENT_TIMESTAMP - INTERVAL '10 hours'),
  ('lsp-breakup-1', 'u7', 'misfortune', '헤어진 지 한 달. 습관처럼 ''집 도착''을 보내려다 손을 멈췄어요. 그 짧은 문장이 제일 어려워요.', '{}', 'lc-breakup', 1, CURRENT_TIMESTAMP - INTERVAL '35 hours'),
  ('lsp-breakup-2', 's03', 'body', '이별하고 밥맛이 없다가, 오늘 처음으로 한 그릇을 다 비웠어요. 조금씩 돌아오는 중인가 봐요.', '{}', 'lc-breakup', 2, CURRENT_TIMESTAMP - INTERVAL '4 hours'),
  ('lsp-divorce-1', 's05', 'anxiety', '이혼 서류를 책상 서랍에 넣어 둔 지 두 달이에요. 꺼낼 용기도, 버릴 용기도 아직 없어요.', '{}', 'lc-divorce', 1, CURRENT_TIMESTAMP - INTERVAL '64 hours'),
  ('lsp-divorce-2', 'u2', 'relation', '아이한테 어떻게 말해야 할지 매일 밤 문장을 고쳐요. 어떤 말로 해도 아플까 봐 겁나요.', '{}', 'lc-divorce', 2, CURRENT_TIMESTAMP - INTERVAL '19 hours'),
  ('lsp-re-single-1', 's09', 'relation', '다시 혼자가 된 지 1년. 주말에 갈 곳이 없어서 마트를 두 바퀴 돌았어요. 그래도 장바구니는 제 취향으로만 채웠어요.', '{}', 'lc-re-single', 1, CURRENT_TIMESTAMP - INTERVAL '50 hours'),
  ('lsp-re-single-2', 'u6', 'anxiety', '새로운 사람을 만나도 돌싱이라는 걸 언제 말해야 할지 몰라서 자꾸 대화가 멈춰요.', '{}', 'lc-re-single', 2, CURRENT_TIMESTAMP - INTERVAL '15 hours'),
  ('lsp-lonely-1', 's11', 'misfortune', '하루 종일 한마디도 안 했다는 걸 밤에 알았어요. 편의점에서 ''봉투 필요 없어요''가 오늘 한 말 전부였어요.', '{}', 'lc-lonely', 1, CURRENT_TIMESTAMP - INTERVAL '30 hours'),
  ('lsp-lonely-2', 's01', 'free', '사람들 사이에 있어도 외로운 날이 있어요. 오늘이 그런 날이라 여기 잠깐 앉았다 갈게요.', '{}', 'lc-lonely', 2, CURRENT_TIMESTAMP - INTERVAL '3 hours')
ON CONFLICT DO NOTHING;

-- 위로 댓글
INSERT INTO comments (id, post_kind, post_id, author_id, text, created_at)
SELECT v.id, 'post', v.post_id, v.author_id, v.text, p.created_at + (v.mins || ' minutes')::interval FROM (VALUES
  ('lsc-1', 'lsp-food-1', 's01', '세 시간의 보상이 사탕이라니… 다음엔 꼭 오픈런 성공해요', '22'),
  ('lsc-2', 'lsp-food-2', 's09', '혼고기 2인분 완식은 진짜 칭찬받을 일이에요', '31'),
  ('lsc-3', 'lsp-travel-1', 'u4', '캐리어가 기다려 줄 거예요. 다음 달엔 꼭 같이 나가요', '40'),
  ('lsc-4', 'lsp-travel-2', 's12', '바다 앞에서도 알림 보는 마음 알아요. 다음엔 비행기 모드로', '18'),
  ('lsc-5', 'lsp-living-alone-1', 'u5', '혼자 아픈 날이 제일 서러워요. 죽 다 먹고 푹 자요', '27'),
  ('lsc-6', 'lsp-living-alone-2', 's02', '엄마 맛 성공이라니! 레시피 저도 알려 주세요', '36'),
  ('lsc-7', 'lsp-workout-1', 's08', '나흘이라도 간 게 대단해요. 단가 말고 다녀온 날만 세요', '24'),
  ('lsc-8', 'lsp-workout-2', 'u6', '5km 완주 축하해요! 기록은 다음에 따라와요', '45'),
  ('lsc-9', 'lsp-commute-1', 's11', '못 본 척해 준 사람들 덕분에 오늘도 살아남았네요', '19'),
  ('lsc-10', 'lsp-commute-2', 's03', '일요일 저녁의 월요일, 다들 같은 마음이에요', '33'),
  ('lsc-11', 'lsp-fandom-1', 'u2', '그게 뭐라고가 아니라 그게 전부일 때가 있어요. 다음 티켓팅 응원해요', '28'),
  ('lsc-12', 'lsp-fandom-2', 's06', '이상하지 않아요. 좋아하는 만큼 쓸쓸한 거예요', '39'),
  ('lsc-13', 'lsp-pets-1', 's07', '골목 끝까지 같이 간 오늘도 소중한 산책이에요', '25'),
  ('lsc-14', 'lsp-pets-2', 'u3', '라면 먹는 집사님도 꼭 한 끼는 제대로 챙겨요', '42'),
  ('lsc-15', 'lsp-books-1', 'u7', '쌓아 둔 책도 언젠가 펴질 날을 기다리는 중이에요', '20'),
  ('lsc-16', 'lsp-books-2', 's05', '휴대폰 대신 책, 그 20쪽이 제일 멋있어요', '34'),
  ('lsc-17', 'lsp-games-1', 's10', '졌어도 잔 게 이긴 거예요. 푹 자요', '15'),
  ('lsc-18', 'lsp-games-2', 's01', '초록불 하나 여기 더 있어요. 언제 한 판 해요', '47'),
  ('lsc-19', 'lsp-sleepless-1', 'u1', '연습 그만하고 눈만 감고 있어도 쉬는 거래요', '26'),
  ('lsc-20', 'lsp-sleepless-2', 's04', '저 깨어 있어요. 혼자 아니에요', '12'),
  ('lsc-21', 'lsp-single-1', 'u3', '축가 실력 느는 것도 능력이에요. 차례는 원할 때 오면 돼요', '29'),
  ('lsc-22', 'lsp-single-2', 's08', '지금이 좋다는 말, 열 번이고 백 번이고 해도 돼요', '37'),
  ('lsc-23', 'lsp-never-dated-1', 's04', '안 해 본 게 이상한 게 아니에요. 놀라는 쪽이 실례예요', '21'),
  ('lsc-24', 'lsp-never-dated-2', 'u1', '두 시간 대화면 대성공이에요!', '44'),
  ('lsc-25', 'lsp-breakup-1', 's10', '그 손 멈춘 것만으로도 오늘 정말 애썼어요', '26'),
  ('lsc-26', 'lsp-breakup-2', 'u4', '한 그릇 비운 거 축하해요. 천천히 돌아와도 돼요', '18'),
  ('lsc-27', 'lsp-divorce-1', 's06', '서랍 속에 둔 두 달도 고민한 시간이에요. 서두르지 않아도 돼요', '33'),
  ('lsc-28', 'lsp-divorce-2', 's12', '그렇게 고민하는 마음이면 아이도 언젠가 알아줄 거예요', '41'),
  ('lsc-29', 'lsp-re-single-1', 'u5', '내 취향으로만 채운 장바구니, 멋진 주말이에요', '23'),
  ('lsc-30', 'lsp-re-single-2', 's07', '말하고 싶을 때 말해도 돼요. 그 타이밍은 내가 정하는 거예요', '35'),
  ('lsc-31', 'lsp-lonely-1', 'u6', '오늘 여기 한마디 남겼으니 한마디 더 한 거예요', '17'),
  ('lsc-32', 'lsp-lonely-2', 's02', '옆자리에 같이 앉아 있을게요', '9')
) AS v(id, post_id, author_id, text, mins) JOIN shout_posts p ON p.id = v.post_id
ON CONFLICT DO NOTHING;

-- 힘내요: 샘플 유저가 사연마다 대략 3명 중 1명꼴, 댓글에는 5명 중 1명꼴
INSERT INTO cheers (user_id, target_kind, target_id, created_at)
SELECT u.id, 'post', p.id, p.created_at + INTERVAL '40 minutes'
  FROM shout_posts p CROSS JOIN users u
 WHERE p.id LIKE 'lsp-%' AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7') AND u.id <> p.author_id AND (abs(hashtext(p.id || u.id)) % 3) = 0
ON CONFLICT DO NOTHING;
INSERT INTO cheers (user_id, target_kind, target_id, created_at)
SELECT u.id, 'comment', c.id, c.created_at + INTERVAL '30 minutes'
  FROM comments c CROSS JOIN users u
 WHERE c.id LIKE 'lsc-%' AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7') AND u.id <> c.author_id AND (abs(hashtext(c.id || u.id)) % 5) = 0
ON CONFLICT DO NOTHING;
