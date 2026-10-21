# 소로우 Android 앱

기존 `https://sorow.co.kr` 서비스를 Android 앱으로 여는 **Trusted Web Activity(TWA)** 프로젝트입니다. 웹의 로그인 쿠키, 서버 데이터, 화면을 그대로 사용합니다. 일반 앱 아이콘으로 실행하며, 앱과 웹사이트의 소유권 연결이 검증되면 주소 표시줄 없이 열립니다. 웹 수정은 웹 서버에 배포하고, 앱 아이콘·패키지·SDK·서명 변경은 새 Android 버전으로 배포합니다.

이번 작업의 테스트 APK·검증용 AAB·실행 확인 결과는 [VALIDATION.md](VALIDATION.md)에 정리했습니다. `dist/`의 AAB는 서명 없는 검증용이며 실제 Play 제출에는 아래 절차로 생성한 서명된 AAB를 사용합니다.

## 프로젝트 설정

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 소로우 |
| 패키지 ID | `kr.co.sorow.app` |
| 첫 실행 주소 | `https://sorow.co.kr/?source=android` |
| 앱 링크 도메인 | `sorow.co.kr` (www 도메인은 포함하지 않음) |
| 최초 버전 | `versionCode 1`, `versionName 1.0.0` |
| 지원 Android | 6.0(API 23) 이상 |
| 대상·컴파일 SDK | Android 16(API 36) |
| 빌드 도구 | Gradle 8.14.3, Android Gradle Plugin 8.10.1, JDK 17 또는 21 |
| 브라우저 연결 라이브러리 | 공식 `android-browser-helper 2.7.3` |

Play Console에서 최초 앱 업로드 전에 패키지 ID를 확정하세요. 다른 ID를 선택하면 `app/build.gradle`의 `namespace`·`applicationId`와 웹사이트 assetlinks 설정을 같이 변경해야 합니다. 처음 등록한 앱의 패키지 ID는 이후 변경할 수 없습니다.

앱은 호환 브라우저가 필요합니다. 현재 Chrome을 설치·업데이트한 Android 기기에서 먼저 검사하세요. 도메인 검증 실패 또는 TWA 미지원 시에는 주소 표시줄이 있는 브라우저 화면으로 열립니다. 네트워크 장애 대응은 웹 서비스 워커·오프라인 페이지가 담당하며, 최초 실행에는 인터넷이 필요합니다. 이 프로젝트는 네이티브 결제·광고·위치·카메라 SDK나 푸시 알림 기능을 추가하지 않습니다.

## 1. Android Studio에서 테스트 앱 만들기

1. Android Studio에서 이 저장소의 `android` 폴더를 엽니다.
2. SDK Manager에서 **Android 16(API 36)**, Android SDK Build-Tools, Platform-Tools를 설치합니다.
3. Gradle JDK를 **17 또는 21**로 지정하고 Gradle 동기화가 끝날 때까지 기다립니다. SDK 위치는 Android Studio가 `local.properties`에 기록합니다.
4. USB 디버깅을 켠 Android 기기를 연결하거나 Chrome이 설치된 에뮬레이터를 시작합니다.
5. Run을 눌러 설치합니다. 테스트 앱 이름은 **소로우 테스트**입니다.

명령으로 실행할 경우 PowerShell에서:

```powershell
Set-Location D:\projectT\sorow\android
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

macOS/Linux에서는 `sh ./gradlew :app:assembleDebug :app:lintDebug`를 사용합니다.

결과 APK는 `app/build/outputs/apk/debug/app-debug.apk`입니다. 기기에 직접 설치할 수 있으며 Play Console에 업로드하는 배포 파일은 아닙니다. 디버그와 배포 앱은 패키지 ID가 같고 서명이 달라 동시에 설치되지 않습니다. 서명이 다른 빌드를 바꿔 설치할 때는 기존 앱을 제거하세요.

## 2. 업로드 키 준비

Play Console 업로드용 키는 사용자가 직접 생성하고 안전하게 보관합니다. **키·비밀번호는 Git에 올리지 마세요.** 키 분실에 대비한 별도 백업을 보관하세요.

Android Studio의 **Build → Generate Signed App Bundle / APK → Android App Bundle → Create new**에서 업로드 키를 생성할 수 있습니다. `Key alias`는 `sorow-upload`를 권장하고, keystore 파일은 저장소 밖에 저장합니다. 생성 화면에 실제 운영자 정보를 입력합니다.

명령으로 키를 만들고 싶다면, JDK의 `keytool`로 아래를 실행합니다. 비밀번호는 명령행에 쓰지 않고 프롬프트에서 입력합니다.

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\sorow-keys"
keytool -genkeypair -v -keystore "$env:USERPROFILE\sorow-keys\sorow-upload.jks" -alias sorow-upload -keyalg RSA -keysize 2048 -validity 10000
```

`keystore.properties.example`을 `keystore.properties`로 복사하고 실제 경로·비밀번호·별칭을 입력합니다. Windows 경로는 예제처럼 `C\:/Users/...` 형태로 입력합니다. 이 파일과 keystore는 Git 제외 대상입니다. 자동 빌드에서는 파일 대신 다음 환경변수를 사용해도 됩니다:

- `SOROW_UPLOAD_STORE_FILE`
- `SOROW_UPLOAD_STORE_PASSWORD`
- `SOROW_UPLOAD_KEY_ALIAS`
- `SOROW_UPLOAD_KEY_PASSWORD`

