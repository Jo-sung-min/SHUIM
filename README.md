# 마음 가속도

기분의 **위치**가 아니라 **변화(가속도)** 를 기록하고, 매일 "오늘의 나"가 쌓인 기록을 모아 긍정적인 방향으로 속도를 붙여주는 메모 앱. 모바일 앱 UI (하단 탭 5개).

## 탭

하단 탭은 아이콘만 5개: **홈(오늘의 나) · 기록 · 외침 · 위로 · 나**. 메모·목표·일정·랭킹·모금·계정·관리자는 **나** 탭의 아이콘 그리드에서 들어간다. 화면의 설명 문구는 최소화하고 아이콘·숫자로 안내한다(인스타그램처럼).

| 화면 | 하는 일 |
| --- | --- |
| **공개 프로필** (`/u/아이디`) | 누구나 볼 수 있는 프로필: 사진·닉네임·소개·크리에이터 배지, 위로글/팔로워/받은 힘내요 수, 위로글 그리드와 외침 목록, **팔로우**·**메시지 보내기**. 외침·댓글의 닉네임과 피드 크리에이터 시트에서 들어감 |
| **메시지** (`/messages`) | 1:1 대화함(읽지 않은 수 배지)과 대화 화면(5초 폴링, 읽음 표시). 서버 DB `conversations`·`messages` |
| **나** (`/me`) | 프로필 편집(사진 업로드 또는 주소, 닉네임, 소개 = 공개 / 이름·전화번호 = 나만 봄, 모두 서버 DB `profiles`) + `내 공간`: 나머지 기능 아이콘 그리드(메모, 목표, 일정, 랭킹, 모금, 계정, 관리자*), 도움 전화, 샘플/전체 삭제/로그아웃. `알림`: 내 글에 달린 위로 댓글, 내가 위로한 글에 달린 새 댓글. 읽지 않은 알림은 하단 나 탭에 점으로 표시, 누르면 해당 글로 이동(`?post=ID`) |
| **알림 시뮬레이션** | 개발 모드에서 내가 외침에 글·댓글을 쓰면 30초 뒤 샘플 유저(u1~u7)가 위로 댓글/답글을 1개 남김(서버 GET 시 `pendingSimulatedReplies`). `COMMUNITY_SIMULATE=0`으로 끔 |
| **오늘의 나** | 버튼 하나로 최근 기록·오늘 한 행동·카테고리별 메모·목표 진행·오늘 일정을 API로 보내 브리핑 생성. 어제 대비 흐름, 오늘의 포인트, 지금 할 수 있는 한 걸음, 저녁에 물어볼 질문. 하루 1회 캐시(다시 정리 가능). **나를 칭찬하기**는 같은 재료로 기록 속 행동·원칙·체크한 단계를 근거로 구체적으로 칭찬하고, **나를 사랑하기**는 몸·마음 기록을 바탕으로 오늘 10분 안에 할 수 있는 자기 돌봄 방법을 알려줌 (모드별 하루 1회 캐시) |
| **기록** | `오늘 쓰기`: 오늘 한 일(칩으로 빠르게) + 카테고리(돈/일·커리어/관계/몸/마음)별 **어제보다 얼마나(−5~+5)** 와 한 줄. 위치(−5~+5)는 어제 위치 + 오늘 변화로 계산해 저장. 자동 저장. `흐름 보기`: 위치 라인 + 가속도 막대 그래프, 7/14/30일, AI 흐름 정리로 이동 |
| **메모** | 카테고리별 메모(노트 UI). 고정(📌)하면 오늘의 나에서 우선 반영. `되돌아보기`: 카테고리마다 처음 메모와 최근 메모를 나란히(그때의 나 → 지금의 나) + 시간순 타임라인 |
| **오늘의 나 › 메모로 나를 점검하기** | 메모 **전체**(날짜·카테고리)를 컨텍스트로 보내 과거의 다짐·원칙과 오늘 기록을 대조. 예: 1년 전 "수익 100%면 팔자" ↔ 오늘 "수익 50% 달성" → 그때 정한 기준을 상기시키는 **주의할 점**, **그때와 다른 점**, 움직인 거리, 질문. 하루 1회 캐시 |
| **계정** | 회원가입·로그인(서버 DB, 세션 쿠키, scrypt 해시). 로그인 전엔 익명 유저로 활동하고 가입 시 그 유저가 승격됨. 기기의 기록·메모·목표·일정은 계정별 키로 분리되고 가입 시 게스트 데이터를 가져옴. **비밀번호를 가진 첫 계정이 관리자** |
| **관리자 › 프롬프트** | 브리핑·칭찬·사랑하기·점검 4개 시스템 프롬프트를 화면에서 수정/기본값 복원. 수정본은 요청마다 서버로 전달되어 기본값 대신 사용 |
| **목표** | 목표 + 작은 단계 체크, 진행 바, D-day, 달성 완료 |
| **일정** | 주간 스트립 + 그날 일정, 다가오는 일정, 완료 체크 |
| **외침** | 익명 커뮤니티. 카테고리(불행 털어내기·불안 내려놓기·돈 걱정·일·관계·몸·작은 승리·자유)별로 글을 올리면 다른 사람이 위로 댓글을 남김. 좋아요 대신 **힘내요**만 있음. 위로가 아닌 글·댓글은 신고할 수 있고, 신고 5회가 쌓이면 피드에서 가려지고 `/admin` 검토 대기열에 올라감. 관리자는 문제 없음 / 내용 숨기기 / **유저 차단**(글·댓글 전부 가려지고 작성 불가) 가능 |
| **외침 › 불행 랭킹** | 불행 털어내기 글이 받은 힘내요를 사람별로 더한 주간 순위(힘내요 순위 = 불행 순위). 월요일 0시에 지난주가 **확정 집계 테이블**(`weekly[week]`)로 굳고, 이번 주는 잠정 집계를 5분마다·"지금 집계"로 갱신. 화면은 원본 글을 다시 훑지 않고 이 테이블만 읽음 |
| **외침 › 불행 모금** | 모금액을 그 주 불행 순위 1~10위에게 비율(25/18/14/11/9/7/6/4/3/3%)로 분배. 이번 주 모금액·분배 예상·지난주 분배 결과·내가 받은 분배. **프로토타입이라 실제 결제 없음(모의 모금)** |
| **위로** | 쇼츠형 위로 피드. 글마다 배경 6종 또는 **그림**(기본 제공 SVG 5장 `public/feed/`, 또는 이미지 주소) 선택. 샘플 16편(위로 시·동기부여 글, 그중 5편은 그림 배경). 크리에이터가 올린 짧은 위로글을 한 장씩 세로로 넘겨 봄(스냅 스크롤). 힘내요·위로 댓글·저장·팔로우, 전체/팔로잉/저장함 필터. 위로글을 하나 올리면 누구나 크리에이터가 되고(소개 한 줄, 배경 6종 선택), 크리에이터 프로필에서 팔로워·위로글·받은 힘내요를 볼 수 있음. 신고·관리자 검토는 외침과 동일 |

