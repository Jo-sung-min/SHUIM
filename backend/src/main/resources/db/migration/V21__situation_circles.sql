-- 처지 소로우: 회사·학교 같은 소속 대신 비슷한 처지끼리 큰 틀로 묶어 힘든 점을 털어놓는 곳.
-- 하이닉스 다니는 사람과 쉬는 사람이 나란히 보일 때 소속 이름이 박탈감이 되지 않게, 소속 이름을 단 소로우를 없앤다.
--   1) V19 의 회사·학교 샘플 소로우와 그 사연·댓글·힘내요·신고를 지운다 (실제 사용자가 연 소로우는 없었다)
--   2) 처지 소로우 11개를 서비스(demo 관리자)가 연다. 누구나 가입, 사연은 모두에게 공개
--   3) 소로우마다 사연 2개(#1·#2)와 위로 댓글, 힘내요를 샘플로 넣는다 (id 가 jsp-·jsc- 로 시작)
-- kind: work(일하는 중) | study(준비하는 중) | rest(쉬는 중) | care(돌보는 중)

-- 1) 소속 샘플 소로우 지우기. 게시된 사연(shout_posts)은 소로우와 함께 지워지지만(ON DELETE CASCADE),
--    댓글·힘내요·신고는 글 id 로만 이어져 있어 먼저 지운다 (답글은 parent_id 로 함께 지워진다)
CREATE TEMP TABLE old_circle_posts ON COMMIT DROP AS
  SELECT p.id FROM shout_posts p JOIN communities c ON c.id = p.community_id WHERE c.sample;
CREATE TEMP TABLE old_circle_comments ON COMMIT DROP AS
  SELECT id FROM comments WHERE post_kind = 'post' AND post_id IN (SELECT id FROM old_circle_posts);
DELETE FROM cheers WHERE target_kind = 'comment' AND target_id IN (SELECT id FROM old_circle_comments);
DELETE FROM reports WHERE target_kind = 'comment' AND target_id IN (SELECT id FROM old_circle_comments);
DELETE FROM comments WHERE id IN (SELECT id FROM old_circle_comments);
DELETE FROM cheers WHERE target_kind = 'post' AND target_id IN (SELECT id FROM old_circle_posts);
DELETE FROM reports WHERE target_kind = 'post' AND target_id IN (SELECT id FROM old_circle_posts);
DELETE FROM communities WHERE sample;