## 3. Play 업로드 파일 만들기

```powershell
.\gradlew.bat :app:bundleRelease :app:lintRelease
```

결과는 `app/build/outputs/bundle/release/app-release.aab`입니다. 서명 정보가 없으면 빌드를 명시적으로 중단하므로 서명되지 않은 파일을 배포 파일로 오해하지 않습니다. 테스트용 debug 키를 이 설정에 넣지 마세요.

Play Console에 앱을 만들고 **Play App Signing**을 사용합니다. 업로드 키와 Google Play가 사용자에게 배포할 때 쓰는 앱 서명 키는 역할이 다릅니다. 다음 단계의 웹사이트 검증에는 **앱 서명 키 인증서**가 필요합니다.

## 4. 앱과 웹사이트 연결

1. Play Console의 앱 무결성/앱 서명 화면에서 **앱 서명 키 인증서의 SHA-256**을 복사합니다.
2. 웹 서버의 `ANDROID_SHA256_FINGERPRINTS`에 그 값을 설정합니다. 여러 인증서가 필요한 경우 쉼표로 구분합니다. 기본 패키지 ID는 `kr.co.sorow.app`입니다. 패키지 ID를 바꿨다면 웹 서버의 `ANDROID_PACKAGE_NAME`도 변경합니다.
3. 프런트엔드를 배포한 후 아래 주소가 **리다이렉트 없이 HTTP 200 및 JSON**을 반환하는지 확인합니다.

   `https://sorow.co.kr/.well-known/assetlinks.json`

반환해야 하는 연결 정보의 형태입니다. 아래 SHA-256 문구를 실제 값으로 교체해야 하며 예시 자체는 사용할 수 없습니다.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "kr.co.sorow.app",
      "sha256_cert_fingerprints": ["PLAY_APP_SIGNING_CERTIFICATE_SHA256"]
    }
  }
]
```

로컬 APK 검증에는 해당 APK 서명 인증서가 별도로 필요합니다. `.\gradlew.bat :app:signingReport`에서 SHA-256을 확인할 수 있습니다. 운영 사이트에 디버그 인증서를 영구 등록하지 마세요. 우선 Play **내부 테스트 트랙**에 AAB를 올리고 Play에서 설치해 최종 앱 서명 인증서로 확인하는 것을 권장합니다. 내부 앱 공유는 별도의 서명 키를 쓸 수 있으므로 내부 테스트 트랙과 혼동하지 마세요.

브라우저 주소 표시줄이 계속 보이면 패키지 이름, SHA-256, 실제 접속 도메인, HTTPS 인증서, JSON 응답을 확인합니다. 앱 검증은 캐시될 수 있습니다. Android 12 이상에서 필요하면 다음 명령으로 앱 링크 상태를 다시 검사합니다:

```powershell
adb shell pm verify-app-links --re-verify kr.co.sorow.app
adb shell pm get-app-links kr.co.sorow.app
```

사이트가 `www.sorow.co.kr`이나 다른 도메인으로 이동한다면 그 도메인도 별도 검증·앱 설정이 필요합니다. 현재 앱은 기본 운영 주소 `https://sorow.co.kr`만 신뢰합니다.

## 5. 기기에서 확인할 항목

- Play 내부 테스트로 설치 → 소로우 실행 → 주소 표시줄 없이 홈이 표시되는지
- 로그인·로그아웃, 앱 종료 후 재실행, 가입·탈퇴 및 삭제 요청 경로
- 기록·피드·댓글·메시지 등 제공 중인 기능과 시스템 뒤로가기
- 한글 키보드, 다크 모드, 화면 회전, 큰 글꼴·화면 확대, 작은 화면·태블릿
- 공유 링크를 눌렀을 때 정확한 경로로 이동하는지, 외부 링크와 로그인 전환이 가능한지
- 인터넷 끊기·재연결, 서버 오류, 서비스 워커 새 버전 적용
- Play 사전 출시 보고서의 충돌·접근성 검사

앱에서 네이티브 라이브러리(`.so`)를 직접 포함하지 않지만, 의존성을 변경할 때는 Play의 16KB 메모리 페이지 크기 요구사항을 다시 확인하세요. 실제 사용자 데이터 수집은 연결된 웹서비스까지 포함해 Play 데이터 보안에 신고해야 합니다.

다음 배포부터는 `app/build.gradle`의 `versionCode`를 **매번 1 이상 증가**시키고 `versionName`을 갱신한 뒤 동일한 업로드 키로 AAB를 만듭니다.

## 공식 참고 자료

- [TWA 개요와 웹사이트 소유권 검증](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [android-browser-helper 공식 릴리스](https://github.com/GoogleChrome/android-browser-helper/releases/tag/android-browser-helper-2.7.3)
- [Android Gradle Plugin 8.10 호환성](https://developer.android.com/build/releases/agp-8-10-0-release-notes)
- [Google Play 대상 API 요구사항](https://support.google.com/googleplay/android-developer/answer/11926878?hl=ko)
- [앱 서명과 업로드 키](https://developer.android.com/studio/publish/app-signing)
- [Android App Links 검증](https://developer.android.com/training/app-links/verify-android-applinks)

정책·라이브러리 문서는 2026-10-21 기준 확인했습니다. 최종 제출 때 Play Console에 표시되는 요건을 다시 확인하세요.
