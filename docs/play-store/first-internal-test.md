# 소로우 첫 내부 테스트

콘솔 대시보드의 앱 이름은 **sorow**이고, 이번 업로드 파일의 패키지는 **`kr.co.sorow.app`**입니다. 앱 이름과 패키지명은 별도입니다. 콘솔에 등록한 패키지 문자열이 일치하는지 첫 업로드 전에 확인하세요. 이번 번들은 버전 코드 1, 버전 이름 1.0.0이며 `https://www.sorow.co.kr/?source=android`를 엽니다.

## 내 PC에서 업로드 키와 서명 파일 만들기

1. `sorow-play-internal-1.0.0.zip`을 풀고 그 폴더에서 PowerShell을 엽니다. JDK 17 또는 21의 `keytool.exe`와 `jarsigner.exe`가 PATH 또는 JAVA_HOME에 있어야 합니다.
2. 아래 명령을 실행하세요. 새 업로드 키 비밀번호를 정하고 확인 입력한 뒤, 서명 단계에서 같은 비밀번호를 한 번 더 입력합니다. 화면에서 입력한 글자는 보이지 않을 수 있습니다.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\sign-first-play-bundle.ps1
   ```

3. 같은 폴더에 **`sorow-1.0.0-PLAY.aab`**가 생깁니다. 업로드 키는 **`%USERPROFILE%\sorow-keys\sorow-upload.p12`**, 별칭은 `sorow-upload`입니다. 키 파일과 비밀번호를 별도로 안전하게 백업하세요. 다음 버전에도 같은 키를 씁니다. 프로젝트에서 빌드할 때는 [Android 빌드 안내](../../android/README.md)의 서명 설정에 이 파일과 별칭을 사용하세요.

## 대시보드에서 내부 테스트 시작

1. **대시보드 → ‘내부 테스트를 위해 검토 없이 앱 조기 출시’ → 할 일 보기**를 엽니다. 왼쪽 **테스트 및 출시 → 테스트 → 내부 테스트**에서도 접근할 수 있습니다.
2. **테스터**에서 본인 휴대폰의 Play 스토어에 로그인한 Google 계정을 이메일 목록에 넣고, 해당 목록 선택 후 저장합니다.
3. **버전 → 새 버전 만들기**에서 첫 앱의 Play 앱 서명 설정을 확인합니다. Google 생성 앱 서명 키를 사용하는 경우 Google이 배포용 키를 관리하고 위에서 만든 로컬 키로는 업로드 파일을 서명합니다. App Bundle 칸에 **PLAY.aab로 끝나는 파일**을 올립니다.
4. 출시명은 `1.0.0 (1)`, 한국어 출시 노트는 “소로우의 첫 Android 내부 테스트입니다. 마음 기록, 위로 피드, 모루와 함께하는 홈을 확인할 수 있어요.”를 입력할 수 있습니다. 검토 화면에서 **내부 테스트** 트랙을 확인한 뒤 출시하고, 테스터 탭의 참여 링크로 가입해 Play에서 설치합니다.
5. **테스트 및 출시 → 설정 → 앱 서명** 또는 콘솔의 **앱 무결성 → 앱 서명**에서 **앱 서명 키 인증서의 SHA-256**을 복사합니다. Vercel 프런트 프로젝트의 Production 환경 변수 `ANDROID_SHA256_FINGERPRINTS`에 설정하고 재배포합니다. `https://www.sorow.co.kr/.well-known/assetlinks.json`을 열어 리디렉션 없이 200 JSON으로 패키지명과 그 지문이 반환되는지 확인합니다. Play에서 설치한 앱으로 주소창 없이 열리는지, 로그인·기록·뒤로가기가 되는지 확인합니다.

## 공개 심사 전 콘솔에 입력할 내용

| 콘솔 항목 | 소로우에 입력하거나 확인할 내용 |
| --- | --- |
| 기본 스토어 등록정보 | 기본 언어 한국어, 이름 제안 **소로우 - 마음 기록과 위로**, 한 줄 소개 **오늘의 마음을 기록하고 변화의 흐름을 돌아보며 서로에게 위로를 건네는 공간**. 자세한 설명은 등록정보 초안에서 실제 배포한 기능에 맞게 선택합니다. |
| 그래픽 | ZIP 안의 `store-icon-512.png`, `feature-graphic-1024x500.png`, 내부 테스트 앱에서 개인정보 없이 찍은 휴대전화 스크린샷 최소 2장 |
| 연락처·지원 | `developer@lucelab.co.kr`의 수신 여부 확인, 웹사이트 `https://www.sorow.co.kr` |
| 앱 액세스 | 이메일 로그인으로 주요 화면을 열 수 있는 일반 심사 전용 계정과 로그인 경로를 콘솔에 입력 |
| 개인정보·계정 삭제 | `https://www.sorow.co.kr/privacy`, `https://www.sorow.co.kr/account-deletion`. 실제 보관기간·처리업체·국외이전 내용을 확정하고 로그인 없이 외부에서 접근되는지 확인 |
| 데이터 보안 | 이메일·사용자 ID·마음 기록·사진·메시지·AI 전송과 서버 로그를 실제 운영 설정과 대조. 전송 암호화는 Vercel에서 백엔드까지 포함해 확인 |
| 콘텐츠 등급·연령·건강 | 사용자 게시물·댓글·DM·정서 기록에 맞춰 설문 응답. 가입 가능 연령은 만 14세 이상이며, 콘솔의 타깃 연령은 실제 의도한 이용자층에 따라 선택 |
| 광고·결제 | 유상 후원 배너의 실제 노출과 앱 안 디지털 상품 구매 가능 여부를 확인해 선언 |
| 아동 안전 | 소셜 기능에 대한 공개 기준 `https://www.sorow.co.kr/child-safety`, 앱 내 신고·차단, 신고를 실제 처리할 담당자 연락처 확인 |
| 배포 | 국가·가격을 확정하고 콘솔에 표시되는 테스트·제출 요건 완료. 새 개인 계정에 적용되는 비공개 테스트 요건은 개발자 계정 유형에 따라 확인 |

[Google 내부 테스트 안내](https://support.google.com/googleplay/android-developer/answer/9845334?hl=ko) · [Play 앱 서명](https://support.google.com/googleplay/android-developer/answer/9842756?hl=ko) · [데이터 보안](https://support.google.com/googleplay/android-developer/answer/10787469?hl=ko)
