# 불씨팝 결제 연결

불씨팝은 선택한 소로우의 모닥불 색을 24시간 바꾸는 소비성 상품입니다. 로즈빛·오로라·블루 웨이브·라벤더는 각각 1,000원(KRW)으로 서버에 고정되어 있습니다. 이미 적용 중인 불씨팝이 있으면 다음 24시간 구간에 예약됩니다. 클라이언트의 가격·시간·성공 콜백만으로는 효과가 지급되지 않습니다.

## 웹: 토스페이먼츠

토스페이먼츠 결제창 SDK v2의 API 개별 연동 키를 설정합니다. `test_ck_`와 `test_sk_`, 또는 `live_ck_`와 `live_sk_`의 환경이 일치해야 합니다. 주문 조회를 지원하지 않는 결제위젯/주문서형 `gck`·`gsk` 키는 사용하지 않습니다.

```dotenv
TOSS_PAYMENTS_CLIENT_KEY=test_ck_...
TOSS_PAYMENTS_SECRET_KEY=test_sk_...
```

공개 클라이언트 키만 주문 생성 응답으로 전달합니다. 시크릿 키는 서버 환경에만 설정하고 프론트 환경 변수나 저장소에 넣지 않습니다. 결제 창의 성공 URL은 프론트의 `/beach/payment?communityId=...`, 실패 URL은 같은 경로에 `result=failed`를 추가한 URL입니다. 운영 HTTPS 도메인은 프론트 결제 모듈 설정에 맞춥니다.

서버는 승인 전에 로그인한 주문 소유자와 고정 금액을 확인합니다. `POST /v1/payments/confirm`에 주문 번호를 멱등 키로 보내고, 승인 응답이 유실되면 `GET /v1/payments/orders/{orderId}`로 같은 주문을 조회합니다. 응답의 주문 번호·결제 키·통화·총액과 `DONE` 상태가 모두 일치해야 지급합니다. 실제 카드 정보나 원본 결제 응답은 저장하지 않습니다.

