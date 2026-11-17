# 소로우 Android 출시 배포 기획

작성 2026-11-17. 보안 점검 결과는 [security/2026-11-17-release-security-audit.md](security/2026-11-17-release-security-audit.md), Play 제출 서류는 [play-store/README.md](play-store/README.md)에 있습니다.

## 한눈에 보기

| 항목 | 값 |
| --- | --- |
| 출시 대상 | Google Play, 패키지 `kr.co.sorow.app`, Trusted Web Activity (Chrome 기반) |
| 앱이 여는 주소 | `https://www.sorow.co.kr/?source=android` (apex `sorow.co.kr` 는 www 로 308 이동) |
| 웹(프런트) | Vercel 프로젝트 `shuim`, Root `frontend`. **main 에 푸시하면 몇 분 안에 운영 반영** |
| 백엔드 | Elastic Beanstalk `sorow-api-prod` 단일 인스턴스 (nginx → Java :5000). **JAR 는 집에서 손으로 올림** |
| DB | Supabase Postgres (pooler), Flyway 마이그레이션은 백엔드가 뜰 때 자동 적용 |
| 미디어 | S3 + CloudFront `https://cdn.sorow.co.kr` |
| 지원 기기 | Android 7.0(API 24) 이상 + 최신 Chrome. 360px 화면·뒤로 가기·키보드 기준으로 확인 |

## 출시를 막는 일 (Go / No-Go)

아래가 모두 ✅ 여야 프로덕션 출시를 누릅니다.

| # | 할 일 | 누가 | 확인 방법 |
| --- | --- | --- | --- |
| 1 | 이번 보안 수정 코드 머지·프런트 배포 | 개발 | Vercel 배포 성공, `npm run check:release` 통과 |
| 2 | 새 백엔드 JAR 업로드 (+ DB 백업 먼저) | 운영자(집) | EB 상태 Ok, `/api/db` 가 `{configured, ok}` 만 반환, 로그에 Flyway 새 버전 적용 |
| 3 | 백엔드 HTTPS (`api.sorow.co.kr`) + Vercel `BACKEND_ORIGIN` 을 https 로 | 운영자 | `curl -I https://api.sorow.co.kr/api/db` 200, 웹 로그인·글쓰기 정상 |
| 4 | Play 앱 서명 SHA-256 → Vercel `ANDROID_SHA256_FINGERPRINTS` | 운영자 | `https://www.sorow.co.kr/.well-known/assetlinks.json` 이 리다이렉트 없이 200 JSON |
| 5 | 개인정보처리방침의 "검토 중 / 공개 전 확정 예정" 문구 제거 (운영 정보 env) | 운영자 | `/privacy` 에 자리표시 문구 없음 |
| 6 | OpenAI 전용 키 + 월 사용 한도 | 운영자 | OpenAI 대시보드 Limits |
| 7 | EB 환경 변수 운영값 (아래 표) | 운영자 | EB 구성 화면, 시작 로그에 경고 없음 |
| 8 | 카카오 Redirect URI 를 www 로 | 운영자 | 앱(TWA)에서 카카오 로그인 → 돌아와 로그인 상태 |
| 9 | Play Console 앱 콘텐츠 선언 (데이터 보안·광고·대상 연령·건강·아동 안전 등) | 운영자 | Console 의 정책 상태 녹색 |
| 10 | 실기기 시험 (device-test-plan A01–F03) 통과 | 운영자 | 시험표 |
| 11 | (새 개인 개발자 계정이면) 비공개 테스트 12명 · 14일 연속 | 운영자 | Console 의 프로덕션 신청 버튼 활성 |

## 배포 순서

순서가 중요한 이유: 프런트는 푸시 즉시 나가고 백엔드는 나중에 올라가므로, **새 프런트가 옛 백엔드와 먼저 만납니다.** 이번 수정은 그 상태에서도 동작하도록 맞췄습니다 (보안 점검 문서의 "배포 호환" 절).

### 1단계 — 코드 반영 (오늘)

1. 수정 사항을 main 에 푸시 → Vercel 자동 배포.
2. 확인: `cd frontend && npm run check:release` (기본 주소가 이제 `https://www.sorow.co.kr`), 웹에서 로그인·외침·피드·기록·AI·3D 공간 한 번씩.
3. 이 시점의 백엔드는 옛 버전입니다. 새 신고 종류(소로우·3D 공간 글)는 옛 백엔드가 "신고 종류를 확인해 주세요" 로 거절할 수 있습니다 — 2단계 뒤 해결.

