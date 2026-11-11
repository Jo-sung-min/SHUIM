-- 지금 열려 있는 소로우(기본 소로우 27개)에도 Fluent 아이콘을 넣는다 (2026-11-11 사용자 요청).
-- 이름은 frontend/scripts/fluent-icons/picks.mjs 목록 안에서 고른다 (서버 circle-fluent-icons.txt 와 같다).
-- 소로우지기가 이미 고른 아이콘·올린 사진이 있거나 닫힌 소로우는 건드리지 않는다. 주소가 없으면 아무 일도 하지 않는다.
UPDATE communities AS c
   SET icon = v.icon
  FROM (VALUES
    ('food',           'fl:food'),
    ('travel',         'fl:airplane'),
    ('living-alone',   'fl:home'),
    ('workout',        'fl:dumbbell'),
    ('commute',        'fl:vehicle_subway'),
    ('fandom',         'fl:ticket_diagonal'),
    ('pets',           'fl:animal_paw_print'),
    ('books',          'fl:book_open'),
    ('games',          'fl:games'),
    ('sleepless',      'fl:weather_moon'),
    ('single',         'fl:person'),
    ('never-dated',    'fl:heart'),
    ('breakup',        'fl:heart_broken'),
    ('divorce',        'fl:door'),
    ('re-single',      'fl:leaf_one'),
    ('lonely',         'fl:chat_multiple_heart'),
    ('office',         'fl:briefcase'),
    ('self-employed',  'fl:building_shop'),
    ('freelancer',     'fl:laptop'),
    ('shift-work',     'fl:wrench'),
    ('public-servant', 'fl:building_government'),
    ('college',        'fl:hat_graduation'),
    ('exam',           'fl:notebook'),
    ('job-seeker',     'fl:document'),
    ('resting',        'fl:leaf_two'),
    ('parenting',      'fl:teddy'),
    ('caregiver',      'fl:person_heart')
  ) AS v(slug, icon)
 WHERE c.slug = v.slug
   AND c.icon IS NULL
   AND c.icon_data IS NULL
   AND c.closed_at IS NULL;