-- 2) 처지 소로우 (둘러보기는 연 순서대로라 created_at 으로 순서를 정한다)
INSERT INTO communities (id, slug, name, name_key, kind, domain, verified, join_mode, visibility, intro, notice, created_by, post_seq, sample, created_at) VALUES
  ('jc-office', 'office', '회사원 소로우', '회사원소로우', 'work', NULL, FALSE, 'open', 'public', '출근하고 버티고 퇴근하는 사람들. 회사 이름은 묻지 않아요, 회사원으로만 털어놔요', '회사·부서·실명이 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days'),
  ('jc-self-employed', 'self-employed', '자영업 소로우', '자영업소로우', 'work', NULL, FALSE, 'open', 'public', '가게 문을 열고 닫는 사람들. 매출, 손님, 혼자 짊어진 것들', '가게 이름·위치가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '1 minute'),
  ('jc-freelancer', 'freelancer', '프리랜서 소로우', '프리랜서소로우', 'work', NULL, FALSE, 'open', 'public', '혼자 일하는 사람들. 들쭉날쭉한 일감과 통장, 아무도 모르는 마감', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '2 minutes'),
  ('jc-shift-work', 'shift-work', '현장·교대 소로우', '현장·교대소로우', 'work', NULL, FALSE, 'open', 'public', '몸으로 일하고 밤낮이 바뀌는 사람들', '새벽 사연도 환영해요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '3 minutes'),
  ('jc-public-servant', 'public-servant', '공무원 소로우', '공무원소로우', 'work', NULL, FALSE, 'open', 'public', '민원과 서류 사이에서 버티는 사람들', '기관·부서가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '4 minutes'),
  ('jc-college', 'college', '대학생 소로우', '대학생소로우', 'study', NULL, FALSE, 'open', 'public', '학점, 알바, 진로 사이에서 흔들리는 사람들. 학교 이름은 묻지 않아요', '학교·학과가 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '5 minutes'),
  ('jc-exam', 'exam', '수험생 소로우', '수험생소로우', 'study', NULL, FALSE, 'open', 'public', '시험 하나를 바라보고 버티는 사람들. 수능, 공시, 자격증', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '6 minutes'),
  ('jc-job-seeker', 'job-seeker', '취준생 소로우', '취준생소로우', 'study', NULL, FALSE, 'open', 'public', '서류와 면접 사이에서 기다리는 사람들', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '7 minutes'),
  ('jc-resting', 'resting', '쉬는 중 소로우', '쉬는중소로우', 'rest', NULL, FALSE, 'open', 'public', '일을 쉬거나 멈춘 사람들. 아무것도 하지 않은 날도 괜찮은 곳', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '8 minutes'),
  ('jc-parenting', 'parenting', '육아 소로우', '육아소로우', 'care', NULL, FALSE, 'open', 'public', '아이를 키우며 나를 자꾸 잊게 되는 사람들', '아이 이름·얼굴이 드러나는 부분은 가려서 올려요', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '9 minutes'),
  ('jc-caregiver', 'caregiver', '돌봄 소로우', '돌봄소로우', 'care', NULL, FALSE, 'open', 'public', '아픈 가족 곁을 지키는 사람들', '', 'demo', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '10 minutes')
ON CONFLICT DO NOTHING;

-- 멤버: demo 가 연 사람, 샘플 유저는 소로우마다 대략 3명 중 2명꼴
INSERT INTO community_members (community_id, user_id, role, status, joined_at)
SELECT c.id, 'demo', 'owner', 'active', c.created_at FROM communities c WHERE c.id LIKE 'jc-%'
ON CONFLICT DO NOTHING;
INSERT INTO community_members (community_id, user_id, role, status, joined_at)
SELECT c.id, u.id, 'member', 'active', c.created_at + INTERVAL '1 day'
  FROM communities c CROSS JOIN users u
 WHERE c.id LIKE 'jc-%'
   AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7')
   AND (abs(hashtext(c.id || u.id)) % 3) <> 0
ON CONFLICT DO NOTHING;

-- 3) 사연 (#1·#2). 화면에는 'OO 소로우 #번호'로만 보인다
INSERT INTO shout_posts (id, author_id, cat, text, images, community_id, post_no, created_at) VALUES
  ('jsp-office-1', 's03', 'work', '회의가 회의를 낳는 하루였어요. 정작 제 일은 퇴근하고 집에서 시작해요. 월급이 회의 참석비인가 싶어요.', '{}', 'jc-office', 1, CURRENT_TIMESTAMP - INTERVAL '50 hours'),
  ('jsp-office-2', 'u2', 'anxiety', '팀이 바뀐다는 소문만 3주째예요. 아무도 확실히 말해 주지 않으니 출근길이 매일 시험 보러 가는 길 같아요.', '{}', 'jc-office', 2, CURRENT_TIMESTAMP - INTERVAL '9 hours'),
  ('jsp-self-employed-1', 's06', 'money', '오늘 손님 네 분. 재료값 계산하다가 계산기를 엎어 놨어요. 그래도 내일 또 셔터 올립니다.', '{}', 'jc-self-employed', 1, CURRENT_TIMESTAMP - INTERVAL '70 hours'),
  ('jsp-self-employed-2', 'u4', 'misfortune', '배달 리뷰에 별 하나가 달렸는데 사진을 보니 다른 가게 음식이었어요. 해명 댓글을 썼다 지웠다 한 시간째예요.', '{}', 'jc-self-employed', 2, CURRENT_TIMESTAMP - INTERVAL '20 hours'),
  ('jsp-freelancer-1', 's09', 'money', '작업비 입금이 두 달째 ''이번 주 안에''예요. 독촉 메일을 다섯 번 고쳐 썼어요. 정중하게 화내는 법 아시는 분.', '{}', 'jc-freelancer', 1, CURRENT_TIMESTAMP - INTERVAL '88 hours'),
  ('jsp-freelancer-2', 'u1', 'anxiety', '일이 몰릴 땐 숨이 차고, 끊기면 불안해요. 쉬는 날에도 메일 알림을 못 꺼요.', '{}', 'jc-freelancer', 2, CURRENT_TIMESTAMP - INTERVAL '30 hours'),
  ('jsp-shift-work-1', 's04', 'body', '야간 사흘 하고 주간으로 넘어가는 날이면 몸이 시차 적응 중인 여행객 같아요. 여행은 안 갔는데요.', '{}', 'jc-shift-work', 1, CURRENT_TIMESTAMP - INTERVAL '60 hours'),
  ('jsp-shift-work-2', 'u6', 'small-win', '야간 근무 끝나고 아침에 퇴근하는데 해 뜨는 게 너무 예뻐서 사진 찍었어요. 다들 출근할 때 저는 퇴근. 오늘은 이게 특권 같아요.', '{}', 'jc-shift-work', 2, CURRENT_TIMESTAMP - INTERVAL '6 hours'),
  ('jsp-public-servant-1', 's10', 'work', '같은 분께 같은 설명을 세 번 드렸어요. 네 번째 전화가 오면 녹음해서 틀어 드리고 싶다는 생각을 잠깐 했어요.', '{}', 'jc-public-servant', 1, CURRENT_TIMESTAMP - INTERVAL '75 hours'),
  ('jsp-public-servant-2', 's07', 'relation', '명절마다 ''안정적이라 좋겠다''는 말을 들어요. 맞는 말인데, 그 한마디에 제가 힘든 건 다 지워지는 기분이에요.', '{}', 'jc-public-servant', 2, CURRENT_TIMESTAMP - INTERVAL '26 hours'),
  ('jsp-college-1', 'u7', 'anxiety', '다들 뭐 하나씩은 엄청 잘하는 것 같은데 저만 평범한 것 같아요. 근데 이 글 쓰다 보니, 다들 그렇게 생각하는 거 아닐까 싶기도 해요.', '{}', 'jc-college', 1, CURRENT_TIMESTAMP - INTERVAL '45 hours'),
  ('jsp-college-2', 's02', 'money', '학점에 알바에 조별과제까지. 이번 달 식비가 교재비한테 졌어요. 삼각김밥 나흘째예요.', '{}', 'jc-college', 2, CURRENT_TIMESTAMP - INTERVAL '12 hours'),
  ('jsp-exam-1', 's12', 'anxiety', '스터디카페 같은 자리에 1년째 앉아 있어요. 창밖 계절이 네 번 바뀌는 동안 저만 그대로인 것 같아요.', '{}', 'jc-exam', 1, CURRENT_TIMESTAMP - INTERVAL '80 hours'),
  ('jsp-exam-2', 's05', 'body', '시험 D-40. 잠들려고 누우면 외운 게 머릿속에서 빠져나가는 소리가 들리는 것 같아요.', '{}', 'jc-exam', 2, CURRENT_TIMESTAMP - INTERVAL '15 hours'),
  ('jsp-job-seeker-1', 's08', 'misfortune', '서류 탈락 문자에 이제 아무 감정이 안 생겨요. 그게 더 무서워요. 오늘이 스물세 번째였어요.', '{}', 'jc-job-seeker', 1, CURRENT_TIMESTAMP - INTERVAL '52 hours'),
  ('jsp-job-seeker-2', 'u3', 'relation', '친구들 단톡방에 입사 소식이 올라올 때마다 축하 이모티콘 고르는 데 오래 걸려요. 진심인데, 진심으로만 보이지 않을까 봐요.', '{}', 'jc-job-seeker', 2, CURRENT_TIMESTAMP - INTERVAL '4 hours'),
  ('jsp-resting-1', 's11', 'anxiety', '퇴사하고 석 달. 평일 낮에 마트에 가면 괜히 사람들 눈치가 보여요. 아무도 안 본다는 거 알면서도요.', '{}', 'jc-resting', 1, CURRENT_TIMESTAMP - INTERVAL '40 hours'),
  ('jsp-resting-2', 'u5', 'small-win', '오늘 한 일: 일어나서 이불 개고, 햇빛 10분 쬐었어요. 쉬는 중에도 이 정도면 잘한 거라고 적어 두고 싶었어요.', '{}', 'jc-resting', 2, CURRENT_TIMESTAMP - INTERVAL '3 hours'),
  ('jsp-parenting-1', 's01', 'body', '아이 재우다 같이 잠들고, 새벽에 깨서 설거지해요. 제 하루에 제 시간은 화장실 3분이 전부예요.', '{}', 'jc-parenting', 1, CURRENT_TIMESTAMP - INTERVAL '66 hours'),
  ('jsp-parenting-2', 's06', 'relation', '''너만 키우는 거 아니잖아'' 그 말이 오늘따라 너무 아팠어요. 다들 키우니까, 그래서 다들 힘든 건데요.', '{}', 'jc-parenting', 2, CURRENT_TIMESTAMP - INTERVAL '18 hours'),
  ('jsp-caregiver-1', 'u2', 'misfortune', '엄마 병원 보호자 침대에서 잔 지 2주째예요. 회사에도 괜찮다고 하고, 엄마한테도 괜찮다고 해요. 여기서만 안 괜찮다고 할게요.', '{}', 'jc-caregiver', 1, CURRENT_TIMESTAMP - INTERVAL '58 hours'),
  ('jsp-caregiver-2', 's09', 'small-win', '아버지가 오늘 처음으로 혼자 숟가락을 드셨어요. 별거 아닌데 복도에서 한참 울었어요.', '{}', 'jc-caregiver', 2, CURRENT_TIMESTAMP - INTERVAL '7 hours')
ON CONFLICT DO NOTHING;

-- 위로 댓글
INSERT INTO comments (id, post_kind, post_id, author_id, text, created_at)
SELECT v.id, 'post', v.post_id, v.author_id, v.text, p.created_at + (v.mins || ' minutes')::interval FROM (VALUES
  ('jsc-1', 'jsp-office-1', 's05', '회의 끝나고 진짜 일 시작하는 거 너무 알아요. 오늘은 일찍 덮어요', '24'),
  ('jsc-2', 'jsp-office-2', 's11', '모르는 채로 기다리는 게 제일 지쳐요. 소문 말고 오늘 할 일만 봐요', '35'),
  ('jsc-3', 'jsp-self-employed-1', 'u3', '셔터 올리는 그 손이 제일 대단해요. 내일은 다섯 분 오시길', '18'),
  ('jsc-4', 'jsp-self-employed-2', 's02', '억울한 별 하나… 사진 같이 올려서 짧게 해명하면 다들 알아봐요', '42'),
  ('jsc-5', 'jsp-freelancer-1', 's07', '''확인 부탁드립니다'' 세 번째부터는 날짜를 박아요. 정중한 화의 정석', '30'),
  ('jsc-6', 'jsp-freelancer-2', 'u6', '알림 끄는 날 하나만 정해 봐요. 메일은 내일도 거기 있어요', '51'),
  ('jsc-7', 'jsp-shift-work-1', 's10', '여행 안 가고 시차 적응하는 직업, 공감해요. 오늘은 커튼 꼭 치고 자요', '27'),
  ('jsc-8', 'jsp-shift-work-2', 'u1', '퇴근길 해돋이는 우리만 아는 특권 맞아요', '33'),
  ('jsc-9', 'jsp-public-servant-1', 's03', '세 번 설명한 인내심, 진짜 존경해요', '40'),
  ('jsc-10', 'jsp-public-servant-2', 'u4', '안정적이어도 힘들 수 있어요. 여기서는 그냥 힘들다고 해도 돼요', '22'),
  ('jsc-11', 'jsp-college-1', 'u5', '다들 그렇게 생각하는 거 맞아요. 저도요. 평범해도 괜찮아요', '20'),
  ('jsc-12', 'jsp-college-2', 's12', '삼각김밥 동지예요. 이번 주 하루는 꼭 따뜻한 밥 먹어요', '46'),
  ('jsc-13', 'jsp-exam-1', 's08', '그대로인 것 같아도 버틴 1년은 그대로가 아니에요', '29'),
  ('jsc-14', 'jsp-exam-2', 'u7', '빠져나간 것 같아도 다 남아 있어요. 오늘은 그냥 자요', '38'),
  ('jsc-15', 'jsp-job-seeker-1', 's04', '스물세 번 버틴 마음이 대단해요. 무뎌진 건 지쳐서 그런 거예요', '25'),
  ('jsc-16', 'jsp-job-seeker-2', 's01', '이모티콘 오래 고르는 그 마음이 진심이에요', '31'),
  ('jsc-17', 'jsp-resting-1', 'u2', '평일 낮 마트는 쉬는 사람의 특권이에요. 아무도 안 봐요, 진짜로', '19'),
  ('jsc-18', 'jsp-resting-2', 's09', '이불 개고 햇빛 쬔 거, 오늘 몫으로 충분해요', '15'),
  ('jsc-19', 'jsp-parenting-1', 's11', '화장실 3분… 그 3분이라도 온전히 쉬어요', '44'),
  ('jsc-20', 'jsp-parenting-2', 'u3', '다들 키운다고 덜 힘든 게 아니에요. 오늘 많이 애썼어요', '28'),
  ('jsc-21', 'jsp-caregiver-1', 's05', '여기서는 안 괜찮아도 돼요. 보호자님도 꼭 한 끼 챙겨요', '36'),
  ('jsc-22', 'jsp-caregiver-2', 'u6', '숟가락 드신 그 순간, 저도 같이 울컥했어요', '23')
) AS v(id, post_id, author_id, text, mins) JOIN shout_posts p ON p.id = v.post_id
ON CONFLICT DO NOTHING;

-- 힘내요: 샘플 유저가 사연마다 대략 3명 중 1명꼴, 댓글에는 5명 중 1명꼴
INSERT INTO cheers (user_id, target_kind, target_id, created_at)
SELECT u.id, 'post', p.id, p.created_at + INTERVAL '40 minutes'
  FROM shout_posts p CROSS JOIN users u
 WHERE p.id LIKE 'jsp-%' AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7') AND u.id <> p.author_id AND (abs(hashtext(p.id || u.id)) % 3) = 0
ON CONFLICT DO NOTHING;
INSERT INTO cheers (user_id, target_kind, target_id, created_at)
SELECT u.id, 'comment', c.id, c.created_at + INTERVAL '30 minutes'
  FROM comments c CROSS JOIN users u
 WHERE c.id LIKE 'jsc-%' AND u.id IN ('s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7') AND u.id <> c.author_id AND (abs(hashtext(c.id || u.id)) % 5) = 0
ON CONFLICT DO NOTHING;