### 2단계 — 백엔드 JAR (집에서)

1. Supabase 대시보드에서 백업 시점 확인 (PITR 이 없으면 수동 백업). 새 Flyway 마이그레이션 `V53`(안전 신고 종류 넓히기, 옛 코드와도 호환) 한 개가 같이 나갑니다.
2. `cd backend && ./gradlew.bat clean bootJar` → `backend/build/libs/*.jar`.
3. EB 환경 변수를 먼저 넣고 (아래 표), 같은 화면에서 JAR 업로드 → 배포.
4. 확인: EB 로그에서 `Successfully applied` (Flyway), 시작 경고 없음, `/api/db`, 로그인·카카오 로그인·글쓰기·AI 한 번, 3D 공간 입장. 일반 사용 중 429 가 나오면 해당 `RATE_LIMIT_*` 값을 올립니다.

### 3단계 — 전송 구간 암호화 (출시 전 필수)

지금 Vercel → EB 구간은 평문 HTTP 입니다. 비밀번호·세션·개인 기록이 인터넷 구간에서 암호화되지 않고, Play 데이터 보안 양식의 "전송 중 암호화" 에 "예" 라고 답할 근거가 없습니다.

1. ACM(ap-northeast-2)에서 `api.sorow.co.kr` 인증서 발급 (DNS 검증).
2. EB 환경을 로드 밸런서(ALB) 형태로 바꾸거나 새로 만들고, 443 리스너에 인증서 연결 → 인스턴스 80.
3. DNS 에 `api.sorow.co.kr` CNAME → EB 주소.
4. Vercel `BACKEND_ORIGIN=https://api.sorow.co.kr` 로 바꾸고 재배포.
5. 인스턴스 보안 그룹의 80 은 로드 밸런서에서만 받도록 좁힙니다.
6. (선택, 권장) 출처 비밀값: 무작위 32바이트 값을 만들어 **먼저** Vercel `ORIGIN_SHARED_SECRET` 에 넣고 재배포 → 그다음 EB `ORIGIN_SHARED_SECRET` 에 같은 값. 순서가 반대면 모든 API 가 403 이 됩니다. 켜면 Vercel 을 거치지 않은 직접 호출(앞으로의 앱인토스 직접 호출 포함)이 막히므로, 앱인토스를 붙일 때 다시 정합니다.

### 4단계 — Android 빌드·업로드

1. Play Console 에 앱 생성 → Play App Signing 사용, 업로드 키 생성 (`android/keystore.properties`, Git 에 올리지 않음).
2. `cd android && ./gradlew.bat :app:bundleRelease` (서명 정보가 없으면 일부러 실패). `versionCode` 는 올릴 때마다 1씩 올립니다 (첫 업로드 1).
3. 앱 서명 키 인증서 SHA-256 → Vercel `ANDROID_SHA256_FINGERPRINTS` → 재배포 → assetlinks 200 확인.
4. 내부 테스트 트랙 업로드 → 실기기에서 주소창 없이 열리는지(=도메인 검증 성공) 확인.
5. 비공개 테스트 (새 개인 계정이면 12명 이상이 14일 연속 참여해야 프로덕션 신청 가능 — 일정에 3주 정도 잡기).
6. 프로덕션은 단계적 출시 10% → 50% → 100%.

### 5단계 — Play Console 앱 콘텐츠

[play-store/README.md](play-store/README.md)·[data-safety-worksheet.md](play-store/data-safety-worksheet.md) 기준으로 채웁니다. 이번 점검에서 바뀐 점:

- **데이터 보안**: AI 처리자는 OpenAI(미국). 전송 중 암호화는 3단계를 끝낸 뒤에만 "예".
- **광고 포함**: 대가를 받는 후원 기업 배너가 있으면 "예" 로 선언.
- **대상 연령 / 아동 안전**: 가입 때 만 14세 이상 확인. 앱을 "소셜" 로 분류하면 아동 안전 표준(CSAE) 공개 페이지 URL·앱 안 신고 수단·담당자 연락처를 Console 에 적어야 합니다.
- **사용자 제작 콘텐츠(UGC)**: 글·댓글·피드·DM·소로우·3D 공간 방명록/소원등에 신고·차단·운영자 숨김이 있어야 합니다 (이번에 3D 공간·소로우 신고를 보강).
- **건강 앱 선언**: 마음 기록·위기 안내가 있으므로 건강 관련 기능 질문에 사실대로 답합니다 (의료 기기·진단 아님).
- **계정 삭제**: 앱 안 + 웹 `https://www.sorow.co.kr/account-deletion`.
- **결제**: 앱(TWA) 안에서는 디지털 상품 결제 화면을 숨깁니다. 판매를 다시 열려면 Play 결제 또는 한국 대체 결제 등록이 먼저입니다.

