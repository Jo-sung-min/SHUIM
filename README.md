# 소로우 (SOROW)

**Sorrow + Row — 슬픔을 나란히 나누는 공간.** 기분의 **위치**가 아니라 **변화(가속도)** 를 기록하고, 매일 "오늘의 나"가 쌓인 기록을 모아 긍정적인 방향으로 속도를 붙여주는 메모 앱. 모바일 앱 UI (하단 탭 5개).

## 구성

- `frontend`: Next.js 16, React 19, TypeScript — 화면. `/api/*` 는 백엔드로 프록시
- `backend`: Spring Boot 3.5.16, Java 21, Gradle 8.14.3, PostgreSQL(Supabase), Flyway — 외침·위로 피드·랭킹·모금·계정·프로필·메시지·사진 업로드(S3 프리사인)·AI 브리핑 API
- AI: Claude API (Anthropic Messages API, 기본 모델 Haiku 5.5, 관리자 화면에서 변경). 키가 없으면 규칙 기반 결과
- 개인 기록(기록·메모·목표·일정·내 카테고리)은 **로그인 계정이면 서버 DB**(`/api/records`, 기기 간 동기화), 익명이면 브라우저 localStorage. 브라우저는 계정별 localStorage 를 캐시로 두고 화면을 열 때 서버에서 받아 덮어쓰며, 쓸 때마다 서버로 보낸다. 가입·로그인하면 그 기기의 게스트 기록이 계정의 비어 있는 부분에 한 번 들어간다. AI 요청은 브라우저가 들고 있는 데이터를 본문으로 보낸다

## 로컬 실행

