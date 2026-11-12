# 모루 펫 — 첫 구현

홈의 `MoruPet`이 기존 기록 기능 앞에 나타난다. 2D 정수 격자 SVG와 CSS 애니메이션으로 숨쉬기, 눈깜빡임, 반가움, 쓰다듬기, 먹기, 잠자기를 표현한다. WebGL이나 외부 이미지 요청은 없다. 움직임 줄이기 설정을 따른다.

## 사용자 흐름

- 비로그인: 모루를 쓰다듬고 안내를 볼 수 있다. 성장/먹이 저장은 로그인 후 가능하다.
- 로그인: 계정당 모루 한 마리, 시작 먹이 9개. 이름을 1~20자로 변경할 수 있다.
- 홈 → 오늘 마음 남기기 → 마음/크기/이유/한 조각/필요한 것 → 저장.
- 일부 단계만 저장해도 단계당 먹이 1개, 경험치 4. 하루 최대 5개/20 경험치.
- 기록은 기존 비공개 메모장 `mind` 카테고리에 날짜당 한 편으로 저장된다. 삭제/편집도 메모장에서 한다.
- 글쓰기 힘든 날에는 한 조각 단계의 짧은 문장 선택으로 완료할 수 있다.
- 폼을 닫아도 현재 화면에 있는 동안 작성 중 내용은 유지한다. 새로고침 전에 '여기까지 저장'이 필요하다.

## 식사와 성장

- 한국 시간 08/13/19시 자동 식사. 직접 먹이 주기는 아직 먹지 않은 오늘 식사를 앞당긴다.
- 하루 최대 3개 소비. 식사 한 번 +2 경험치. 공급이 충분하고 매일 기록하면 순증 +2개/일.
- 화면을 다시 열거나 활성화하거나 1분마다 서버에서 경과한 식사를 정산한다. 별도 배치 작업 없이도 미접속 기간을 반영한다.
- 재고가 0이면 멈춘다. 과거에 굶은 끼니를 나중에 빚처럼 차감하지 않는다. 당일 미식사는 새 먹이로 채울 수 있다.
- 죽음, 가출, 연속 출석 초기화, 레벨 하락 없음.
- 누적 경험치 경계: 0/20/60/110/170/240/320/420/550/720. Lv.10에서 경험치는 720으로 고정되나 기록/먹이는 계속 가능.
- Lv.5 쿠션과 수면 담요, Lv.10 새싹 꽃. 재고 15/30개에서 선반의 곳간 자루 증가.

## API와 저장

Flyway `V38__moru_pet.sql` 적용이 필요하다. 새 백엔드 실행 시 기존 Flyway 설정으로 반영한다. 운영 배포/운영 DB 변경은 이 구현 작업에 포함되지 않는다.

| API | 역할 |
|---|---|
| GET `/api/pet` | 입양/미접속 식사 정산/현재 상태, 오늘 기록 폼 |
| POST `/api/pet/feed` | `{date, meals}` 비교 후 한 끼 소비; 같은 클릭 재시도는 재소비하지 않음 |
| PUT `/api/pet/name` | `{name}` 이름 변경 |
| PUT `/api/pet/journal` | `{date, answers}` 오늘 기록과 보상 원자적 저장 |

`user_pets` 행 잠금으로 다중 탭과 다중 기기 요청을 직렬화한다. `pet_daily_rewards`의 날짜별 비트마스크로 수정/삭제/재작성에도 한 단계당 한 번만 지급한다. 클라이언트의 재고/경험치 값은 받지 않는다. 계정은 세션에서 가져오며 응답은 `no-store`다.

기록 원문은 `memos` 한 곳에만 둔다. `pet_answers`는 같은 메모 행의 구조화된 폼이다. 일반 메모 저장 시 본문이 같으면 폼을 보존하고, 본문을 직접 수정하면 폼을 제거한다. 메모 삭제 시 폼도 삭제되며 기록을 다시 남겨도 보상은 중복되지 않는다. 계정 삭제 시 펫과 보상 이력은 FK CASCADE로 제거된다.