## 환경 변수

### Vercel (프런트)

| 이름 | 값 | 비고 |
| --- | --- | --- |
| `BACKEND_ORIGIN` | 지금 EB http 주소 → 3단계 뒤 `https://api.sorow.co.kr` | |
| `ANDROID_SHA256_FINGERPRINTS` | Play **앱 서명 키** SHA-256 (업로드 키 아님), 여러 개면 쉼표 | 없으면 assetlinks 503 |
| `ANDROID_PACKAGE_NAME` | 비워 두면 `kr.co.sorow.app` | |
| `ORIGIN_SHARED_SECRET` | (선택) 무작위 32바이트 | EB 보다 먼저 |
| 개인정보처리방침 운영 정보 | 보안 점검 문서의 "운영자 입력값" 표 참고 | 없으면 초안 문구 노출 |

### Elastic Beanstalk (백엔드)

| 이름 | 운영값 | 비고 |
| --- | --- | --- |
| `APP_ORIGIN` / `ALLOWED_ORIGINS` | `https://www.sorow.co.kr` | 기본값은 localhost 라 꼭 넣기 |
| `AUTH_SECURE_COOKIE` | `true` | 기본값도 true 로 바뀜 |
| `COMMUNITY_SIMULATE` | `false` | 기본값도 false 로 바뀜 (샘플 계정 가짜 답글 끔) |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | 그대로 | 카카오 콘솔 Redirect URI 에 `https://www.sorow.co.kr/api/auth/kakao/callback` |
| `KAKAO_ADMIN_KEY` | (선택) 카카오 어드민 키 | 넣으면 탈퇴 때 카카오 연결 끊기 |
| `ORIGIN_SHARED_SECRET` | (선택) Vercel 과 같은 값 | Vercel 다음에 |
| `RATE_LIMIT_ENABLED` | `true` | 문제가 생기면 `false` 로 즉시 끄는 비상 스위치 |
| `OPENAI_API_KEY` | 소로우 전용 키 | 월 한도를 OpenAI 쪽에 설정 |
| `FIREWORKS_MEMBERS_ENABLED` | 지금처럼 비워 둠(`false`) | 닫혀 있으면 후원 기업 멋져요(이용권 받기)도 닫힘. 회원 불꽃놀이를 열 때 `true` |
| `DB_POOL_MAX` | 기본 3 → Supabase 풀러 한도 안에서 5~10 검토 | 동시 접속이 늘면 3 은 빠듯함 |

수정 묶음이 더한 나머지 설정(요청 제한·AI 하루 한도 등)은 모두 안전한 기본값이 있어 넣지 않아도 됩니다. 이름과 기본값은 `backend/.env.example` 과 보안 점검 문서에 있습니다.

## 출시 뒤 지켜볼 것

- EB 로그: 429 비율, 5xx, `WARN` 시작 경고, Flyway.
- OpenAI 사용량 (하루 단위), Supabase 연결 수·CPU, Vercel 함수 오류.
- Play Console: ANR/비정상 종료(TWA 라 거의 없음), 리뷰, 정책 알림.
- 신고함: 관리자 화면의 신고 목록을 하루 한 번 이상.

## 되돌리기

| 대상 | 방법 | 주의 |
| --- | --- | --- |
| 프런트 | Vercel 이전 배포를 Promote | 즉시 |
| 백엔드 | EB 이전 애플리케이션 버전 재배포 | 새 마이그레이션은 되돌리지 않음 — 이번 마이그레이션은 옛 코드와 함께 써도 되게 만듦 (보안 점검 문서 참고) |
| 요청 제한 | EB `RATE_LIMIT_ENABLED=false` | 재시작 필요 |
| Android | 단계적 출시 중지(Halt) | 이미 설치된 앱은 웹을 열 뿐이라 웹을 되돌리면 같이 돌아감 |

## 버전 표시

- 백엔드 JAR 는 늘 `0.0.1-SNAPSHOT` 이라 무엇이 올라갔는지 구분이 안 됩니다. EB 에 올릴 때 버전 라벨에 커밋 해시(`git rev-parse --short HEAD`)를 적습니다.
- Android 는 업로드마다 `versionCode` +1, `versionName` 은 사용자에게 보이는 이름.