기록에 많이 힘든 표현이 보이면 109 등 도움 받을 곳을 먼저 띄웁니다.

## DB (PostgreSQL)

`.env`의 `DB_URL`로 연결한다. Spring 스타일 `jdbc:postgresql://host:port/db?user=..&password=..`도, Node 스타일 `postgresql://user:pass@host:port/db`도 받는다 ([lib/db.ts](lib/db.ts)). 외부 호스트는 SSL로 붙는다.

- 연결 확인: 서버 실행 후 `GET /api/db` → `{ ok, latencyMs, host, database, user, version }` (비밀번호는 반환하지 않음)
- 스키마·시드는 **Flyway 규칙**의 SQL로 관리: `db/migration/V1__init_schema.sql`(테이블 21개), `V2__seed_sample_community.sql`(외침·피드·댓글·힘내요·신고·모금 샘플)
- 적용: `npm run db:migrate` (Java 없이 Node로 실행, 각 파일을 트랜잭션으로 적용). 상태: `npm run db:status`, 검증: `npm run db:validate`
- 실행기는 `flyway_schema_history` 테이블을 Flyway와 같은 컬럼·체크섬(CRC32, 줄 단위)으로 남긴다. 나중에 Spring Boot(Flyway)에 같은 파일을 `src/main/resources/db/migration/`에 두면 이미 적용된 것으로 인식한다. 만약 Flyway가 checksum mismatch를 내면 `flyway repair` 한 번이면 된다
- **외침·위로 피드·랭킹·모금·관리자·계정은 이 DB를 읽고 쓴다** (`/api/community`, `/api/community/<action>`, `/api/auth/<action>`). 서버는 Next.js 라우트 핸들러뿐이라 Spring 없이 동작한다
- 로그인 전에도 익명 유저가 자동 생성되어(세션 쿠키) 글·힘내요를 쓸 수 있고, 가입하면 그 익명 유저가 정식 계정으로 승격된다. 비밀번호는 scrypt 해시. 비밀번호를 가진 첫 계정이 관리자
- 주간 집계는 서버가 GET 때 필요한 주만 계산해 `weekly_batches`에 저장(지난 주 확정, 이번 주 5분 잠정). 샘플 유저 자동 답글은 개발 모드에서만(`COMMUNITY_SIMULATE=0`으로 끔)
- 프로필(사진·소개·이름·전화)과 1:1 메시지도 DB(V4). 기록·메모·목표·일정과 AI 프롬프트 설정은 아직 localStorage(계정별 키 분리)