1. 백엔드 (http://localhost:8080)

```powershell
cd backend
copy .env.example .env        # DB_URL, ANTHROPIC_API_KEY 입력 (키 없어도 동작)
gradlew.bat bootRun            # macOS/Linux: ./gradlew bootRun
```

시작할 때 Flyway 가 `backend/src/main/resources/db/migration/V*__*.sql` 을 자동 적용한다. `http://localhost:8080/api/db` 로 연결 확인.

2. 프론트 (http://localhost:3000)

```powershell
cd frontend
npm install
npm run dev
```

백엔드 주소가 8080 이 아니면 `frontend/.env`(또는 `.env.local`)에 `BACKEND_ORIGIN=http://호스트:포트`.

홈의 "샘플 데이터로 둘러보기"로 14일치 예시를 넣고 "정리하기"를 눌러보면 감이 와요.

## 환경 변수

`backend/.env.example` 참고. 전부 백엔드에만 둔다(프론트에는 비밀값 없음).

| 변수 | 설명 |
| --- | --- |
| `DB_URL` | `jdbc:postgresql://host:6543/db?user=..&password=..` 또는 `postgresql://user:pass@host:6543/db`. Supabase 풀러는 **6543(트랜잭션 모드)**. 5432 를 넣어도 자동으로 6543 으로 바꾸고 `prepareThreshold=0` 을 붙인다 (`DB_KEEP_SESSION_MODE=true` 면 그대로) |
| `DB_POOL_MAX` | Hikari 풀 크기 (기본 3) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude API. 비우면 규칙 기반 |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PREFIX`, `CDN_BASE_URL` | 피드 사진 업로드. 비우면 업로드 버튼 숨김 |
| `APP_ALLOWED_ORIGINS` | 프론트를 프록시 없이 직접 붙일 때의 CORS 허용 출처 |
| `AUTH_SECURE_COOKIE` | HTTPS 운영에서 `true` (세션 쿠키 Secure) |
| `COMMUNITY_SIMULATE` | 개발용 샘플 유저 자동 답글 (운영 `false`) |
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI` | 카카오 로그인 (아래 참고). 비우면 카카오 버튼 숨김 |

### 카카오 로그인 설정

1. [Kakao Developers](https://developers.kakao.com) › 내 애플리케이션 › 앱 추가. **앱 키 › REST API 키**를 `KAKAO_REST_API_KEY` 에
2. 카카오 로그인 › 활성화 ON. **Redirect URI** 에 `http://localhost:3000/api/auth/oauth/kakao/callback` (운영은 `https://<프론트 도메인>/api/auth/oauth/kakao/callback`) 등록. 같은 값을 `KAKAO_REDIRECT_URI` 에
3. 동의항목: 닉네임(필수), 카카오계정(이메일)은 선택. 보안 › Client Secret 을 켰으면 `KAKAO_CLIENT_SECRET` 에
4. 흐름: 계정 화면 "카카오로 시작하기" → `/api/auth/oauth/kakao` → 카카오 동의 → `…/callback` 이 프론트 프록시를 거쳐 백엔드로 들어가 세션 쿠키를 프론트 출처에 남기고 `/auth?oauth=kakao` 로 돌아옴 → 이 기기의 게스트 기록을 계정으로 옮기고 홈으로. 로그인 전 익명 유저로 쓴 글·힘내요는 그 계정으로 이어진다 (`users.kakao_id`, V8)

## 배포

- **백엔드**: Java 21 이 도는 곳 어디든 (Railway, Fly.io, EC2, Cloud Run…). `cd backend && ./gradlew bootJar` → `build/libs/shuim-backend-0.0.1-SNAPSHOT.jar` 를 `java -jar` 로 실행하고 위 환경 변수를 넣는다. 풀은 인스턴스마다 하나(`DB_POOL_MAX` 만큼)만 열리므로 서버리스 때처럼 Supabase 연결 한도에 걸리지 않는다
- **프론트**: Vercel. 환경 변수는 `BACKEND_ORIGIN=https://<백엔드 주소>` 하나. `/api/*` 가 같은 출처로 프록시되므로 세션 쿠키가 그대로 오간다. HTTPS 면 백엔드에 `AUTH_SECURE_COOKIE=true`
- 프론트와 백엔드를 다른 도메인에서 **직접** 호출하려면 백엔드 `APP_ALLOWED_ORIGINS` 에 프론트 주소를 넣고 `fetch` 에 `credentials: "include"` 가 필요하다 (지금 코드는 프록시 전제)

## 탭

하단 탭은 아이콘만 5개: **홈(오늘의 나) · 기록 · 외침 · 위로 · 나**. 메모·목표·일정·랭킹·모금·계정·관리자는 **나** 탭의 아이콘 그리드에서 들어간다. 화면의 설명 문구는 최소화하고 아이콘·숫자로 안내한다(인스타그램처럼).

| 화면 | 하는 일 |
| --- | --- |
| **홈 (오늘의 나)** | 히어로 아래 오늘 기록 현황: 다 채우기 전엔 "오늘 기록을 채워주세요" 버튼, 다 채우면 "고생했어요, 오늘도 화이팅" 문구만. 정리하기(브리핑)·칭찬받기·사랑받기·분석하기 4개 액션, 모드별 하루 1회 캐시 |
| **기록** | `오늘 쓰기`: 오늘 한 일(칩) + 카테고리(마음·몸·관계·돈·일·커리어)별 **어제보다 얼마나(−5~+5)** 와 한 줄. 숫자 줄 위를 글라스 블럭이 미끄러져 포커스. 카드를 꾹 눌러 끌면 순서 변경(계정별 저장), `+ 카테고리 추가`로 내 카테고리(최대 5개). `흐름 보기`: 전체 평균(추가 카테고리 포함) 위치 라인 + 가속도 막대, 7/14/30일, AI 흐름 정리 |
| **메모** | 카테고리별 메모(노트 UI). 고정(📌)하면 오늘의 나에서 우선 반영. `되돌아보기`: 카테고리마다 처음 메모와 최근 메모를 나란히 + 타임라인 |
| **오늘의 나 › 분석하기** | 메모 **전체**(날짜·카테고리)를 컨텍스트로 보내 과거의 다짐·원칙과 오늘 기록을 대조 → 주의할 점, 그때와 다른 점, 움직인 거리, 질문 |
| **외침** | 익명 커뮤니티. 카테고리별로 글을 올리면 다른 사람이 위로 댓글을 남김. 좋아요 대신 **힘내요**(선 주먹 → 누르면 3D 주먹). 신고 5회면 가려지고 `/admin` 검토 대기열로. 관리자는 숨기기/유저 차단 |
| **외침 › 불행 랭킹** | 불행 털어내기 글의 힘내요를 사람별로 더한 주간 순위. 지난 주는 확정, 이번 주는 5분마다 잠정 집계(`weekly_batches`) |
| **외침 › 불행 모금** | 모금액을 그 주 1~10위에게 25/18/14/11/9/7/6/4/3/3% 로 분배. **프로토타입, 실제 결제 없음** |
| **위로** | 쇼츠형 세로 스냅 피드. 글 하나에 콘텐츠(사진+제목+글) 최대 10개, 가로로 넘기면 함께 바뀜. 인스타식 3단계 작성(사진 선택 → 슬라이드별 편집 → 공유). 힘내요·위로 댓글·저장·팔로우, ⋯ 메뉴에서 전체/팔로잉/저장함·위로글 쓰기 |
| **공개 프로필** (`/u/아이디`) | 사진·닉네임·소개·크리에이터 배지, 활동 수, 위로글/외침 목록, 팔로우·메시지 보내기 |
| **메시지** (`/messages`) | 1:1 대화함과 대화 화면(5초 폴링, 읽음 표시) |
| **나** (`/me`) | 프로필 편집(사진 업로드/주소, 닉네임, 소개 = 공개 / 이름·전화 = 나만), 내 공간 그리드, 알림(내 글의 댓글·내가 위로한 글의 새 댓글) |
| **계정** | 회원가입·로그인(세션 쿠키, scrypt). 로그인 전엔 익명 유저로 활동하고 가입 시 그 유저가 승격. **비밀번호를 가진 첫 계정이 관리자** |
| **관리자 › 프롬프트** | 브리핑·칭찬·사랑하기·점검 4개 시스템 프롬프트와 모델을 화면에서 변경. 요청마다 서버로 전달되어 기본값 대신 사용 |

기록에 많이 힘든 표현이 보이면 109 등 도움 받을 곳을 먼저 띄웁니다.

## API (백엔드)

| 경로 | 설명 |
| --- | --- |
| `GET /api/db` | DB 연결 상태 |
| `GET /api/auth/me`, `POST /api/auth/{signup,login,logout,nick}` | 계정 |
| `GET /api/community`, `POST /api/community/{action}` | 커뮤니티 전체 상태 / 변경(post.create, comment.create, cheer, report, feed.create, follow, save, donate, admin.* …) — 변경 후 최신 상태 반환 |
| `GET/PUT /api/profile`, `GET /api/profile/{id}` | 내 프로필 / 공개 프로필 |
| `GET/POST /api/messages`, `GET/POST /api/messages/{id}` | 대화 목록·보내기 / 대화 내용·읽음 |
| `GET/POST /api/upload/presign` | 사진 업로드 프리사인 URL |
| `POST /api/today`, `POST /api/summarize` | AI 브리핑·칭찬·사랑하기·점검 / 흐름 정리 |
| `GET /api/records` | 로그인 계정의 개인 기록 전체 (journal·log·memos·goals·schedule·categories·order). 익명은 401 |
| `PUT /api/records/journal/{date}` | 하루 기록 `{ record, did }` |
| `PUT /api/records/{memos,goals,schedule}` | 목록 통째로 교체 |
| `PUT /api/records/categories` | 내 카테고리 `{ categories?, order? }` |
| `PUT /api/records`, `POST /api/records/import`, `DELETE /api/records` | 부분 교체(샘플 채우기·재전송) / 게스트 데이터 가져오기(비어 있는 부분만) / 전체 삭제 |

## DB (PostgreSQL)

- 스키마·시드는 **Flyway** SQL: `backend/src/main/resources/db/migration/V1__init_schema.sql`(테이블 21개) … `V7__personal_records.sql`(cat 길이 확장, `user_categories`, `user_settings`). 백엔드가 시작할 때 자동 적용·검증한다 (`flyway_schema_history`)
- 외침·위로 피드·랭킹·모금·관리자·계정·프로필·메시지와 로그인 계정의 기록·메모·목표·일정·내 카테고리(`journal_entries`, `day_logs`, `memos`, `goals`+`goal_steps`, `schedule_items`, `user_categories`, `user_settings`)는 DB. 익명 유저의 기록과 프롬프트 설정, 브리핑 캐시는 localStorage
- 로그인 전에도 익명 유저가 자동 생성되어(세션 쿠키 `shuim_session`, DB 에는 SHA-256 해시만) 글·힘내요를 쓸 수 있고, 가입하면 승격된다. 비밀번호는 Node 시절과 같은 scrypt(N=16384, r=8, p=1) 라 기존 계정이 그대로 로그인된다
- 주간 집계는 서버가 GET 때 필요한 주만 계산해 `weekly_batches` 에 저장. 샘플 유저 자동 답글은 `COMMUNITY_SIMULATE=true` 일 때만

## 피드 사진 업로드 (S3 + CloudFront)

브라우저가 파일을 서버로 보내지 않고, 서버(`backend/.../upload/S3Service.java`)가 발급한 **프리사인 PUT URL** 로 S3 에 직접 올린다. 올리기 전에 브라우저에서 긴 변 1600px·WebP 로 줄인다(`frontend/lib/upload.ts`). 글에는 CDN 주소가 저장되고, 글을 지우면 S3 객체도 지운다.

1. `backend/.env` 에 `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, (선택) `S3_PREFIX`, `CDN_BASE_URL`
2. **버킷 CORS** (브라우저 PUT 에 필수):
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000", "https://<배포 도메인>"],
      "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type", "Cache-Control"], "MaxAgeSeconds": 3000 }]
   ```
3. **IAM 정책**: `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/feed/*`
4. **CloudFront**: 원본 = S3(OAC), 버킷 퍼블릭 차단 유지, 배포 도메인을 `CDN_BASE_URL` 에. 업로드에 `Cache-Control: public, max-age=31536000, immutable`
5. 확인: `GET /api/upload/presign` → `{ configured: true }`

## 구조

```
frontend/
  app/                   화면 (page.tsx 홈, log, memo, goals, schedule, shout, feed, ranking, fund, admin, auth, summary, me, u/[id], messages)
  components/            TabBar, ui, Icons, CommunityUI(선 아이콘 액션·힘내요), Fist3D, FeedComposer, useLongPressReorder, AccelChart, HelpBanner
  lib/
    storage.ts           기록/메모/목표/일정/카테고리·순서 읽기·쓰기 (localStorage 계정별 키 + 로그인 시 서버 전송), 브리핑 캐시, 샘플 데이터
    records-sync.ts      서버 동기화: 화면 열 때 /api/records 받기, 쓸 때마다 보내기(키별 합침·순서 보장), 못 보낸 부분 다음에 재전송
    categories.ts        기본 카테고리(마음·몸·관계·돈·일) + 사용자 카테고리·순서 도우미
    community-core.ts    외침·피드 타입과 순수 계산 (클라이언트용; 서버는 Java 로 같은 로직)
    community.ts / social.ts / auth.ts / upload.ts   API 호출
    prompts.ts           관리자 화면용 프롬프트 기본값 (서버 Prompts.java 와 같은 내용)
  next.config.ts         /api/* → BACKEND_ORIGIN 프록시
backend/
  build.gradle           Spring Boot 3.5.16 · Java 21 (fatell 과 같은 구성)
  src/main/java/kr/co/shuim/
    config/              DataSourceConfig(DB_URL 파싱·풀러 보정), WebConfig(CORS), ApiException(+Handler), DbHealthController
    auth/                AuthService(세션 쿠키·scrypt), AuthController
    community/           Model(Store 레코드), CommunityLogic(가시성·주간 집계·자동 답글), CommunityService(SQL), CommunityController
    profile/ message/ upload/   프로필 · 1:1 메시지 · S3 프리사인
    records/             RecordsService(개인 기록 SQL), RecordsLogic(저장 전 정리), RecordsController(/api/records)
    ai/                  ClaudeClient, Prompts, TodayService(브리핑·칭찬·사랑·점검 + 규칙 기반 대체), SummarizeService, AiController
  src/main/resources/
    application.yml      설정 (환경 변수 → app.*)
    db/migration/        Flyway SQL V1~V7
```

## 설계 메모

- 브리핑은 하루 한 번 캐시해서 "새로운 주식창"처럼 자꾸 열어보게 만들지 않음
- 브리핑 프롬프트: 사용자의 말을 인용, 떨어진 날에도 "다시 올라온 순간·지켜낸 것"을 먼저, 진단·투자 조언 금지
- 개인 기록은 민감 정보라 로그인 계정만 서버에 저장하고 익명은 기기에만 둔다. 저장 데이터 암호화·동의 문구는 아직

## 불행 모금을 실제로 하려면

- 결제: 토스페이먼츠·포트원 등 PG 연동, 환불·취소 처리
- 법: 불특정 다수에게 모금하는 건 기부금품법 대상, 분배받는 사람의 소득 처리도 검토
- 운영: 힘내요 어뷰징 방지, 랭킹 확정 전 이의 신청 창구
- 배치: 월요일 0시 `@Scheduled` 로 `CommunityLogic.computeWeekly` 를 돌려 `weekly_batches` 에 쓰고, 화면은 그 테이블만 읽음

## 다음 단계 아이디어

- 브리핑·칭찬·점검 캐시도 서버에 두어 기기 간 하루 1회를 지키기
- AI 프롬프트·모델 설정을 app_settings 테이블로
- 메시지 웹소켓, 아침 알림 1회, PWA 홈 화면 설치
