# 정책 확인 기록

확인일: **2026-10-21, Asia/Seoul**. Google 공식 도움말을 확인했으며 각 URL의 본문은 이후 바뀔 수 있습니다. 이 파일은 준수 인증이 아니며 제출일에 현재 본문·기한·Play Console 요구사항을 다시 확인합니다.

| 확인 영역 | 공식 출처 | 소로우에서 확인할 점 |
| --- | --- | --- |
| 계정 가입·등록비 | [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) | 회사 관리 Google 계정, 1회 US$25, 신원 확인 |
| 조직 계정 | [Play Console Requirements](https://support.google.com/googleplay/android-developer/answer/10788890), [Choose account type](https://support.google.com/googleplay/android-developer/answer/13634885) | 루체 법적 명칭·주소·D-U-N-S. 건강 앱에 관한 조직 계정 요건도 검토 |
| 신규 개인 계정 테스트 | [Testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) | 2023-11-13 이후 개인 계정에 12명 연속 14일 조건. 조직 계정에 일괄 적용하지 않음 |
| Android 대상 API | [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878) | 2026-08-31부터 일반 신규 앱/업데이트 API 36 이상 |
| 앱 생성·패키지·문구 | [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152) | 패키지 영구 식별, AAB/서명, 30·80·4,000자 |
| 등록 이미지 | [Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151) | 아이콘 512×512, 그래픽 1024×500, 실제 스크린샷 |
| 데이터 보안 | [Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469) | 웹/서버/제3자 처리 포함, 수집·공유·선택성·암호화·삭제 |
| 개인정보 | [User data](https://support.google.com/googleplay/android-developer/answer/10144311) | 공개 정책, 민감 데이터 고지, 실제 운영과 일치 |
| 계정 삭제 | [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) | 앱 내부 경로와 외부 웹 요청 경로, 관련 데이터 |
| 커뮤니티 | [User-generated content](https://support.google.com/googleplay/android-developer/answer/9876937) | 업로드 전 약관, 신고·사용자 차단·지속적 검토 |
| 생성형 AI | [AI-Generated Content](https://support.google.com/googleplay/android-developer/answer/13985936) | 유해 생성 방지·앱 내 신고·신고 활용 |
| 건강 기능 | [Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511), [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291), [Health categories](https://support.google.com/googleplay/android-developer/answer/13996367) | 기분·마음 관리 기능 분류, 건강 선언·비의료 고지·실제 데이터 처리 |
| 아동 안전 | [Child Safety Standards](https://support.google.com/googleplay/android-developer/answer/14747720) | 익명/랜덤 채팅 및 Social/Dating 해당 여부, 공개 기준·담당자·조치 |
| 미성년자 제한 | [Age-Restricted Content and Functionality](https://support.google.com/googleplay/android-developer/answer/16302250) | 익명 소통이 핵심 기능이면 콘솔의 미성년자 차단 필요 |
| 콘텐츠 등급 | [Content Ratings](https://support.google.com/googleplay/android-developer/answer/9898843), [Rating questionnaire](https://support.google.com/googleplay/android-developer/answer/9859655) | UGC·DM·민감 주제 등 실제 내용으로 IARC 설문. 희망 연령과 등급을 혼동하지 않음 |
| 심사 액세스 | [Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859455) | 핵심 기능을 확인 가능한 유효한 테스트 계정·경로 |

소로우에 대한 적용 판단 중 건강 분류·익명 채팅 핵심 기능 여부·공유 예외 여부는 **코드와 기능을 근거로 한 검토 항목**입니다. 앱의 최종 형태와 계약/운영 사실에 따라 운영자가 확정해야 하며, Google이 해당 분류나 출시를 승인했다는 의미가 아닙니다.