## 피드 사진 업로드 (S3 + CloudFront)

브라우저가 파일을 서버로 보내지 않고, 서버([lib/server/s3.ts](lib/server/s3.ts))가 발급한 **프리사인 PUT URL**로 S3에 직접 올린다. 올리기 전에 브라우저에서 긴 변 1600px·WebP로 줄인다([lib/upload.ts](lib/upload.ts)). 글에는 CDN 주소가 저장되고, 글을 지우면 S3 객체도 지운다.

1. `.env`에 `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, (선택) `S3_PREFIX`, `CDN_BASE_URL` 입력 (`.env.example` 참고). 비어 있으면 업로드 버튼이 숨겨진다.
2. **버킷 CORS** (브라우저가 PUT 하려면 필수). S3 콘솔 › 권한 › CORS:
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000", "https://<배포 도메인>"],
      "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type", "Cache-Control"], "MaxAgeSeconds": 3000 }]
   ```
3. **IAM 정책** (최소 권한): `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/feed/*`
4. **CloudFront**: 원본 = S3 버킷, 원본 액세스 = OAC(Origin Access Control)로 두고 버킷은 퍼블릭 차단 유지. 버킷 정책에 CloudFront 서비스 주체 `s3:GetObject` 허용. 캐시 정책은 CachingOptimized. 배포 도메인을 `CDN_BASE_URL`에.
   - 업로드 시 `Cache-Control: public, max-age=31536000, immutable`을 붙이므로 CDN·브라우저가 1년 캐시한다(키가 매번 새로 생겨 안전).
5. 확인: `GET /api/upload/presign` → `{ configured: true }`, 피드 › 위로글 쓰기 › 📷 내 사진 올리기.

## 실행

```bash
npm install
cp .env.example .env         # ANTHROPIC_API_KEY, DB_URL 입력 (키 없어도 동작, 규칙 기반 정리로 대체). 기본 모델 Haiku 5.5, 관리자 › 프롬프트에서 변경
npm run dev
```

http://localhost:3000 → 홈의 "샘플 데이터로 둘러보기"로 14일치 예시를 넣고 "오늘의 나 정리하기"를 눌러보면 감이 와요.

## 구조

