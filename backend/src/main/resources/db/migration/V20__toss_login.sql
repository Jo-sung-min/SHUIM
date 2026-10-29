-- 앱인토스 미니앱의 토스 로그인: 토스가 앱마다 다르게 주는 사용자 식별키(userKey). 개인정보는 받지도 저장하지도 않는다
ALTER TABLE users ADD COLUMN toss_user_key VARCHAR(32) UNIQUE;
