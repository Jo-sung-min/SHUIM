# 소로우 Google Play 출시 준비

작성·정책 확인: **2026-10-21 (한국 시간)**. 이 문서는 준비 작업과 운영자 할 일을 정리한 초안이며, Google 승인·심사 제출·운영 배포가 완료되었다는 뜻은 아닙니다. 실제 Play Console 경고와 제출 당일 정책을 다시 확인하세요.

준비된 파일과 확인 결과는 [검증 기록](validation.md), 아이콘·소개 이미지는 [스토어 이미지](assets/README.md)에서 볼 수 있습니다. 테스트 설치 파일은 `android/dist/sorow-1.0.0-debug.apk`이며 Play 제출 파일과 다릅니다.

## 확정된 정보와 운영자가 채울 정보

| 항목 | 현재 값 / 해야 할 일 |
| --- | --- |
| 앱 / 웹 주소 | 소로우 / `https://sorow.co.kr` |
| 운영 회사 | 루체. 사업자 서류와 결제 프로필의 정확한 법적 명칭·주소를 확인 |
| 계정·고객 문의 이메일 | `developer@lucelab.co.kr`. Google 계정 생성과 메일 수신·회신을 실제로 확인 |
| Play 개발자 계정 | 아직 없음. 회사 서비스이므로 **조직 계정**으로 등록 준비 |
| 앱 형태 | 운영 웹을 Android 앱으로 여는 TWA. 웹 서버가 정상 운영 중이어야 사용 가능 |
| 배포 대상 | 한국어·휴대전화 중심 첫 출시 제안. 국가·연령·가격은 운영자가 확정 |
| 미정 | D-U-N-S 번호, 대표자·담당자 확인, 사업장 주소, 개인정보 보유기간, 위탁/국외 처리 현황, 아동 안전 담당자 |

## 이번 준비 작업에 포함된 내용

- [Android 프로젝트와 빌드·서명 안내](../../android/README.md): 패키지 `kr.co.sorow.app`, Android 16(API 36), TWA 연결 설정.
- 웹 앱 매니페스트, 공개 오프라인 안내, `/.well-known/assetlinks.json` 연결 경로. 인증서가 미설정이면 연결 성공으로 표시하지 않습니다.
- `/privacy`, `/terms`, `/account-deletion` 페이지와 앱 내 계정 삭제 경로. 계정 삭제·사진 삭제 재시도, 사용자 차단, 사용자/메시지/AI 신고 및 관리자 검토 API와 화면.
- UGC 작성 전 동의 화면과 `POST /api/community/consent`의 계정/익명 세션별 동의 버전 저장. 서버가 현재 동의 없는 글·댓글·피드·후원 메시지·프로필 공개 항목 변경·DM·사진 업로드를 거부합니다. AI 실행 전에는 별도 전송 확인을 표시합니다.
- 로컬 오프라인 테스트와 공개 웹 출시 점검 도구. 모두 통과하더라도 회사 계정·서명·운영 정책 확정과 실기기 시험은 별도입니다.

**법적 안내는 아직 승인된 최종 정책이 아닙니다.** 웹 서버의 `LEGAL_OPERATOR_NAME=루체`, `LEGAL_SUPPORT_EMAIL=developer@lucelab.co.kr`가 기본값입니다. `LEGAL_EFFECTIVE_DATE`, `LEGAL_RETENTION_NOTICE`, `LEGAL_PROCESSORS_NOTICE`를 실제 운영 내용으로 채우고 검토한 다음 `LEGAL_POLICY_APPROVED=true`로 설정해야 준비용 배너가 사라집니다. 승인 플래그만 켜고 실제 내용을 누락한 채 출시하지 마세요.

## 내가 작업할 순서