기록 저장 전후 기존 `syncRecords`를 거쳐 대기 중 메모 변경을 먼저 반영하고 새 기록을 캐시에 가져온다. 기존 메모 API 자체의 전체 목록 교체 방식은 유지되므로 다른 기기에서 동시에 메모를 편집하는 경우의 충돌 해결은 기존 동기화 정책을 따른다.

## 검증

- `PetRulesTest`: 하루 경계, 자동/수동 식사 중복, 30일 +60개, 장기 미접속, 보상 재지급 방지, 입력 검증.
- `PetControllerTest`: 익명/차단 사용자 차단, 세션 사용자 범위, 캐시 방지.
- `PetPostgresTest`: 실제 PostgreSQL 트랜잭션/동시 요청/롤백/메모 삭제 및 재작성. 임시 로컬 DB만 허용하며 아래 환경변수가 없으면 건너뛴다.

```powershell
$env:SOROW_TEST_DATABASE_URL='jdbc:postgresql://127.0.0.1:55439/sorow_test'
# disposable database; user sorow_test, empty password
cd backend
.\gradlew.bat test --tests 'kr.co.shuim.pet.*' --tests 'kr.co.shuim.records.*'
```

다종 배정, 교배, 상점, 친구 방문, 추억 카드 발급은 이번 범위에 포함하지 않는다.

### 이번 작업에서 확인한 결과

- 펫 관련 프런트 파일과 의존 파일의 TypeScript 검사 통과.
- 백엔드 전체 운영 소스와 펫/기록 테스트 소스를 Java 21로 컴파일하고 JUnit 실행: 17개 통과. Gradle wrapper는 네트워크 제한으로 실행되지 않아 설치된 의존성 캐시로 직접 실행했다.
- 프런트 기록 동기화 회귀 테스트 13개 통과.
- PostgreSQL 통합 테스트 4개는 실행하지 못했다. 임시 로컬 DB 연결이 환경의 네트워크 정책으로 차단됐다.
- 브라우저에서 홈의 방 렌더링과 쓰다듬기 반응 확인. 실행 중인 기존 백엔드는 새 API가 없어 저장 흐름의 브라우저 검증은 완료하지 않았다.
- 전체 프런트 검사/빌드는 기존 영상 의존성 `mediabunny`, 오래된 라우트 생성 타입, 별도 해변 작업의 누락 모듈 때문에 완료하지 않았다.

### 2026-11-11 continuation verification

- Regenerated stale Next.js route types; full frontend TypeScript check passed.
- Backend sources recompiled; 17 pet/records unit tests passed. Frontend records sync tests: 13 passed.
- Reopening a partial journal now selects its first unanswered step rather than using the answer count.
- The existing application configuration targets hosted Supabase, not local PostgreSQL. No DB connection configuration was changed.
- Hosted backend startup was attempted, but DNS resolution failed with UnknownHostException before Flyway could run. V38 (moru_pet) application and live persistence remain unverified.
- The separate disposable PostgreSQL integration suite could not connect due to the execution environment socket restriction; its four tests did not pass.
- Production build compiled and passed TypeScript, then failed during static page output with EPERM creating .next/server/app/memo.segments/memo and goals.segments/goals. Full production build is not verified.

### Reward and interaction follow-up

- Added food-to-pantry animation, level-up feedback, next growth milestone text, and the Lv.3 greeting paw animation. Reduced-motion settings remain respected; feedback clears with a timer even when CSS animation is disabled.
- Pet requests time out after 15 seconds, preserve authentication error status, normalize omitted null answers, and never automatically retry mutations.
- Added `node --test scripts/pet-client.test.mjs`: 4 tests passed. Full frontend TypeScript check passed.
- Browser verified home room and petting response on localhost:3000. Live pet API returned a connection error; saved journals, rewards, and growth animations could not be verified end to end.

