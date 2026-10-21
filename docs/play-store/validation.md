# 소로우 배포 준비 검증 기록

2026-10-21 · 운영자 루체 · 운영 서버/Play Console에는 배포하지 않음.

## 준비된 결과

- Android 앱 프로젝트: `android/`, 앱 ID `kr.co.sorow.app`, API 36.
- 설치 가능한 테스트 파일: `android/dist/sorow-1.0.0-debug.apk`.
- release 빌드 확인용 파일: `android/dist/sorow-1.0.0-UNSIGNED-VALIDATION.aab`. **서명되지 않아 Play 제출 불가.** 운영 업로드 키로 새 AAB를 만들어야 함.
- 도메인 연결 엔드포인트, 설치 매니페스트, 개인정보를 캐시하지 않는 오프라인 안내.
- 개인정보·약관·계정 삭제 안내, 계정 삭제, 사용자 차단, 안전 신고/관리자 검토, 커뮤니티 동의, AI 요청 전 안내.
- 공개 관리자 우회 제거, 삭제 계정 확인, 계정 전환 캐시 분리, 기록 전송 실패 시 무한 재시도 수정.
- 스토어 설명, 데이터 보안 작성 근거, 실기기 시험 순서 및 조직 계정 가입 안내.
- 스토어용 512×512 아이콘과 1024×500 소개 이미지: [이미지 파일과 원본](assets/README.md). 실제 휴대전화 스크린샷은 최종 Play 설치본에서 별도 촬영해야 함.

## 통과한 검증

| 범위 | 결과 |
| --- | --- |
| Android debug APK + lint | 성공 |
| Android release AAB + lint | 서명 없이 구성 검증 성공. 운영 서명 필수 보호 동작 별도 확인 |
| Android 16 에뮬레이터 | 설치·첫 실행·현재 운영 홈 표시 성공. 도메인 검증 전 주소창 있는 화면 |
| 프런트엔드 | TypeScript 검사·배포 빌드 성공 |
| 프런트 회귀 검사 | 오프라인 개인정보 캐시 3개, 기록 전송 재시도 4개, 계정별 커뮤니티 캐시 2개 통과 |
| 서버 | 32개 테스트 통과(실제 PostgreSQL 통합 검사 6개 포함, 건너뜀/실패 0). V1–V12 마이그레이션, 계정 삭제·차단·신고·동의, 다른 탭 계정 변경 시 삭제 거절, 신고자 보호 및 삭제/랭킹 동시 처리 검증. 결과는 `backend/build/reports/tests/test/index.html` |
| 새 공개 화면 | 로컬 브라우저에서 개인정보·계정 삭제 페이지와 루체 지원 이메일 표시 확인 |
| 웹 설치 자원 | 로컬 HTTP 점검에서 매니페스트·아이콘·오프라인 페이지·서비스워커 통과 |

Android 상세 검사와 파일 해시는 [Android 검증 기록](../../android/VALIDATION.md)에 있습니다. 서버 테스트는 운영 DB를 사용하지 않았고, 테스트용 DB와 미리보기 서버는 검증 후 종료했습니다. 전체 프런트-서버-운영 AI/S3/카카오 조합의 실기기 시험을 완료한 것은 아닙니다.

다시 검증하려면 프런트엔드에서 `npm ci`, `npm run typecheck`, `npm run test:offline`, `npm run test:records`, `npm run test:privacy`, `npm run build`를 실행합니다. 백엔드는 `gradlew.bat test`입니다. PostgreSQL 통합 검사는 기본적으로 건너뛰며, 별도로 준비한 폐기 가능한 로컬 `sorow_test` DB와 동명의 사용자에 한해 `SOROW_TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:<테스트포트>/sorow_test`로 활성화합니다. 운영 `DB_URL`은 사용하지 않습니다.

## 의도적으로 아직 통과하지 않는 출시 점검

`frontend`에서 `npm run check:release -- https://sorow.co.kr`를 실행합니다. 현재 코드의 로컬 점검에서는 다음 사항을 미완료로 정확히 표시합니다.

1. **앱 서명 인증서 없음:** `/.well-known/assetlinks.json`이 503. Play 앱 서명 인증서를 `ANDROID_SHA256_FINGERPRINTS`에 설정해야 함.
2. **정책 안내 준비용 상태:** 보유기간·처리업체/국가·시행일을 확정하고 `LEGAL_*`를 설정한 뒤 승인해야 함. 단순히 배너만 없애고 제출하면 안 됨.

운영자 가입·서명·공개 웹 배포·최종 스크린샷·데이터 보안 선언·기기 시험·심사 제출은 [배포 안내](README.md)의 순서로 진행합니다. 준비 코드와 검증용 AAB가 있다는 사실은 Google Play 심사 통과나 즉시 제출 가능 상태를 의미하지 않습니다.