1. **회사 계정 준비**: [Play Console](https://play.google.com/console)에 회사에서 관리하는 Google 계정으로 가입합니다. 조직 유형을 선택하고 루체의 법적 명칭, 주소, D-U-N-S, 담당자 정보를 맞춥니다. 개발자 등록비는 **미화 25달러 1회**이며 계정·기기 확인은 콘솔 지시에 따릅니다. [가입 안내](https://support.google.com/googleplay/android-developer/answer/6112435), [조직 계정 요구사항](https://support.google.com/googleplay/android-developer/answer/10788890)
2. **운영 정보 확정**: 아래 출시 차단 목록을 처리합니다. 개인정보처리방침·약관·계정 삭제 페이지를 실제 공개 웹에서 확인합니다. 서버 코드만 바뀌고 운영 서비스가 예전 버전이면 준비 완료가 아닙니다.
3. **앱 만들기**: [Android 단계별 안내](../../android/README.md)에 따라 Android SDK와 서명용 업로드 키를 준비하고 `.aab`를 빌드합니다. 키·비밀번호를 저장소에 넣지 않고 회사의 안전한 보관 장소에 백업합니다. 패키지 이름은 최초 업로드 전에 확정합니다. 업로드 후 바꿀 수 없는 앱 식별자입니다. [앱 설정 안내](https://support.google.com/googleplay/android-developer/answer/9859152)
4. **스토어 초안 입력**: 기본 언어 한국어, 앱 이름·설명, `developer@lucelab.co.kr`, 아이콘·실제 스크린샷을 등록합니다. [store-listing-ko.md](store-listing-ko.md)를 사용하되 실제 출시 기능과 맞춥니다.
5. **앱 콘텐츠 작성**: 개인정보처리방침 URL, 데이터 보안, 앱 액세스, 광고, 콘텐츠 등급, 대상 연령, 건강 앱 선언, 해당하는 아동 안전 선언 등을 작성합니다. [data-safety-worksheet.md](data-safety-worksheet.md)는 확인용 자료이며 자동으로 제출할 답안이 아닙니다.
6. **내부 테스트 업로드**: Play App Signing을 설정하고 서명된 AAB를 내부 테스트에 올립니다. 앱 서명 인증서의 SHA-256을 웹의 `/.well-known/assetlinks.json`에 반영한 뒤 **Play에서 설치한 앱**으로 확인합니다. 업로드 키의 지문과 앱 서명 키의 지문은 서로 다를 수 있습니다.
7. **실기기 테스트**: [device-test-plan.md](device-test-plan.md)를 진행합니다. 로그인·AI·업로드·신고·차단·탈퇴·오프라인·업데이트를 확인하고 결과를 남깁니다. 심사용 일반 계정도 별도로 준비합니다.
8. **비공개 테스트와 출시 신청**: 필요한 수정 후 비공개 테스트를 거칩니다. 모든 차단 항목을 해소한 다음 프로덕션 심사를 신청합니다. 계정 확인·심사·테스트 기간은 별도이므로 승인 날짜를 미리 확정하지 않습니다.

**12명·14일 규칙은 모든 계정에 적용되지 않습니다.** 2023-11-13 이후 생성한 **개인** 계정은 최소 12명이 연속 14일 이상 참여한 비공개 테스트 후 프로덕션 액세스를 신청해야 합니다. 루체 조직 계정에 이 규칙이 자동 적용된다고 가정하지 말고 실제 콘솔 요구사항을 따르세요. 조직 계정도 자체 테스트와 심사는 필요합니다. [공식 테스트 요구사항](https://support.google.com/googleplay/android-developer/answer/14151465)

## 출시를 막는 항목 — 모두 증거로 확인

아래는 작업 시작 시 코드와 운영 미확인 상태를 기준으로 만든 **릴리스 게이트**입니다. 같은 작업에서 코드가 보완되더라도 운영 배포와 실기기 검증이 끝나기 전에는 체크하지 않습니다.

- [ ] 루체 조직 계정, 결제 프로필, 법적 명칭·주소·D-U-N-S 확인 완료.
- [ ] API 36 이상을 대상으로 만든 **서명된 AAB** 빌드·업로드 성공. 2026-08-31부터 신규 일반 Android 앱/업데이트는 Android 16(API 36) 이상 대상이 필요합니다. [대상 API 정책](https://support.google.com/googleplay/android-developer/answer/11926878)
- [ ] 운영 웹·API·DB가 HTTPS에서 정상 동작. TWA 도메인 연결을 Play 설치본에서 검증.
- [ ] 공개 개인정보처리방침에 루체·지원 연락처·수집 항목·목적·위탁/제공·보유/삭제·국외 처리 내용을 실제 설정대로 기재. 초안·미확정 값 제거.
- [ ] 앱 안 탈퇴 경로와 앱 설치 없이 접근할 수 있는 웹 삭제 요청 경로 동작. 기록 지우기와 계정 탈퇴는 구별. 카카오 계정도 지원. 삭제 범위·예외 보관·기간 안내. [계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111)
- [ ] 구현된 글·댓글·사진·프로필·메시지 작성 전 동의가 계정 전환·카카오·익명 활동에서도 표시되는지 확인. 현재 버전(`2026-10-21`)의 동의 저장과 동의 없는 API 거부를 운영에서도 검증.
- [ ] 글·댓글·프로필·사용자 신고와 사용자 차단, 1:1 메시지 차단을 앱에서 제공. 관리자 계정 정지만으로 사용자 간 차단을 대신하지 않음. 신고가 5개 쌓이기 전에도 심각한 신고를 처리할 운영 담당자·절차 마련. [UGC 정책](https://support.google.com/googleplay/android-developer/answer/9876937)
- [ ] AI 결과를 앱을 떠나지 않고 신고할 수 있고, 담당자가 확인·처리. AI 기능이 꺼진 경우 스토어 설명도 수정. [AI 생성 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/13985936)
- [ ] 기분/몸 기록과 AI 마음 정리를 건강 관련 기능으로 검토해 건강 앱 선언 작성. 질병 진단·치료 효능을 광고하지 않고 의료기기 아님·의료 전문가 상담 문구 반영. [건강 정책](https://support.google.com/googleplay/android-developer/answer/16679511), [건강 선언](https://support.google.com/googleplay/android-developer/answer/14738291)
- [ ] 익명 소통이 핵심 기능인지 평가. 해당하면 Play Console의 미성년자 차단을 적용. 첫 출시는 성인 대상 제안이며 단순히 스토어에서 성인이라고 쓰는 것으로 기능상 의무가 사라지지 않음. [연령 제한 정책](https://support.google.com/googleplay/android-developer/answer/16302250)
- [ ] Social 카테고리 또는 익명/랜덤 채팅 해당 시 공개 CSAE 금지 기준, 앱내 신고, CSAM 조치·관련 당국 신고 절차, 아동 안전 담당자 등록. 성인 전용이어도 해당 정책 대상이면 필요. [아동 안전 기준](https://support.google.com/googleplay/android-developer/answer/14747720)
- [ ] 실제 결제 없는 모금/분배 시연은 출시 범위에서 비활성화하는 방향으로 확인. 실제 기부·수익 지급·결제가 된다고 설명하지 않음. 실제 결제를 도입한다면 결제 및 관련 법적 요건을 별도 검토.
- [ ] 샘플 사용자·가상 자동 댓글이 실제 이용자처럼 보이지 않도록 제거/분리. 운영 `COMMUNITY_SIMULATE=false` 확인.
- [ ] 첫 가입자 자동 관리자, 미로그인 관리자 허용 등 개발용 동작이 운영에서 차단되고 일반/익명 사용자의 관리자 API 접근 실패 확인.
- [ ] 데이터 보안 답변이 실제 웹·서버·외부 서비스까지 포함. 게스트 AI 요청도 서버 전송이므로 무조건 “데이터 미수집”으로 체크하지 않음.
- [ ] 실제 앱 캡처, 심사 계정, 앱 액세스 설명, 실기기 결과와 Play 사전 출시 보고서 확인.

## 공개 웹 사전 점검 실행

프런트엔드 의존성이 설치된 상태에서 `frontend` 폴더에서 실행합니다.

```powershell
npm.cmd run typecheck
npm.cmd run test:offline
node --test scripts/records-sync.test.mjs
npm.cmd run build
npm.cmd run check:release -- https://sorow.co.kr
```

`check:release`는 공개 웹의 앱 연결·매니페스트/아이콘·오프라인 파일·정책 페이지와 초안 배너를 확인합니다. 미배포 상태, 실제 서명 인증서 미설정, 운영 정책 초안이면 실패가 정상입니다. 비밀번호나 실제 사용자 내용을 전송하는 도구가 아닙니다. 계정 삭제·차단·로그인·개인정보처리방침의 내용 자체는 [실기기 시험](device-test-plan.md)과 운영 검토로 확인합니다.

## 출시 이후 작업 방식

웹 화면 수정은 웹/백엔드 배포로 앱에도 반영됩니다. 기능·수집 데이터·정책에 영향이 있으면 Play 설명과 선언도 함께 갱신합니다. Android 권한·패키징·SDK·아이콘 변경은 새 AAB를 만들고 `versionCode`를 올려 배포합니다. 서버 장애 시 앱도 영향을 받으므로 배포 전 백업과 되돌리기 절차를 준비합니다.

지원 메일, 신고 검토, 계정 삭제 요청을 지속적으로 처리할 담당자를 지정하세요. 실제 사용자의 상담 내용·계정 비밀번호·서명 키를 이 문서나 Git에 기록하지 않습니다.
