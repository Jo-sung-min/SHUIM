# Android 배포 준비 검증 — 2026-10-21

현재 상태: **Android 테스트 앱 설치·실행 및 release AAB 구성 검증 완료. 운영 서명·도메인 연결·Play Console 제출은 미완료.**

## 전달 파일

| 파일 | 용도 | 상태 |
| --- | --- | --- |
| `dist/sorow-1.0.0-debug.apk` | Android 기기 직접 설치 테스트 | 디버그 서명, Play 업로드 금지 |
| `dist/sorow-1.0.0-UNSIGNED-VALIDATION.aab` | release 구성 빌드 성공 확인 | **서명 없음, Play 업로드 불가** |
| `dist/test-launch-api36.png` | Android 16 실제 실행 확인 | 도메인 검증 전 주소 표시줄 포함, 스토어 등록용 이미지 아님 |

`dist/`와 빌드 산출물은 Git에서 제외했습니다. 서명된 배포 AAB는 운영자가 업로드 키를 설정한 후 `gradlew.bat :app:bundleRelease :app:lintRelease`로 새로 만들어야 합니다. 절차는 [README.md](README.md)를 따릅니다.

## 확인한 결과

| 검사 | 결과 |
| --- | --- |
| `:app:assembleDebug :app:lintDebug` | 성공. Lint 오류 0개, 고정 Gradle 8.14.3의 새 패치 8.14.6 안내 1개 |
| `:app:bundleRelease :app:lintRelease -x :app:verifyReleaseSigning` | 검증을 위해 서명 확인 단계만 한 번 제외하여 **unsigned** AAB 생성 성공. Release lint 문제 없음. 생성 즉시 `UNSIGNED-VALIDATION` 이름으로 변경 |
| `:app:verifyReleaseSigning` | 업로드 키 누락 오류로 중단됨. 의도한 보호 동작 확인 |
| `aapt dump badging` | 패키지 `kr.co.sorow.app`, 버전 1 / 1.0.0-debug, minSdk 23, targetSdk 36 확인 |
| `apksigner verify` | 테스트 APK 서명 검증 통과 |
| `jarsigner -verify` | 검증용 AAB의 unsigned 상태 확인 |
| APK ZIP 내용 | `.so` 및 `lib/` 네이티브 라이브러리 항목 0개 |
| 병합 AndroidManifest 권한 | 인터넷 권한과 AndroidX의 앱 내부용 signature 권한만 존재. 위치·카메라·마이크·저장소·연락처·알림 권한 없음 |
| Android 16 / API 36 에뮬레이터 | APK 설치 성공, cold launch 성공, Chrome TWA 제공자 선택, 실제 `sorow.co.kr` 홈 표시, AndroidRuntime 충돌 기록 없음 |

에뮬레이터는 기존 기기 데이터를 저장하지 않는 `-read-only -no-snapshot` 방식으로 실행했고 검증 후 종료했습니다. 운영 사이트에 데이터 생성이나 로그인을 하지 않았습니다.

앱 화면은 운영 사이트의 기존 홈을 표시했습니다. Play 앱 서명 인증서가 웹사이트에 등록되기 전이라 주소 표시줄 있는 Custom Tab으로 열렸으며 이는 예상한 fallback 동작입니다. **주소 표시줄 없는 TWA 검증은 Play 내부 테스트 설치와 운영 assetlinks 배포 후 별도로 완료해야 합니다.**

## 파일 SHA-256

```text
072A79F6837F7A2CBDF301D84B3029292F2ECEE6C00A2684A855A0E749E4F4E7  sorow-1.0.0-debug.apk
96FAF91F3EFD7BC7A4EAB8F2E5F83031CBB9ABF446F91B09E3BB98CA978141C1  sorow-1.0.0-UNSIGNED-VALIDATION.aab
```

## 운영자가 이어서 해야 할 검증

1. 업로드 키 생성·보관 → 서명된 AAB 생성 → Play 내부 테스트 업로드.
2. Play **앱 서명 키 인증서** SHA-256을 `ANDROID_SHA256_FINGERPRINTS`에 설정하고 웹 서버 배포.
3. Play에서 설치한 앱의 전체 화면, 로그인·로그아웃·탈퇴, 주요 기능, 오프라인 대응 및 뒤로가기를 실제 기기에서 확인.
4. 개인정보처리방침·데이터 보안·콘텐츠 등급·계정 삭제 안내·스토어 이미지 등 Play 등록 절차 완료.

이 문서는 빌드 및 초기 실행 확인 기록입니다. 로그인 기능 전체 검사, 전체 화면 TWA 도메인 검증, Play 사전 출시 보고서, 심사 승인을 완료했다는 뜻은 아닙니다.
