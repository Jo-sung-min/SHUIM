/**
 * 소로우 아이콘 찾기에 넣을 Microsoft Fluent UI System Icons (MIT) 고르기.
 * 한 줄: "fluent 이름|한글 이름|찾기 낱말 (띄어쓰기로)". 24px Regular, 없으면 20px Regular 를 쓴다.
 * 바꾼 뒤 `node frontend/scripts/fluent-icons/build.mjs` 로 frontend/lib/fluent-icons 와 서버 목록을 다시 만든다.
 */
export const CATEGORIES = [
  {
    id: "mind", label: "마음", icons: `
heart|하트|사랑 마음 좋아 love
heart_broken|깨진 하트|이별 상처 슬픔 실연 아픔
heart_circle|동그란 하트|마음 사랑 응원
heart_pulse|두근두근|설렘 심장 떨림
emoji|웃는 얼굴|기쁨 행복 미소 스마일
emoji_smile_slight|살짝 미소|괜찮아 평온 잔잔
emoji_laugh|활짝 웃음|기쁨 재미 하하
emoji_sparkle|반짝이는 얼굴|설렘 기대 신남
emoji_sad|슬픈 얼굴|슬픔 우울 눈물 울적
emoji_sad_slight|시무룩|서운 아쉬움 속상
emoji_meh|무덤덤|지침 무기력 그저그래 번아웃
emoji_angry|화난 얼굴|분노 짜증 스트레스 화
emoji_surprise|놀란 얼굴|깜짝 당황
emoji_hand|인사하는 얼굴|안녕 반가워
drop|눈물방울|눈물 울음 슬픔 물방울
sparkle|반짝임|희망 빛 기대 반짝
lightbulb|전구|생각 아이디어 깨달음
brain|뇌|생각 고민 정신 마음건강
chat_multiple_heart|따뜻한 대화|위로 공감 대화 말
person_heart|마음 쓰는 사람|돌봄 배려 위로 다정
home_heart|따뜻한 집|가족 집 그리움 고향
board_heart|마음 게시판|응원 메시지
`,
  },
  {
    id: "people", label: "사람", icons: `
people|두 사람|함께 우리 친구 커플
people_community|모임|공동체 커뮤니티 함께 동호회
people_team|여럿|팀 동료 친구들
people_audience|청중|관객 모임 강연
person|한 사람|나 혼자 싱글 1인
person_walking|걷는 사람|산책 걷기 출근
person_support|돕는 사람|도움 상담 지원
person_voice|말하는 사람|목소리 이야기 말하기
person_feedback|의견 나누는 사람|대화 의견 피드백
person_chat|대화하는 사람|수다 상담
person_lightbulb|생각하는 사람|고민 아이디어
person_star|빛나는 사람|칭찬 자랑 자존감
person_home|집에 있는 사람|집순이 집돌이 재택 자취
handshake|악수|화해 약속 협력 동업
hand_wave|손 인사|안녕 반가워 인사
hand_left|손바닥|손 하이파이브 멈춤
thumb_like|좋아요|최고 응원 엄지 칭찬
chat|말풍선|대화 이야기 수다
chat_multiple|대화|수다 이야기 단톡
comment|댓글|말 이야기 한마디
mail|편지|메일 소식 편지쓰기
send|보내기|전하기 전송 연락
megaphone|확성기|외침 소리 알림 홍보
accessibility|사람 모양|접근성 몸
wheelchair_access|휠체어|장애 이동 배리어프리
`,
  },
  {
    id: "food", label: "음식", icons: `
food|식사|밥 음식 식당 맛집 미식 포크 나이프
food_cake|케이크|생일 디저트 빵 베이킹 축하
cookies|쿠키|과자 간식 디저트 베이킹
food_toast|토스트|빵 아침 브런치
food_egg|달걀|계란 요리 아침 자취요리
food_apple|사과|과일 건강 다이어트
food_carrot|당근|채소 비건 건강
food_grains|곡식|쌀 밥 농사 귀농
food_fish|생선|물고기 회 낚시 해산물
food_chicken_leg|치킨|닭다리 야식 치맥
food_pizza|피자|야식 배달 파티
bowl_chopsticks|그릇과 젓가락|밥 국수 라면 한식 혼밥
bowl_salad|샐러드|다이어트 건강 채소
drink_coffee|커피|카페 라떼 아메리카노 차 티
drink_to_go|테이크아웃 컵|카페 음료 출근 커피
drink_beer|맥주|술 한잔 퇴근 치맥
drink_wine|와인|술 한잔 분위기
drink_margarita|칵테일|술 바 혼술
`,
  },
  {
    id: "play", label: "취미", icons: `
games|게임|게임기 패드 플레이 콘솔
puzzle_piece|퍼즐|조각 맞추기 보드게임
chess|체스|보드게임 장기 바둑 전략
lottery|복권|행운 추첨 로또
music_note_1|음표|음악 노래 멜로디
music_note_2|음악|노래 플레이리스트 음악감상
headphones|헤드폰|음악 듣기 이어폰 팟캐스트
headphones_sound_wave|소리 듣기|음악 오디오 asmr
guitar|기타|악기 연주 밴드 공연
mic|마이크|노래 노래방 방송 말하기
movies_and_tv|영화와 TV|드라마 영화 시리즈 넷플릭스
filmstrip|필름|영화 영상 시네마
video_clip|영상|유튜브 브이로그 촬영 편집
camera|카메라|사진 촬영 출사
paint_brush|붓|그림 미술 수채화
color|팔레트|색 그림 미술 디자인
design_ideas|그리기|디자인 드로잉 아이디어
pen|펜|글쓰기 일기 필사 작가
book_open|펼친 책|독서 책 소설 읽기
book|책|독서 공부 북클럽
library|책장|도서관 책 수집
ticket_diagonal|티켓|공연 콘서트 덕질 뮤지컬 전시
sticker|스티커|꾸미기 다이어리 다꾸
balloon|풍선|축하 파티 기념일
teddy|곰 인형|인형 장난감 아기 포근
glasses|안경|독서 공부 너드
`,
  },
  {
    id: "move", label: "운동·건강", icons: `
sport|운동|스포츠 공 체육
sport_soccer|축구|공 풋살 응원
sport_basketball|농구|공 농구장
sport_baseball|야구|공 직관 응원
sport_american_football|럭비|미식축구 공
sport_hockey|하키|아이스하키 빙상
run|달리기|러닝 조깅 마라톤
dumbbell|덤벨|헬스 근력 운동 피트니스
swimming_pool|수영|수영장 물놀이
vehicle_bicycle|자전거|라이딩 사이클 따릉이
trophy|트로피|우승 목표 대회
medal|메달|성취 완주 메달
pulse|맥박|건강 심박 체크
pill|약|약 치료 병원 복용
stethoscope|청진기|병원 진료 검진
doctor|의사|병원 진료 의료 간호
briefcase_medical|구급 가방|응급 의료 구급
sleep|잠|수면 졸림 불면 꿀잠
`,
  },
  {
    id: "nature", label: "자연·동물", icons: `
weather_sunny|해|맑음 햇살 여름 해님
weather_sunny_low|해돋이|일출 일몰 노을 아침
weather_moon|달|밤 새벽 불면 야간
weather_partly_cloudy_day|구름 낀 해|흐림 날씨 구름
weather_cloudy|구름|흐림 날씨
weather_rain|비|장마 빗소리 우울
weather_drizzle|이슬비|비 가랑비
weather_thunderstorm|천둥|번개 폭풍 혼란
weather_snowflake|눈송이|겨울 눈 크리스마스
weather_snow|눈|겨울 눈오는날
weather_fog|안개|흐릿 막막
leaf_one|잎 하나|새싹 시작 처음
leaf_two|새싹|성장 식물 반려식물 가드닝
leaf_three|세 잎|클로버 행운 식물
tree_deciduous|나무|숲 산책 공원 자연
tree_evergreen|소나무|숲 겨울 크리스마스트리
plant_grass|풀|들판 잔디 캠핑
plant_cattail|부들|물가 갈대 강
earth|지구|세상 환경 세계
earth_leaf|초록 지구|환경 비건 제로웨이스트
planet|행성|우주 별 천문
water|물|바다 강 물결 수영
fire|불꽃|열정 캠프파이어 불멍
animal_dog|강아지|반려견 개 산책 댕댕이
animal_cat|고양이|반려묘 냥이 집사
animal_rabbit|토끼|반려동물 토깽이
animal_turtle|거북이|느림 천천히 반려동물
animal_paw_print|발자국|반려동물 펫 반려생활
bug|벌레|곤충 자연 관찰
`,
  },
  {
    id: "work", label: "일·공부", icons: `
briefcase|서류 가방|회사 직장 출근 회사원
laptop|노트북|재택 개발 프리랜서 카공
desktop|모니터|컴퓨터 사무실 사무직
code|코드|개발 프로그래밍 개발자
building|빌딩|회사 사무실 도시
building_shop|가게|자영업 장사 사장님 가게
building_factory|공장|생산직 현장 교대 근무
calculator|계산기|회계 숫자 가계부
calendar|달력|일정 하루 계획
clock|시계|시간 출퇴근 야근
timer|타이머|집중 공부 뽀모도로
hourglass|모래시계|기다림 시간 버티기
clipboard|클립보드|할 일 업무 체크
notebook|공책|필기 노트 공부
note|메모|기록 메모 끄적
document|문서|서류 이력서 자소서
backpack|책가방|학교 학생 통학 여행
hat_graduation|학사모|졸업 대학 시험 수험생
beaker|비커|과학 실험 연구 대학원
ruler|자|공부 설계 제도
presenter|발표|강의 수업 선생님 교사
whiteboard|칠판|수업 강의 학원
money|돈|월급 돈 용돈
savings|저금통|저축 재테크 짠테크
wallet|지갑|돈 소비 가계
cart|장바구니|쇼핑 마트 장보기
shopping_bag|쇼핑백|쇼핑 구매 득템
toolbox|공구함|수리 현장 기술
wrench|렌치|정비 수리 기술직
vehicle_truck|트럭|배달 운송 물류 택배
scales|저울|법 공정 균형 고민
`,
  },
  {
    id: "travel", label: "여행·장소", icons: `
airplane|비행기|여행 해외 출장
airplane_take_off|이륙|떠나기 출국 여행
luggage|여행 가방|캐리어 여행 짐
globe|지구본|세계 해외 외국
map|지도|여행 길 동네
location|위치|장소 동네 핀 지역
compass_northwest|나침반|방향 길찾기 진로
beach|바닷가|바다 휴가 해변 파라솔 여름
tent|텐트|캠핑 야영 차박
mountain_trail|산길|등산 트레킹 하이킹 산
mountain_location_top|산 정상|정상 등산 목표
building_lighthouse|등대|바다 빛 길잡이
city|도시|서울 도심 빌딩숲
home|집|집 자취 동네 독립
vehicle_car|자동차|드라이브 운전 출퇴근
vehicle_bus|버스|출퇴근 통학 대중교통
vehicle_subway|지하철|출퇴근 지옥철 통근
vehicle_ship|배|바다 항해 섬
vehicle_motorcycle|오토바이|라이딩 배달 바이크
vehicle_cable_car|케이블카|여행 산 관광
umbrella|우산|비 장마 보호
flag|깃발|목표 도착 시작
ticket_horizontal|승차권|기차 여행 표
`,
  },
  {
    id: "life", label: "생활", icons: `
bed|침대|잠 휴식 자취방 이불
broom|빗자루|청소 정리 집안일
washer|세탁기|빨래 집안일 자취
tv|텔레비전|티비 예능 드라마
phone|휴대폰|전화 폰 연락 통화
key|열쇠|집 자취 이사 독립
door|문|집 문 새 시작
window|창문|바깥 하늘 환기
gift|선물|선물 고마움 축하 생일
gift_open|열린 선물|깜짝 축하 기념일
box|상자|택배 이사 정리
archive|보관함|추억 정리 보관
alert|종|알림 소식
clock_alarm|알람|아침 기상 미라클모닝
battery_charge|충전|에너지 회복 쉼
battery_1|방전|지침 번아웃 피곤
lightbulb_filament|백열등|분위기 조명 집꾸미기
calendar_clock|하루 일정|루틴 습관 일상
receipt|영수증|소비 가계부 지출
`,
  },
  {
    id: "symbol", label: "모양", icons: `
star|별|꿈 반짝 소원
star_emphasis|빛나는 별|중요 강조 최고
crown|왕관|최고 자존감 1등
diamond|다이아몬드|보석 소중 귀중
ribbon|리본|기념 응원 캠페인
ribbon_star|별 리본|수상 자랑 칭찬
bookmark|책갈피|저장 기억 표시
tag|태그|이름표 꼬리표
shield|방패|지킴 보호 안전
lock_closed|자물쇠|비밀 안전 잠금
flash|번개|에너지 빠름 힘
rocket|로켓|도전 시작 꿈 창업
target|과녁|목표 집중 다짐
wand|요술봉|마법 소원 바람
pin|핀|고정 기억 중요
eye|눈|보기 관찰 지켜보기
cube|정육면체|상자 블록 모양
puzzle_cube|큐브|퍼즐 큐브 머리
circle|동그라미|원 모양 둥근
square|네모|사각형 모양
triangle|세모|삼각형 모양
mention|골뱅이|언급 이름 부르기
`,
  },
];