공식 문서: [결제창 연동](https://docs.tosspayments.com/guides/v2/payment-window/integration), [코어 API](https://docs.tosspayments.com/reference), [인증·멱등 키](https://docs.tosspayments.com/reference/using-api/authorization).

## 앱인토스: IAP

앱인토스 콘솔에 **소비성(CONSUMABLE)** 상품 4개를 생성하고 각 최종 판매가를 **1,000원**으로 설정합니다. 서로 다른 SKU와 토스 로그인에서 사용하는 mTLS 인증서·키를 서버에 설정합니다.

```dotenv
TOSS_MTLS_CERT=/secure/path/client-cert.pem
TOSS_MTLS_KEY=/secure/path/client-key.pem
AIT_IAP_ROSE_SKU=콘솔의_로즈_SKU
AIT_IAP_AURORA_SKU=콘솔의_오로라_SKU
AIT_IAP_OCEAN_SKU=콘솔의_오션_SKU
AIT_IAP_VIOLET_SKU=콘솔의_바이올렛_SKU
```

인증서는 PEM 파일 경로나 PEM 내용으로 설정할 수 있습니다. 키나 상품이 준비되지 않으면 카탈로그의 `available`이 `false`가 되고 구매를 열지 않습니다. 토스에 연결된 로그인 계정이 필요합니다. 프론트도 SDK 상품 목록에서 SKU·소비성 유형·표시 가격을 확인한 뒤 결제를 시작해야 합니다.

앱 번들의 API 주소는 `frontend/.env.ait`의 `NEXT_PUBLIC_API_ORIGIN`에 운영 HTTPS 주소로 설정합니다. 검증용 localhost 주소로 만든 번들을 실제 배포에 사용하지 않습니다. 서버 배포 시 Flyway의 `V23__beach_fire.sql`, `V24__beach_fire_payments.sql`이 적용되어야 장작·주문·영수증을 저장할 수 있습니다.

서버는 mTLS로 `/api-partner/v1/apps-in-toss/order/get-order-status`를 조회합니다. `resultType=SUCCESS`, 일치하는 영수증·SKU, `PAYMENT_COMPLETED` 또는 `PURCHASED` 상태만 지급합니다. 최초 지급에는 결제 상태 시각이 서버 주문 생성 후 30분 이내여야 합니다. 공식 응답의 오프셋 없는 `yyyy-MM-dd'T'HH:mm:ss`는 한국 시간으로 해석하며 초 단위 반올림 오차만 허용합니다. 이미 지급한 같은 주문·영수증은 원래 시작/종료 시각을 반환합니다.

현재 공식 조회 API는 구매자 식별자와 결제 금액을 반환하지 않으며 `x-toss-user-key`·`x-anon-key`도 받지 않습니다. 따라서 서버가 확인하는 것은 해당 앱의 SKU·영수증·상태·시각입니다. 구매자 및 금액을 직접 검증했다고 주장하지 않습니다. 계정에 미리 만든 주문, 토스 로그인, 30분 시간 제한, 영수증 전역 단일 사용으로 연결을 제한하며 가격은 콘솔의 SKU 설정과 SDK 상품 가격 검사를 함께 사용합니다. 이 API 한계는 실제 운영 심사와 결제 정책 검토 시 확인해야 합니다.

공식 문서: [인앱 결제 상태 조회](https://developers-apps-in-toss.toss.im/api/iap), [인앱 결제 안내](https://developers-apps-in-toss.toss.im/documentation/common/monetization/iap/in-app-purchase).

## API와 복구

모든 경로는 기존 세션 쿠키 또는 인증 헤더를 사용합니다. 카탈로그와 주문 생성은 해당 소로우의 승인된 멤버만 가능합니다. 확인·복원·내역은 자신의 주문만 처리합니다. 오류 응답은 기존 형식인 `{ "error": "사용자 안내" }`입니다.

| 요청 | 용도 |
| --- | --- |
| `GET /api/beach/fire/catalog?communityId=...&platform=web\|ait` | 가격·상품·준비 상태·현재 모닥불 |
| `POST /api/beach/fire/orders` | `{communityId,color,platform,requestId}`로 주문 생성. `requestId`는 UUID이며 동일 계정의 재시도에 재사용 |
| `POST /api/beach/fire/payments/confirm` | 웹 `{orderId,paymentKey,amount:1000}` 확인 |
| `POST /api/beach/fire/payments/ait` | 앱인토스 `{orderId:서버주문,providerOrderId:앱인토스영수증}` 확인 |
| `POST /api/beach/fire/payments/restore` | 같은 앱인토스 확인 절차로 복원 |
| `GET /api/beach/fire/orders?communityId=...` | 자신의 해당 소로우 주문 최근 30개 |
| `POST /api/beach/fire/payments/reconcile` | `{orderId}`를 제공자 API로 다시 조회. 클라이언트 상태는 받지 않음 |

주문 상태는 `CREATED`, `PAID`, `REFUNDED`, `FAILED`입니다. 생성 응답에도 상태가 있으며, `PAID`는 `result`에 기존 지급 결과를 반환하므로 새 결제 창을 열면 안 됩니다. `recoveryRequired`가 있으면 기존 영수증 또는 웹 `paymentKey`로 복구하고 다시 결제하지 않습니다. 종료된 주문도 새 결제에 재사용하지 않습니다. 앱인토스의 `intentExpiresAt`이 지난 주문으로 앱이 새 결제 창을 열면 안 됩니다. 만료된 미사용 주문은 결제 시도·영수증·미완료 구매가 없음을 앱에서 확인한 뒤에만 새 요청 번호를 사용합니다. 결과가 불확실하면 기존 주문 복구를 먼저 진행합니다.

서버는 제공자 조회 전에 영수증 시도 정보를 저장하므로 네트워크 오류나 서버 재시작 후 같은 주문을 복원할 수 있습니다. SKU·시각이 틀린 영수증은 연결을 해제합니다. 불확실한 결과는 지급하지 않고 복구 대상으로 보관합니다. 앱은 스토어 영수증과 서버 주문의 대응 관계를 로그인 계정별로 저장하고 성공적인 서버 지급 이후에만 `completeProductGrant`를 호출해야 합니다. 대응 관계를 잃어버린 영수증을 SKU와 시각만으로 임의의 소로우에 적용하지 않습니다.

DB의 영수증 고유 제약과 주문 잠금으로 동시 재시도를 막습니다. 결제 상태와 24시간 효과는 같은 DB 트랜잭션으로 저장됩니다. 회원이나 소로우 삭제 이후에도 영수증 중복 방지 기록은 개인·소로우 연결을 제거한 상태로 남습니다.

## 환불 상태 동기화와 확인

서버가 1분마다 미확정 영수증 및 아직 유효한/예약된 지급을 확인하며, 같은 주문은 기본적으로 최소 5분 간격으로 조회합니다. 한 번에 오래 확인하지 않은 20건을 처리합니다. 제공자 조회로 확인한 `REFUNDED` 또는 웹 `CANCELED`/`PARTIAL_CANCELED`만 효과를 회수합니다. 다른 사람의 이후 예약 구간은 당겨지지 않습니다. 클라이언트가 환불 상태를 보내는 경로와 가짜 결제 성공 경로는 없습니다. 이미 만료된 지급의 뒤늦은 환불 상태는 자신의 주문에 대한 명시적 재조회로 갱신할 수 있습니다.

`PAYMENT_RECONCILE_DELAY_MS`로 주기를 조정할 수 있습니다. 동기화 실패는 다음 주기에 재시도하며 영수증·결제 응답·키를 로그에 남기지 않습니다. 이 기능은 환불 **상태를 반영**하며 환불을 실행하는 API는 아닙니다.

검증 명령은 `backend`에서 `gradlew.bat test --tests kr.co.shuim.payment.*`입니다. DB 통합 테스트는 별도 폐기 가능한 로컬 DB `SOROW_TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:<port>/sorow_test`를 명시한 경우에만 실행합니다. 실제 앱의 `DB_URL`을 테스트에 사용하지 않습니다. 자동 테스트의 결제 제공자 응답은 모의 응답이며 실제 결제나 실제 환불을 발생시키지 않습니다.
