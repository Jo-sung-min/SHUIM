-- 카카오 로그인의 state 를 DB 대신 httpOnly 쿠키에 두게 되어 V8 의 oauth_states 는 쓰지 않는다 (users.kakao_id 는 그대로)
DROP TABLE IF EXISTS oauth_states;