```
app/
  page.tsx               오늘의 나 (브리핑 홈)
  log/page.tsx           기록: 오늘 쓰기 / 흐름 보기
  memo/page.tsx          메모
  goals/page.tsx         목표
  schedule/page.tsx      일정
  shout/page.tsx         외침 (커뮤니티: 글·위로 댓글·힘내요·신고)
  feed/page.tsx          위로 피드 (쇼츠형 세로 스냅 피드, 크리에이터·팔로우·저장)
  ranking/page.tsx       불행 랭킹 (주간 집계 테이블 읽기, 이번 주 잠정 / 지난 주 확정)
  fund/page.tsx          불행 모금 (모의 모금, 1~10위 분배 예상·지난주 결과)
  admin/page.tsx         관리자: 신고 검토(5회 누적 글, 유저 차단) + AI 프롬프트 관리. 관리자 계정만 (계정이 하나도 없으면 데모로 열림)
  auth/page.tsx          회원가입 / 로그인 / 내 계정
  summary/page.tsx       흐름 AI 정리 (기록 > 흐름 보기에서 진입)
  api/today/route.ts     오늘의 나 브리핑·칭찬·사랑하기·메모 점검 (Claude API, 키 없으면 규칙 기반). mode와 prompts(덮어쓰기) 받음
  api/summarize/route.ts 흐름 정리 (Claude API, 키 없으면 규칙 기반)
components/
  TabBar.tsx             하단 탭바
  ui.tsx                 TopBar, Segmented, CatChips, Sheet(바텀시트), Empty, 날짜 포맷
  Icons.tsx              인라인 SVG 아이콘
  CommunityUI.tsx        외침·피드 공용: 힘내요 버튼, 댓글 스레드, ⋯ 메뉴(삭제/신고), 신고 시트
  AccelChart.tsx         위치 라인 + 가속도 막대 (SVG)
  HelpBanner.tsx         도움 받을 곳 안내
lib/
  categories.ts          카테고리 정의, 행동 프리셋
  storage.ts             localStorage 저장 (기록/행동/메모/목표/일정/브리핑·점검 캐시), 계정별 키 분리, 샘플 데이터
  auth.ts                클라이언트 계정 (fetchMe/signUp/signIn/signOut/updateNick)
  dates.ts               todayKey/addDays/uid (서버·클라이언트 공용)
  db.ts                  PostgreSQL 연결 (DB_URL 파싱, pg Pool)
db/migration/            Flyway 규칙 SQL 마이그레이션 (V1 스키마, V2 샘플)
scripts/migrate.mjs      Flyway 호환 마이그레이션 실행기 (npm run db:migrate / db:status / db:validate)
  prompts.ts             AI 시스템 프롬프트 기본값 4종 (서버·클라이언트 공용)
  community-core.ts      외침·피드 타입과 순수 계산(주간 집계, 알림, 검토 대기열) — 서버·클라이언트 공용
  community.ts           클라이언트: fetchCommunity() + api.* (서버에 반영 후 최신 상태 반환)
  server/community.ts    서버: PostgreSQL에서 CommunityStore 조립, 변경 SQL, 주간 집계 저장
  server/auth.ts         서버: 세션 쿠키 인증, 익명 유저 생성, 가입/로그인/로그아웃
  server/profile.ts      서버: 공개/내 프로필 조회·수정
  server/messages.ts     서버: 대화 목록, 대화 내용, 보내기, 읽음
  social.ts              클라이언트: 프로필·메시지 API 호출
  accel.ts               가속도 계산
  crisis.ts              위기 표현 감지
```

## 설계 메모

- 브리핑은 하루 한 번 캐시해서 "새로운 주식창"처럼 자꾸 열어보게 만들지 않음
- 브리핑 프롬프트: 사용자의 말을 인용, 떨어진 날에도 "다시 올라온 순간·지켜낸 것"을 먼저, 진단·투자 조언 금지
- 저장소는 localStorage 프로토타입. 기록은 민감 정보라 서버 저장 시 암호화·동의 필요

## 불행 모금을 실제로 하려면

- 결제: 토스페이먼츠·포트원 등 PG 연동, 환불·취소 처리
- 법: 불특정 다수에게 모금하는 건 기부금품법 대상(일정 금액 이상 모집은 등록 필요), 분배받는 사람의 소득 처리(기타소득·원천징수)도 검토 필요
- 운영: 힘내요 어뷰징(계정 여러 개로 힘내요) 방지, 랭킹 확정 전 이의 신청 창구
- 배치: 서버에선 월요일 0시 크론이 `computeWeekly`를 돌려 `weekly_batches` 테이블에 쓰고, 화면은 그 테이블만 읽음

## 다음 단계 아이디어

- 기록·메모·목표·일정을 DB 테이블(journal_entries 등)로 옮겨 기기 간 동기화
- AI 프롬프트·모델 설정을 app_settings 테이블로
- localStorage → DB(Supabase/Postgres) + 로그인
- 아침 알림 1회(최소화), PWA 홈 화면 설치
- 주간 정리 자동 생성
