# 기업 후원 배너와 폭죽 이용권

기업이 소로우를 후원하는 두 가지 길과, 그 후원이 회원의 불꽃놀이로 이어지는 흐름을 정리한다. 기획 원문은 세션 공유 노트 `sponsor-fireworks-plan.md`.

## 한눈에

- **PC 양옆 홍보 배너**: 1024px 이상 화면에서 앱 기둥(480px) 양옆에 글라스 카드 열이 고정된다(한쪽 4칸). 노출 순서가 홀수면 왼쪽, 짝수면 오른쪽. 첫 빈 칸은 "+" 카드로, 누르면 "30일 30만원" 안내와 문의 메일(mailto 템플릿)이 열린다. 모바일·미니앱에서는 렌더하지 않는다. 노출 경로는 외침 탭 계열(`/c*`, `/shout*`, `/ranking`, `/fund`)이며 `components/SponsorRails.tsx` 의 `shownOn` 한 줄로 바꾼다.
- **폭죽 이용권**: 3D 공간(바닷가·유우니·대나무숲·봄물 정원)의 불꽃놀이 버튼이 가입 회원 모두에게 보이되 이용권이 없으면 잠긴다. 관리자는 지금처럼 무료·전 종류(송이 안녕 포함). 일반 회원은 송이 안녕을 뺀 6종.
- **이용권 얻기**: ① 온기 포인트 1,000 P → 1장 ② 후원 기업 "멋져요" → 그 기업의 남은 폭죽 1개가 내 이용권 1장(기업당 하루 1회, 하루 최대 3장). 후원 1,000원 = 폭죽 1개.
- **후원 기업 순위와 꾸미기 액자**: `/sponsors` 는 1~3위 시상대(받침대 위의 액자, 금·은·동과 1위 왕관은 순위가 붙인다)와 4위부터의 한 줄 목록이다. 360×740 에서 10위까지 첫 화면에 들어온다. 줄을 누르면 기업 시트(큰 액자·소개·멋져요·홈페이지)가 열린다. 기업은 로고를 감싸는 액자(8종)·포인트 색(8종)·모서리 장식(7종)을 고를 수 있다. 기업 계정이 없으므로 관리자가 기업별 **꾸미기 링크**(`/sponsors/studio#<키>`)를 발급해 전하고, 담당자는 로그인 없이 그 화면에서 고른다. 링크로는 액자만 바뀐다.
- **방 쿨타임**: 누가 쏘든 그 방(소로우×지도)의 15초 쿨타임이 모두에게 같이 돈다. 쿨타임 중 요청은 429 이고 이용권은 빠지지 않는다.

## 데이터 (V32, 추가 전용)

| 테이블 | 역할 |
|---|---|
| `sponsors` | 후원 기업. `amount_won`(누적), `fireworks_total`(충전 누계), `fireworks_given`(멋져요로 나간 수), 로고 base64 |
| `sponsor_contributions` | 후원 입금 내역(관리자 입력, 수정 없음) |
| `sponsor_banners` | 양옆 배너. 게시 기간(`starts_at`/`ends_at`, epoch ms)·`published`·`position`, 이미지 base64, 연결 기업(선택) |
| `sponsor_banner_clicks` | 배너별 하루 클릭 수(참고용, 개인정보 없음) |
| `sponsor_cheers` | 멋져요 기록. `UNIQUE (sponsor_id, user_id, cheered_on)` 으로 기업당 하루 1회 |
| `firework_ticket_wallets` / `firework_ticket_ledger` | 이용권 잔액과 추가 전용 원장. `event_key`(`buy:<requestId>` · `cheer:<sponsor>:<user>:<날짜>` · `use:<requestId>`)로 재시도가 두 번 반영되지 않는다 |
| `point_ledger` | 기존 원장에 음수 행(`firework_ticket`, −1,000)을 허용. `point_wallets.total_spent` 추가 |

V44(추가 전용)는 `sponsors` 에 `frame_style`·`frame_color`·`frame_deco`(기본 `glass`·`violet`·`none`)와 꾸미기 링크의 `studio_key_hash`(키의 SHA-256, 원문은 저장하지 않음)·`studio_key_at` 을 더한다. 값의 허용 목록은 `SponsorPolicy` 와 `frontend/lib/sponsor-frames.ts` 에 같은 순서로 있고(`npm run test:sponsors` 가 둘을 비교), 목록에서 빠진 값은 읽을 때 기본값이 된다.

계정 삭제 시 지갑·원장·멋져요는 FK CASCADE 로 지워지고 기업의 `fireworks_given` 은 그대로다. 옛 백엔드(V31)는 Flyway 기본 설정이 미래 버전을 무시하므로 V32 가 적용된 DB 에서도 그대로 뜬다.

## API