### Cozy room and feeding entry

- Added three selectable animated window scenes: rainy city, snowy forest, rainy night. Weather stays outside the window; reduced-motion users see a static scene.
- Added a fitted bed with pillows, quilt, bedside lamp and warm interior details.
- The primary feeding button now opens the mood journal instead of manually consuming food. Journal rewards and automatic three-meal settlement remain server-owned. The existing manual feed API remains backward compatible but has no home UI action.
- Full frontend TypeScript check and four pet-client tests passed. Browser verified the room and all three background selections. Live journal persistence remains unverified because the current pet API returns a connection error.

### Photographic window scenery

Window scenes now use real photographs with a separate luminous-image layer for subtle, slow city-light shimmer. Interior and Moru stay pixel art. Photos are loaded from images.unsplash.com; no local copy was downloaded because shell DNS resolution failed. All motion respects prefers-reduced-motion.

Photo sources (Unsplash License, checked 2026-11-11):
- Rain city: Romeo A., https://unsplash.com/photos/1EKmCS_hF0A
- Snow forest: Austin Schmid, https://unsplash.com/photos/3yeuOu_iwtc
- Rain bokeh: Jahanzeb Ahsan, https://unsplash.com/photos/8HvGp9KFM44
- License: https://unsplash.com/license

## Home progression plan
See [MORU_HOME_PROGRESSION.md](MORU_HOME_PROGRESSION.md) for the proposed cave-to-mansion progression, visit points, home purchases, and interaction-based mood. Planning only; not implemented yet.

## Applied: home progression and guest window

- Implemented V40__moru_homes.sql for visit points, point ledger, home ownership and active home. Existing pets start in the cave with their food/XP preserved.
- GET /api/pet awards 10 P once per Korea calendar date; newly rewarded journal stages award 4 P each, maximum 20 P/day. Previously rewarded stages do not receive retroactive points.
- PUT /api/pet/home validates the server catalog, level, funds and preceding home under the pet row lock. Purchase, ledger, balance and active home change are atomic. Owned homes are free to reselect.
- Cave, shack and old house are available. Six later spaces are marked coming soon and cannot be bought. Existing Lv.10 cap is retained for this first stage; Lv.50 and later homes remain planned.
- Home shows current mood, points, food and a space shop. No automatic greeting smile: only interaction brightens Moru.
- Guests and expired sessions see closed shutters with a login link. The authenticated profile name, falling back to account nickname, is used in petting and journal messages.
- Java compilation passed; 20 backend unit tests passed, 5 database integration tests skipped (no usable test database connection in this execution environment). Four pet API client tests passed. Browser verified the cave and personalized petting reaction; live point/purchase persistence remains unverified until backend restart applies V40.

## Companion appearances

Added three original human-shaped pixel companions: Noa (dark hair/ribbon), Leo (blond/cape), Lumi (lavender/beret), alongside the original Moru. The home header opens a four-character gallery. Preview selection is local; the explicit apply button saves through PUT /api/pet/appearance. Name, food, XP, points and home remain unchanged.

V41__moru_appearance.sql stores the validated appearance ID, defaulting existing users to moru. Unknown IDs are rejected by the server. The client renders Moru as fallback for missing/unknown IDs. All human appearances share idle/blink, interaction smile, eating, sleeping and reduced-motion handling.

Browser verified all three gallery previews. Actual appearance persistence remains unverified because the running pet API is unavailable; apply stays disabled until pet state is loaded. Restarting the backend applies V41 through Flyway.

## Tamagotchi direction
See [MORU_TAMAGOTCHI.md](MORU_TAMAGOTCHI.md) for the Tamagotchi-style direction (real-time daily rhythm, four needs without punishment, planned interactions and phases). Only the full-screen room view from that document is implemented.
