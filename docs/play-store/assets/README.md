# 소로우 Google Play 이미지

Play Console의 **기본 스토어 등록정보 → 그래픽**에서 아래 파일을 선택합니다.

| 입력란 | 파일 |
| --- | --- |
| 앱 아이콘 | `store-icon-512.png` (512 × 512, RGBA) |
| 그래픽 이미지 | `feature-graphic-1024x500.png` (1024 × 500, RGB) |
| 휴대전화 스크린샷 | `phone/` 안의 PNG 7장 (1080 × 1920, RGB) |
| 홍보용 콘셉트 컷 | `concept/` 안의 JPG 2장 (1080 × 1920) |

아이콘은 운영자가 선택한 `half-mask-original.png`에서 축소했습니다. `icon-512-original.png`는 이전 디자인의 보관본입니다.
그래픽 이미지는 이번에 제작한 `feature-background.jpg`와 한글 문구를 합성했습니다.
휴대전화 이미지 01–04는 불멍·수목원·대나무숲·풍등을 담았습니다. 05는 운영 사이트에서 캡처한 홈이고, 06과 07은 위로 피드에서 캡처한 ‘오늘의 희망’과 ‘오늘의 다정함’입니다. 캡처 원본은 `captures/`에 있습니다.
홍보용 콘셉트 컷은 친구 네 명이 휴대폰을 함께 보는 사진풍 이미지와 아바타 여섯 명이 모닥불에 모인 일러스트입니다. 두 컷은 이미지 생성으로 제작했습니다.

웹 자산과 스토어 PNG를 다시 만들려면 프로젝트 루트에서 `node docs/play-store/assets/build-assets.mjs`를 실행합니다. 한글을 포함한 이미지 재생성에는 맑은 고딕과 바탕 계열 글꼴이 필요합니다. `asset-validation.json`에는 출력 규격과 용량이 기록됩니다.

S3 연결이 가능한 환경에서 `python scripts/sync-public-assets.py --apply --only brand/`로 이번 웹 이미지 다섯 개만 올릴 수 있습니다. 저장된 `frontend/public-assets.manifest.json`과 변경된 프런트엔드를 함께 배포하면 CDN 주소가 적용됩니다.
