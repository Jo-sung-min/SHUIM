# Play 등록 이미지

2026-10-21 제작. 기존 `frontend/public/favicon.svg`의 보라색과 두 원을 재사용했습니다. 사진·사용자 데이터·실행 화면을 합성하지 않았습니다.

| 파일 | 용도 |
| --- | --- |
| `feature-graphic-1024x500.png` | Play 그래픽 이미지. 1024×500, 불투명 RGB PNG |
| `store-icon-512.png` | Play 아이콘. 512×512, RGBA PNG. 기존 로고를 유지하고 배경만 사각형 전체로 채워 Play의 모서리 마스킹에 대응 |
| `icon-512-original.png` | 기존 런처 아이콘 원본 사본. 이미 둥근 모서리가 있으므로 제출에는 `store-icon-512.png` 사용 |
| `feature-graphic.svg`, `store-icon.svg` | 편집 가능한 원본 |
| `asset-validation.json` | 이미지 규격 검사 결과 |
| `build-assets.mjs` | 설치된 프런트엔드의 sharp를 사용한 재생성 도구 |

그래픽의 한글은 Windows 맑은 고딕, 영문은 Segoe UI로 렌더링했습니다. 다른 환경에서 재생성하면 해당 글꼴 또는 적절한 한글 대체 글꼴을 설치한 뒤 결과를 다시 확인합니다. PNG에는 이미 글자가 이미지로 반영되어 별도 글꼴 설치가 필요 없습니다.

재생성: 저장소 루트에서 `node docs/play-store/assets/build-assets.mjs`.

대체 텍스트 제안: “소로우. 슬픔을 나누면, 우리는 가까워진다. 나란히 겹치는 두 원.”

**휴대전화 스크린샷은 아직 없습니다.** 최종 운영 서버와 연결된 Play 설치본에서 직접 캡처하고, 실제 개인정보를 제거한 뒤 별도로 등록합니다. 이 그래픽을 앱 화면 스크린샷으로 제출하지 않습니다.