공개(60초 public 캐시): `GET /api/sponsors/banners`(게시 중 배너 + `contact`), `GET /api/sponsors/banners/{id}/image`, `POST /api/sponsors/banners/{id}/click`, `GET /api/sponsors`(순위: 누적 후원액↓·멋져요↓, 기업마다 `frame { style, color, deco }`), `GET /api/sponsors/{id}/logo`.

꾸미기 링크(로그인 없음, no-store, 키는 본문으로만): `POST /api/sponsors/studio/open { key }` → 내 기업 카드, `PUT /api/sponsors/studio { key, style, color, deco }` → 액자 저장. 키가 틀리면 404, 목록에 없는 값은 400.

회원(가입 회원만, 익명·샘플·차단 403): `GET /api/fireworks/me`, `POST /api/fireworks/tickets/buy { requestId }`(포인트 부족 409), `POST /api/sponsors/{id}/cheer`(이미 보냄 409 · 남은 폭죽 없음 409 · 하루 한도 429).

발사 `POST /api/beach/fireworks { ticket, requestId, variant }`: 관리자는 무료, 일반 회원은 이용권 1장 소비(없으면 402, songi 는 403). 응답에 `tickets`(남은 장수)가 붙는다. 입장 응답은 `fireworksControl`(가입 회원 true), `fireworksFree`(관리자), `fireworkTickets`(회원 잔액)를 준다.

관리자(`/api/admin/sponsors/**`, no-store): 배너·기업 CRUD, `POST /api/admin/sponsors/{id}/contributions { amountWon, note }`(1,000원마다 폭죽 1개 충전), `POST /api/admin/sponsors/{id}/studio-key`(꾸미기 링크 발급 — 키 원문은 이 응답에만 있고, 다시 부르면 옛 링크는 닫힌다) · `DELETE` 같은 주소(링크 닫기), 기업 저장 본문의 `frame`(생략하면 그대로), `GET/PUT /api/admin/sponsors/settings { contactEmail, priceLabel }`(site_settings `sponsor.contact_email` · `sponsor.banner_price`). 입력 제한: 이름 40자·한 줄 80자·메모 200자, 링크는 `https?://`, 이미지 PNG/JPEG/WebP ≤ 400 KB(data URL), 후원액 1,000원 이상 1억 이하.

## 일관성

- 잠금 순서는 언제나 **이용권 지갑 → 포인트 지갑 / 기업 행**. 멋져요는 지갑을 먼저 잠가 하루 한도를 직렬화하고, 기업 행을 `FOR UPDATE` 로 잠가 남은 폭죽을 지킨다.
- 발사는 `FireworkTicketService.consume` 안에서 방의 `launchFireworks` 를 실행한다. 방이 429 를 던지면 트랜잭션이 롤백되어 소비가 없고, 같은 `requestId` 의 재시도는 방의 요청 기억으로 같은 이벤트를 돌려주며 두 번 빼지 않는다.
- 포인트 사용은 `PointsService.spend` 가 담당하며 `daily()` 는 양수 행만 더해 구매가 "오늘 적립"을 깎지 않는다.

## 화면

- `components/SponsorRails.tsx`: 양옆 카드 열 + "+" 안내 시트(`--lg-*` 토큰).
- `components/FireworkTicketSheet.tsx`: "포인트를 사용할까요?" 시트(구매 + 나를 위한 폭죽 받기)와 마이페이지 카드 `FireworkTicketCard`. 3D 공간에서는 portal 로 띄운다.
- `components/beach/RoomFireworksControls.tsx`: 준비 중 > 쿨타임 > 잠김 > 열림 순으로 버튼 상태를 정한다.
- `app/sponsors/page.tsx`: 공개 순위(시상대 + 목록)와 기업 시트의 멋져요. `app/sponsors/studio/page.tsx`: 꾸미기 링크로 여는 액자 고르기.
- `components/SponsorFrame.tsx`: 액자 그림(`SponsorFrameView`, 크기는 `--frame-size` 하나), 빈 액자, 고르기(`SponsorFramePicker`). 그림은 전부 CSS 라 이미지 자산이 없다.
- `app/admin/SponsorAdmin.tsx`: 관리자 "후원" 탭(배너·후원 기업·안내 설정). 후원 기업 카드에서 꾸미기 링크를 만들고·다시 만들고·닫으며, 수정 폼에서 액자를 대신 고를 수 있다.

## 검증

`backend/gradlew test`(메모리 이용권 저장소로 발사·소비·쿨타임·재시도·songi 를 검사하는 `BeachFireworkTicketsTest`, `SponsorPolicyTest`, `SponsorAdminControllerTest`, `SponsorControllerTest`, 임시 DB 가 있을 때만 도는 `SponsorFramesPostgresTest`), `npm run test:sponsors`, `npx tsc --noEmit -p frontend/tsconfig.json`. 브라우저 확인은 워크트리 dev 서버(메모리 노트 `project-worktree-dev-servers`)에서 두 계정으로 한다.
