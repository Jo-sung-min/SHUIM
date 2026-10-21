-- 피드 글 하나 = 콘텐츠 여러 개(사진 + 글). 가로로 넘기면 사진과 글이 함께 바뀐다.
-- pages: [{ "image": "...", "title": "...", "text": "..." }, ...]
ALTER TABLE feed_posts ADD COLUMN pages JSONB NOT NULL DEFAULT '[]';

-- 기존 글: 사진마다 같은 글을 붙여 한 콘텐츠씩 (사진 없으면 글 하나)
UPDATE feed_posts SET pages = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('image', img, 'title', title, 'text', text)), '[]'::jsonb)
    FROM unnest(images) AS img
) WHERE cardinality(images) > 0;
UPDATE feed_posts SET pages = jsonb_build_array(jsonb_build_object('image', NULL, 'title', title, 'text', text)) WHERE cardinality(images) = 0;

-- 샘플: 잎을 떨어뜨린 나무 → 개별 콘텐츠 5개 (사진마다 다른 글)
UPDATE feed_posts SET pages = '[
  {"image": "/feed/one-tree.svg",     "title": "잎을 떨어뜨린 나무", "text": "나무는 잎을 떨어뜨린 걸\n실패라고 부르지 않아요.\n\n내려놓은 만큼\n뿌리를 깊게 내릴 뿐."},
  {"image": "/feed/moon-wave.svg",    "title": "반달에게",          "text": "달은 매일 조금씩 사라지고\n매일 조금씩 돌아와요.\n\n오늘 반쯤 깎인 당신도\n돌아오는 중이에요."},
  {"image": "/feed/mountain-fog.svg", "title": "안개 낀 아침",      "text": "안개는 산을 지우지 않아요.\n잠깐 가릴 뿐.\n\n당신이 걸어온 길도\n거기 그대로 있어요."},
  {"image": "/feed/rain-window.svg",  "title": "창가에서",          "text": "빗방울은 유리를 타고\n알아서 내려가요.\n\n오늘 눈물도\n그렇게 두세요."},
  {"image": "/feed/dawn-stars.svg",   "title": "새벽 네 시",        "text": "가장 어두운 건 새벽 네 시.\n그 시간을 지나본 사람만\n하늘이 보라색으로\n변하는 걸 알아요."}
]'::jsonb WHERE id = 'f11';
