# 우유니: 하늘이 머무는 곳

소로우 홈의 함께 쉬기 카드에서 **우유니**를 고르면 `/uyuni?communityId=…`로 입장합니다. 바닷가와 같은 멤버 확인을 거치며 소로우·지도별로 최대 100명, 별빛 자리 8개와 호텔 침구 4자리를 별도로 관리합니다. 지도 선택은 바닷가의 모닥불·온천·오두막 이용 상태와 섞이지 않습니다.

## 호텔에서 쉬기

수면 위에 **새벽빛 호텔**과 **별물결 호텔**을 한 채씩 배치합니다. 두 호텔은 열린 앞면으로 하늘과 물을 바라보는 둥근 지붕의 목조 숙소입니다. 실내에는 침구 두 자리와 소파, 작은 테이블이 있고, 앞 테라스에는 휴식 의자가 있습니다. 얕은 물에서 앞쪽 경사로를 따라 높이 0.48m의 데크에 올라갈 수 있습니다.

| 호텔 | 서버 휴식 자리 | 중심 좌표 (x, z) | 침구 정원 |
| --- | --- | --- | --- |
| 새벽빛 호텔 | `hotel-dawn` | (-12, 23) | 2명 |
| 별물결 호텔 | `hotel-dusk` | (12, 29) | 2명 |

- 침구는 서버가 빈 자리를 배정합니다. 같은 요청의 재시도는 같은 자리를 유지하며, 일어나기·퇴장·방문 만료 시 자리를 해제합니다. 다른 소로우와 지도에는 점유 상태가 전달되지 않습니다.
- 각 호텔의 슬롯은 0과 1이며, 눕는 좌표는 `x = 중심 x + (슬롯 - 0.5) × 3`, `z = 중심 z + 1.5`, 방향은 `π`입니다. 서버가 확인한 눕기 상태를 받은 뒤 자세를 바꾸고, 위치 갱신 요청으로 침구 자리를 벗어날 수 없게 합니다.
- 호텔 중심으로부터 5.5m 이내이면서 실내 범위 `x ±4.35m`, `z -4.5m … +4.45m` 안에 있어야 침구를 이용할 수 있습니다. 벽 바깥에서 요청하면 거절하고, 두 자리가 모두 사용 중이면 다른 호텔을 안내합니다.
- 침구로 갈 때는 가구와 벽을 피해 걸어갑니다. 누운 뒤에는 실내에서 내 모습을 보는 3인칭과 열린 앞면의 풍경을 보는 1인칭을 전환할 수 있습니다. 일어나면 눕기 전의 실내 위치로 돌아옵니다.
- 실내 소파는 가까이에서 앉아 쉬고, 다시 누르거나 걸으면 일어나는 별도 휴식 동작입니다. 소파 동작과 서버가 관리하는 침구 점유는 구분합니다. 이동·소파 시점은 호텔의 벽과 곡면 천장을 고려하며, 침구 시점은 지붕 아래에 둡니다.
- 우유니는 `restEnabled`와 `bedEnabled`를 제공하지만 모닥불·벤치·온천은 제공하지 않습니다. 호텔 자리는 우유니에서만, 기존 오두막 침구는 바닷가에서만 사용할 수 있습니다.

## 풍경과 모바일 렌더링

- 낮에는 하얀 모래 위 얕은 물에 구름이 비치고, 밤에는 푸른 은하수와 그 반사가 중심이 됩니다.
- GPT가 생성한 하늘 이미지를 하늘과 물에서 함께 사용합니다. 수면의 반사 방향은 카메라와 물결의 법선으로 계산하며, 하늘의 별빛과 시간도 공유합니다.
- 화면을 다시 그리는 반사 카메라·렌더 타깃·후처리를 사용하지 않습니다. 수면은 삼각형 2개, 조명은 장면 전체에서 2개이며 그림자 맵을 끕니다. 우유니에는 해변 지형과 온천을 만들지 않으며, 호텔 표면은 기존 CDN의 목재·면 직물 텍스처를 함께 사용합니다.
- 두 호텔은 지붕·데크·침구 등의 geometry와 material을 공유하고, 반복되는 가구·구조물은 인스턴싱으로 묶습니다. 최종 호텔 모델 두 채의 합계는 삼각형 39,588개, draw call 37개, 공유 geometry 15개입니다. 침대 옆 조명은 재질의 발광으로 표현해 실시간 조명을 추가하지 않습니다. 이 수치는 캐릭터·하늘·수면을 포함한 전체 장면 수치와 구분합니다.
- 발걸음 파문은 최대 10개, 낮은 화질에서는 6개이며 3.6초 후 사라집니다. 매트 주변의 마른 모래와 호텔 데크·경사로 위에는 파문을 만들지 않습니다.
- 기존 모바일 해상도 제한과 느린 기기에서의 30fps 전환, 탭이 가려질 때 정지를 유지합니다. 수면에는 하늘을 반사하며 호텔·캐릭터·불꽃놀이를 별도 장면으로 다시 반사하지 않습니다. 호텔의 메시·재질·인스턴스와 공유 텍스처도 기존 장면 종료 시 정리 대상에 포함됩니다.
- 기존 바닷가 하늘의 틈 수정도 유지합니다. 하늘 전체를 삼각형 하나로 그려 화면 이음새가 생기지 않게 합니다.

## 이미지

