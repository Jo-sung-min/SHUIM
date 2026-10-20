-- 샘플 데이터: 외침 커뮤니티·위로 피드·모금 (lib/community.ts seedCommunity 와 동일한 내용)
-- 시각은 적용 시점 기준 상대값. 실서비스 전환 시 이 마이그레이션은 빼거나 데이터만 지우면 됨.

-- ---------- 유저 ----------
INSERT INTO users (id, nick, role, created_at) VALUES
  ('demo', '데모', 'admin', CURRENT_TIMESTAMP - INTERVAL '30 days'),
  ('u1', '느린 구름 27', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u2', '따뜻한 강 58', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u3', '고요한 숲 13', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u4', '흐린 달 71', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u5', '작은 바람 40', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u6', '낮은 돌 09', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days'),
  ('u7', '푸른 파도 64', 'user', CURRENT_TIMESTAMP - INTERVAL '60 days');

-- ---------- 외침 글 ----------
INSERT INTO shout_posts (id, author_id, cat, text, created_at) VALUES
  ('p1', 'u1', 'misfortune', '오늘 면접 떨어졌어요. 3차까지 갔는데. 집에 오는 길에 비까지 와서 그냥 맞고 걸었어요.', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
  ('p2', 'u4', 'money', '주식 또 봤어요. 안 보기로 해놓고. 보고 나서 손이 떨려서 아무것도 못 했어요.', CURRENT_TIMESTAMP - INTERVAL '5 hours'),
  ('p3', 'u2', 'small-win', '오늘 30분 걸었어요. 3주 만에 처음으로. 그게 다예요.', CURRENT_TIMESTAMP - INTERVAL '7 hours'),
  ('p4', 'u5', 'anxiety', '내일이 두려운 이유를 못 찾겠어요. 그냥 내일이 온다는 게 무서워요.', CURRENT_TIMESTAMP - INTERVAL '11 hours'),
  ('p5', 'u3', 'relation', '엄마한테 괜히 짜증냈어요. 전화 끊고 바로 후회했는데 다시 걸 용기가 안 나요.', CURRENT_TIMESTAMP - INTERVAL '26 hours'),
  ('p6', 'u6', 'body', '4일째 잠을 제대로 못 잤어요. 자려고 누우면 심장이 빨라져요.', CURRENT_TIMESTAMP - INTERVAL '30 hours'),
  ('p7', 'u7', 'free', '이런 데서 징징대봤자 뭐가 바뀜? 그냥 다들 노력을 안 하는 거임. 핑계 그만.', CURRENT_TIMESTAMP - INTERVAL '14 hours'),
  ('p8', 'u4', 'misfortune', '월세 올려달래요. 15만원. 이직도 안 됐는데. 집에 와서 통장 보고 그냥 누웠어요.', CURRENT_TIMESTAMP - INTERVAL '20 hours'),
  ('p9', 'u6', 'misfortune', '엄마 검사 결과가 안 좋대요. 회사에선 티도 못 내고 하루 종일 웃었어요.', CURRENT_TIMESTAMP - INTERVAL '28 hours'),
  ('p10', 'u3', 'misfortune', '5년 사귄 사람이랑 헤어졌어요. 짐 정리하다가 같이 산 컵을 버릴지 말지 30분 고민했어요.', CURRENT_TIMESTAMP - INTERVAL '40 hours'),
  ('p11', 'u5', 'misfortune', '아빠 장례 치르고 첫 출근. 아무도 모르고, 저도 아무 말 안 했어요.', CURRENT_TIMESTAMP - INTERVAL '8 days'),
  ('p12', 'u1', 'misfortune', '전 회사에서 받을 돈 못 받았어요. 노동청 가는 길에 비 맞았고요.', CURRENT_TIMESTAMP - INTERVAL '9 days'),
  ('p13', 'u6', 'misfortune', '강아지가 떠났어요. 12년. 집에 오면 아직 현관에서 기다리는 것 같아요.', CURRENT_TIMESTAMP - INTERVAL '10 days'),
  ('p14', 'u4', 'misfortune', '통장에 4만원. 월급은 열흘 뒤. 라면을 샀는데 계산대에서 카드가 안 됐어요.', CURRENT_TIMESTAMP - INTERVAL '11 days'),
  ('p15', 'demo', 'misfortune', '오늘 주식 수익 50%인데 1년 전 ''100%면 팔자''고 적어둔 메모가 자꾸 생각나요. 팔지도 못하고 들고 있지도 못하겠어요.', CURRENT_TIMESTAMP - INTERVAL '3 hours');

-- ---------- 위로 피드 ----------
INSERT INTO creators (user_id, bio, since) VALUES
  ('u2', '떨어진 날의 사람들에게 쓰는 짧은 글', CURRENT_TIMESTAMP - INTERVAL '40 days'),
  ('u3', '불안을 작게 만드는 문장들', CURRENT_TIMESTAMP - INTERVAL '25 days'),
  ('u5', '잠 못 드는 밤을 위한 글', CURRENT_TIMESTAMP - INTERVAL '12 days'),
  ('u1', '새벽에 쓰는 시', CURRENT_TIMESTAMP - INTERVAL '20 days'),
  ('u4', '떨어뜨린 것들에 대하여', CURRENT_TIMESTAMP - INTERVAL '15 days');

INSERT INTO feed_posts (id, author_id, title, text, bg, image, created_at) VALUES
  ('f1', 'u2', '떨어진 날에게', E'떨어진 날은\n내가 모자란 날이 아니라\n내가 거기까지 걸어간 날이에요.\n\n3차까지 간 사람은\n3차까지 걸어간 사람이에요.', 0, NULL, CURRENT_TIMESTAMP - INTERVAL '90 minutes'),
  ('f2', 'u3', '자를 내려놓기', E'불안은 미래를 재는 자예요.\n자를 내려놓으면\n오늘 한 걸음만 남아요.\n\n오늘은 그 한 걸음만 봐요.', 2, NULL, CURRENT_TIMESTAMP - INTERVAL '4 hours'),
  ('f3', 'u2', NULL, E'주식창을 열지 않은 하루는\n아무 일도 없던 하루가 아니라\n나를 지킨 하루예요.', 3, NULL, CURRENT_TIMESTAMP - INTERVAL '9 hours'),
  ('f4', 'u5', '잠이 안 오는 밤', E'잠이 안 오는 밤엔\n잠을 쫓지 말고\n숨만 세어요.\n넷 들이쉬고, 여섯 내쉬고.\n\n잠은 오지 않아도\n심장은 느려져요.', 1, NULL, CURRENT_TIMESTAMP - INTERVAL '15 hours'),
  ('f5', 'u3', NULL, E'괜히 짜증낸 날,\n미안하다는 말은\n두 글자면 충분해요.\n\n길게 쓰려다 못 보내는 것보다\n두 글자가 먼저예요.', 4, NULL, CURRENT_TIMESTAMP - INTERVAL '27 hours'),
  ('f6', 'u2', '작은 승리에게', E'오늘 30분 걸은 사람에게.\n\n3주 만의 30분은\n30분이 아니라 3주예요.', 5, NULL, CURRENT_TIMESTAMP - INTERVAL '31 hours'),
  ('f7', 'u3', '반달에게', E'달은 매일 조금씩 사라지고\n매일 조금씩 돌아와요.\n\n오늘 반쯤 깎인 당신도\n사라지는 중이 아니라\n돌아오는 중이에요.', 3, '/feed/moon-wave.svg', CURRENT_TIMESTAMP - INTERVAL '36 hours'),
  ('f8', 'u2', '안개 낀 아침', E'안개는 산을 지우지 않아요.\n잠깐 가릴 뿐.\n\n길이 안 보이는 아침에도\n산은 거기 그대로 있어요.\n당신이 걸어온 길도요.', 1, '/feed/mountain-fog.svg', CURRENT_TIMESTAMP - INTERVAL '44 hours'),
  ('f9', 'u5', '창가에서', E'비 오는 날 창가에 앉아\n아무것도 안 해도 돼요.\n\n빗방울은 유리를 타고\n알아서 내려가요.\n오늘 눈물도 그렇게 두세요.', 0, '/feed/rain-window.svg', CURRENT_TIMESTAMP - INTERVAL '52 hours'),
  ('f10', 'u1', '새벽 네 시', E'가장 어두운 건\n새벽 네 시예요.\n\n그 시간을 지나본 사람만\n하늘이 보라색으로\n변하는 걸 알아요.\n\n조금만 더 깨어 있어요.\n곧 보여요.', 3, '/feed/dawn-stars.svg', CURRENT_TIMESTAMP - INTERVAL '60 hours'),
  ('f11', 'u4', '잎을 떨어뜨린 나무', E'나무는 잎을 떨어뜨린 걸\n실패라고 부르지 않아요.\n\n내려놓은 만큼\n뿌리를 깊게 내릴 뿐.\n\n올해 많이 떨어뜨린 당신,\n지금 뿌리를 내리는 중이에요.', 4, '/feed/one-tree.svg', CURRENT_TIMESTAMP - INTERVAL '70 hours'),
  ('f12', 'u2', '어제의 나에게', E'어제의 나를 이기려 하지 말고\n어제의 나를 데리고 가요.\n\n그 사람도 오늘까지 오느라\n애썼으니까.', 0, NULL, CURRENT_TIMESTAMP - INTERVAL '80 hours'),
  ('f13', 'u5', '두 번째 시작', E'시작이 반이라는 말은 틀렸어요.\n시작은 시작이에요.\n\n대신 그 시작을\n오늘 한 번 더 하면\n그게 반이에요.', 2, NULL, CURRENT_TIMESTAMP - INTERVAL '92 hours'),
  ('f14', 'u3', '하고 있나요', E'잘하고 있냐고 묻지 말고\n하고 있냐고 물어요.\n\n하고 있으면\n잘은 나중에 따라와요.', 5, NULL, CURRENT_TIMESTAMP - INTERVAL '100 hours'),
  ('f15', 'u1', '아무것도 못 한 날', E'오늘 아무것도 못 한 날엔\n숨을 쉰 걸로 해요.\n\n그것도 하루치 일이에요.\n몸은 알아요.', 1, NULL, CURRENT_TIMESTAMP - INTERVAL '110 hours'),
  ('f16', 'u4', '오늘 몫만', E'불안은 미래에서 빌려온 고통이에요.\n이자가 비싸요.\n\n오늘 갚을 건\n오늘 몫만.', 3, NULL, CURRENT_TIMESTAMP - INTERVAL '120 hours');

INSERT INTO follows (follower_id, creator_id) VALUES
  ('u1','u2'),('u3','u2'),('u4','u2'),('u5','u2'),('u6','u2'),
  ('u1','u3'),('u2','u3'),('u5','u3'),
  ('u2','u5'),('u6','u5'),
  ('u2','u1'),('u3','u1'),('u4','u1'),
  ('u1','u4'),('u5','u4'),('u6','u4');

INSERT INTO saves (user_id, feed_post_id) VALUES
  ('u1','f1'),('u5','f1'),('u4','f2'),('u1','f3'),('u6','f4'),('u3','f6'),('u5','f6'),
  ('u1','f7'),('u4','f7'),('u5','f8'),('u2','f9'),('u3','f9'),('u3','f10'),('u6','f10'),('u2','f11'),('u7','f11'),
  ('u1','f12'),('u4','f13'),('u1','f14'),('u2','f14'),('u3','f15'),('u2','f16'),('u5','f16'),('u6','f16');

-- ---------- 댓글 ----------
INSERT INTO comments (id, post_kind, post_id, author_id, text, created_at) VALUES
  ('c1', 'post', 'p1', 'u2', '3차까지 간 건 운이 아니에요. 그 회사가 못 알아본 거지, 당신이 모자란 게 아니에요.', CURRENT_TIMESTAMP - INTERVAL '90 minutes'),
  ('c2', 'post', 'p1', 'u3', '비 맞고 걸은 거, 저도 그런 날 있었어요. 오늘은 그냥 따뜻한 물로 씻고 일찍 자요.', CURRENT_TIMESTAMP - INTERVAL '60 minutes'),
  ('c3', 'post', 'p1', 'u7', '그러게 준비를 더 했어야죠. 요즘 취업 쉬운데.', CURRENT_TIMESTAMP - INTERVAL '48 minutes'),
  ('c4', 'post', 'p2', 'u3', '봤다는 걸 여기 적은 것만으로도 다음엔 안 볼 확률이 올라가요. 저도 그랬어요.', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
  ('c5', 'post', 'p3', 'u1', '3주 만에 30분이면 엄청난 거예요. 힘내요 말고 축하해요라고 하고 싶네요.', CURRENT_TIMESTAMP - INTERVAL '6 hours'),
  ('c6', 'post', 'p4', 'u2', '이유가 없어도 무서울 수 있어요. 내일이 오면 내일의 당신이 알아서 할 거예요.', CURRENT_TIMESTAMP - INTERVAL '10 hours'),
  ('c7', 'post', 'p5', 'u4', '지금 ''미안''이라는 두 글자만 문자로 보내도 돼요. 통화는 그다음에.', CURRENT_TIMESTAMP - INTERVAL '25 hours'),
  ('c8', 'post', 'p6', 'u5', '저는 누워서 숨을 4초 들이쉬고 6초 내쉬는 걸 10번 해요. 잠이 안 와도 심장은 좀 느려져요.', CURRENT_TIMESTAMP - INTERVAL '29 hours'),
  ('c_me1', 'post', 'p15', 'u2', '1년 전의 당신이 오늘의 당신을 위해 써둔 메모잖아요. 그 사람 말을 한 번만 들어봐요.', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
  ('c_me2', 'post', 'p15', 'u6', '팔든 안 팔든, 앱을 닫고 산책 한 번 다녀와서 정해도 늦지 않아요.', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
  ('c_me3', 'post', 'p3', 'demo', '3주 만의 30분, 저도 오늘 20분 걸었어요. 같이 가요.', CURRENT_TIMESTAMP - INTERVAL '5 hours'),
  ('c_me4', 'post', 'p3', 'u2', '같이 가요. 내일은 25분 어때요.', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
  ('fc1', 'feed', 'f1', 'u1', '이 글 보고 오늘 처음으로 울었어요. 고마워요.', CURRENT_TIMESTAMP - INTERVAL '72 minutes'),
  ('fc2', 'feed', 'f1', 'u5', '저장해두고 매일 아침 읽을게요.', CURRENT_TIMESTAMP - INTERVAL '54 minutes'),
  ('fc3', 'feed', 'f3', 'u4', '숫자를 안 보는 연습, 저도 같이 할게요.', CURRENT_TIMESTAMP - INTERVAL '8 hours');

-- ---------- 힘내요 ----------
INSERT INTO cheers (user_id, target_kind, target_id) VALUES
  ('u2','post','p1'),('u3','post','p1'),('u5','post','p1'),('u7','post','p1'),
  ('u1','post','p2'),('u3','post','p2'),
  ('u1','post','p3'),('u3','post','p3'),('u4','post','p3'),('u5','post','p3'),('u6','post','p3'),('u7','post','p3'),
  ('u2','post','p4'),('u3','post','p4'),
  ('u1','post','p5'),('u2','post','p5'),('u4','post','p5'),
  ('u2','post','p6'),('u5','post','p6'),
  ('u1','post','p8'),('u2','post','p8'),('u3','post','p8'),('u5','post','p8'),('u6','post','p8'),('u7','post','p8'),
  ('u1','post','p9'),('u2','post','p9'),('u3','post','p9'),('u4','post','p9'),('u5','post','p9'),('u7','post','p9'),('demo','post','p9'),
  ('u1','post','p10'),('u2','post','p10'),('u5','post','p10'),
  ('u1','post','p11'),('u2','post','p11'),('u3','post','p11'),('u4','post','p11'),('u6','post','p11'),('u7','post','p11'),('demo','post','p11'),
  ('u2','post','p12'),('u3','post','p12'),('u4','post','p12'),('u5','post','p12'),
  ('u1','post','p13'),('u2','post','p13'),('u3','post','p13'),('u4','post','p13'),('u5','post','p13'),('u7','post','p13'),
  ('u2','post','p14'),('u3','post','p14'),
  ('u2','post','p15'),('u3','post','p15'),('u5','post','p15'),
  ('u1','comment','c1'),('u3','comment','c1'),('u1','comment','c2'),('u4','comment','c4'),('u2','comment','c5'),('u5','comment','c6'),
  ('u3','comment','c7'),('u1','comment','c7'),('u6','comment','c8'),('u3','comment','c_me1'),('u5','comment','c_me1'),('u2','comment','c_me2'),
  ('u2','comment','c_me3'),('demo','comment','c_me4'),('u2','comment','fc1'),('u4','comment','fc1'),('u2','comment','fc2'),('u3','comment','fc3'),
  ('u1','feed','f1'),('u3','feed','f1'),('u4','feed','f1'),('u5','feed','f1'),('u6','feed','f1'),
  ('u1','feed','f2'),('u2','feed','f2'),('u5','feed','f2'),
  ('u1','feed','f3'),('u4','feed','f3'),('u6','feed','f3'),
  ('u3','feed','f4'),('u6','feed','f4'),
  ('u1','feed','f5'),('u2','feed','f5'),('u4','feed','f5'),
  ('u1','feed','f6'),('u3','feed','f6'),('u4','feed','f6'),('u5','feed','f6'),('u6','feed','f6'),('u7','feed','f6'),
  ('u1','feed','f7'),('u2','feed','f7'),('u4','feed','f7'),('u5','feed','f7'),('u6','feed','f7'),('u7','feed','f7'),('demo','feed','f7'),
  ('u1','feed','f8'),('u3','feed','f8'),('u5','feed','f8'),('u6','feed','f8'),
  ('u2','feed','f9'),('u3','feed','f9'),('u4','feed','f9'),('u7','feed','f9'),
  ('u2','feed','f10'),('u3','feed','f10'),('u4','feed','f10'),('u5','feed','f10'),('u6','feed','f10'),
  ('u1','feed','f11'),('u2','feed','f11'),('u3','feed','f11'),('u5','feed','f11'),('u6','feed','f11'),('u7','feed','f11'),
  ('u1','feed','f12'),('u3','feed','f12'),('u4','feed','f12'),('u5','feed','f12'),
  ('u2','feed','f13'),('u3','feed','f13'),('u6','feed','f13'),('u7','feed','f13'),
  ('u1','feed','f14'),('u2','feed','f14'),('u4','feed','f14'),('u5','feed','f14'),('u6','feed','f14'),
  ('u2','feed','f15'),('u3','feed','f15'),('u4','feed','f15'),('u6','feed','f15'),('u7','feed','f15'),
  ('u1','feed','f16'),('u2','feed','f16'),('u3','feed','f16'),('u5','feed','f16'),('u6','feed','f16'),('u7','feed','f16');

-- ---------- 신고 (p7, c3: 위로가 아닌 글 → 5회 누적) ----------
INSERT INTO reports (id, reporter_id, target_kind, target_id, reason, created_at) VALUES
  ('r1', 'u1', 'post', 'p7', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '13 hours'),
  ('r2', 'u2', 'post', 'p7', 'abuse',       CURRENT_TIMESTAMP - INTERVAL '12 hours'),
  ('r3', 'u3', 'post', 'p7', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '12 hours'),
  ('r4', 'u5', 'post', 'p7', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '10 hours'),
  ('r5', 'u6', 'post', 'p7', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '9 hours'),
  ('r6', 'u1', 'comment', 'c3', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '42 minutes'),
  ('r7', 'u2', 'comment', 'c3', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '36 minutes'),
  ('r8', 'u3', 'comment', 'c3', 'abuse',       CURRENT_TIMESTAMP - INTERVAL '30 minutes'),
  ('r9', 'u4', 'comment', 'c3', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '24 minutes'),
  ('r10','u5', 'comment', 'c3', 'not_comfort', CURRENT_TIMESTAMP - INTERVAL '18 minutes');

-- ---------- 모금 ----------
INSERT INTO donations (id, user_id, amount, message, created_at) VALUES
  ('d1', 'u2', 5000,  '지난주 글 읽고 울었어요. 조금이라도.', CURRENT_TIMESTAMP - INTERVAL '6 hours'),
  ('d2', 'u3', 3000,  NULL, CURRENT_TIMESTAMP - INTERVAL '18 hours'),
  ('d3', 'u7', 10000, '다들 버텨요.', CURRENT_TIMESTAMP - INTERVAL '30 hours'),
  ('d4', 'u1', 1000,  NULL, CURRENT_TIMESTAMP - INTERVAL '44 hours'),
  ('d5', 'u2', 10000, '장례 치르고 출근하신 분께.', CURRENT_TIMESTAMP - INTERVAL '8 days'),
  ('d6', 'u3', 5000,  NULL, CURRENT_TIMESTAMP - INTERVAL '9 days'),
  ('d7', 'u5', 3000,  NULL, CURRENT_TIMESTAMP - INTERVAL '10 days'),
  ('d8', 'u6', 20000, '강아지 보내신 분, 저도 작년에.', CURRENT_TIMESTAMP - INTERVAL '10 days');