- 생성 방식: GPT 기본 `image_gen` 도구. 첨부 게임 화면은 은하수 색과 분위기 참고용으로만 사용했습니다.
- 최종 프로젝트 파일: `frontend/public/beach/real/uyuni-milky-way-v1.webp` (1774 × 887, 443,462 bytes).
- 배포: <https://cdn.sorow.co.kr/beach/real/uyuni-milky-way-v1.webp>.
- SHA-256: `71e7d279f5ccc41007f0d93ea4b90cbc988b88e1b9be285d92ca9cedf94fc305`.
- 생성 PNG를 크기 변경 없이 WebP quality 95로 인코딩했습니다. 바이너리는 기존 CDN 관리 규칙에 따라 Git에서 제외하고 `frontend/public-assets.manifest.json`에 기록합니다.
- localhost, sorow.co.kr, www.sorow.co.kr 출처에서 HTTP 200, 원본 해시, image/webp, CORS를 확인했습니다. 서울 S3 기본 연결 경로가 시간 초과되어 이번 업로드 프로세스에만 `AWS_USE_DUALSTACK_ENDPOINT=true`를 사용했습니다.

최종 생성 프롬프트:

```text
Use case: photorealistic-natural. Asset type: production 2:1 panoramic NIGHT SKY TEXTURE for a romantic interactive Uyuni salt-flat environment, high resolution ideally 4096x2048. The attached screenshot is ONLY a mood reference for the blue-violet luminous Milky Way and tiny abundant stars; do not copy its game, character, UI, text, logos or frame. Generate a NEW seamless 360-degree equirectangular celestial panorama, only sky across the entire image, no land, no water, no reflection baked in, no horizon objects. The actual game will mirror this exact sky on shallow water at runtime. The main subject is an exceptionally beautiful richly detailed Milky Way river, a generous diagonal band sweeping from left lower-middle to right upper-middle across a deep sapphire and midnight-blue sky. Dense silver-white fine star dust, luminous lavender cloud structures, delicate dusty rose/pink nebula knots, restrained pale cyan haze, natural dark interstellar dust lanes; romantic and dreamlike but with the delicate realism of long-exposure astrophotography. Keep broad navy negative space beside the galaxy so the band reads clearly. Individual stars should be mostly fine crisp points with occasional subtle soft glow, never giant cross-shaped sparkles or repeating patterns. Make the galactic band visibly luminous, readable on a mobile display, not near-black and not a bright white blown-out streak. The sky should stay blue rather than purple wash. The band and all stars must have continuity with no patchwork, rectangle seams, hard geometric edges, text or artifacts. Equirectangular angular layout, 360 longitude by 180 latitude, smooth polar cap and matching left/right edge colors. Exact 2:1 wide landscape composition, no borders. Do not include any people, birds, creatures, moons, planets, mountains, buildings, salt, water, UI, letters, logos or watermark.
```

## 확인 범위

호텔 침구와 최종 카메라 수정 후 프론트 회귀 290개와 TypeScript 검사, 서버의 DB 없는 해변 검사 125개가 통과했습니다. 호텔별 좌표와 정원, 실내 경계, 동시 배정, 재시도·일어나기·퇴장·만료, 소로우·지도 격리와 모닥불 DB 무호출을 확인했습니다. 서버의 실제 PostgreSQL 통합 검사는 이번 범위에 포함하지 않았습니다.

마지막 시각 검수에서 침구에 손발이 비치던 부분을 보정하고 장식천을 제거했습니다. 이후 geometry 검사 7개, 호텔 상호작용 검사 4개, 엔진 검사 14개를 다시 통과했습니다. 이 후속 검사는 앞의 전체 회귀 개수에 중복으로 더하지 않습니다.

호텔·최종 카메라·침구 보정과 장식천 제거를 포함한 소스를 동결한 뒤 웹 `npm run build`와 앱인토스 `npm run build:ait`를 순서대로 실행해 모두 통과했습니다. 웹은 `/uyuni`를 포함한 정적 페이지 33개, 앱인토스는 정적 페이지 41개와 `out-ait/uyuni/index.html`, `sorow.ait`(2,130,523 bytes)를 생성했습니다. AIT에는 운영 API 주소 `https://api.sorow.co.kr`를 프로세스 환경으로만 지정했으며 설정 파일 생성이나 배포는 하지 않았습니다.

AIT 실행 전에 `.ait-stash`와 `out-ait`의 절대경로가 `frontend` 내부인지 확인했습니다. 빌드 전후 app 전체·관련 설정·우유니 원본 이미지 87개 파일의 SHA-256이 모두 같았고 `.ait-stash`도 남지 않았습니다. 우유니 원본 이미지는 보존하며 앱인토스 정적 결과에서는 서비스 워커와 오프라인 페이지를 제거했습니다.

브라우저에서는 API 응답을 검사용으로 대체하고 실제 CDN 자산과 실제 WebGL 렌더러로 확인합니다. 휴대전화 화면 크기·터치 조건은 재현하지만 GPU는 데스크톱 GTX 1060이므로 실기기 성능을 보장하는 측정은 아닙니다. 실제 서비스에서 새 지도에 입장하려면 프론트와 백엔드를 함께 반영해야 합니다.

호텔과 최종 카메라 수정을 포함한 장면을 390 × 844 CSS 화면, 렌더 버퍼 401,692픽셀에서 확인했습니다. GTX 1060으로 120프레임을 측정한 결과 중앙값 16.5ms, 95백분위 21.7ms, WebGL 오류 0, 페이지 오류 0이었습니다. 이는 데스크톱 GPU에서 휴대전화 화면 조건을 재현한 결과이며 실제 휴대전화의 성능 측정값은 아닙니다. 사진 캡처 PNG 생성, 이동 중 파문, 별빛 자리의 눕기·하늘 시점 전환 확인도 유지합니다.
