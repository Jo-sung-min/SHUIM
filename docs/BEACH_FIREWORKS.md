# 바닷가 불꽃놀이

관리자로 방에 들어오면 상단에 **불꽃놀이** 버튼이 나타납니다. 버튼을 열어 **축제**, **송이 안녕?**, **사랑해** 중 하나를 고르면 약 12초 동안 불꽃이 피어납니다. 축제는 2~3발이 한꺼번에 터지는 큰 불꽃이고, 문구 버전은 불꽃 입자가 한글을 만들었다가 반짝이며 흩어집니다. 다음 발사까지 방 전체에 15초의 대기 시간이 적용됩니다. 다른 방문자는 같은 종류·색·궤적·재생 시점의 불꽃을 함께 봅니다.

관리자 권한은 백엔드에서 현재 로그인 사용자와 해당 방의 입장 티켓을 함께 확인합니다. 같은 요청을 다시 보내도 중복 발사되지 않습니다. 기능을 실서버에서 사용하려면 프런트엔드와 백엔드를 함께 배포해야 합니다.

## 렌더링

고정된 GLB 대신 Three.js Points와 GPU 궤적을 사용합니다. 상승하는 꼬리, 구형 확산, 고리, 천천히 떨어지는 금빛 잔광과 작은 반짝임을 여러 색으로 표현합니다. 실제 광원이나 그림자 패스는 추가하지 않으며 모바일에서는 입자 수를 줄입니다. 하늘만 보이는 누운 시점에서도 불꽃이 나타납니다.

Tripo는 발사대나 등처럼 형태가 고정된 소품에 적합합니다. 이 기능은 시간에 따라 확산·낙하·소멸하는 수많은 입자가 중심이라 Three.js 입자 표현을 선택했습니다. [Three.js Points 공식 문서](https://threejs.org/docs/pages/Points.html), [Tripo 모델 최적화 안내](https://www.tripo3d.ai/blog/how-to-optimize-a-3d-model-polygons-textures-ai)를 참고했습니다.

## 생성 이미지

- 생성 도구: 내장 image_gen, 투명 배경 사용.
- 배포 이미지: [firework-spark-v1.webp](https://cdn.sorow.co.kr/beach/fx/firework-spark-v1.webp) (256×256, 알파 보존, 15,150바이트). 원래 `frontend/public/beach/fx/firework-spark-v1.webp`를 생성했고, CDN 업로드와 검증 후 사용자 요청에 따라 로컬·Git 원본을 제거했습니다.
- 원본 보관: `frontend/out/beach-review/firework-spark-source.png` (로컬 검토용).
- 원본의 형태를 변경하지 않고 해상도와 형식만 모바일용으로 압축했습니다.

사용한 프롬프트:

> Create one premium photorealistic fireworks sparkle sprite texture for use as a small additive-blended particle in a Three.js night-sky fireworks effect. Square image, a single centered tiny brilliant white-hot point with a delicate warm ivory core, extremely fine irregular needle rays, subtle glowing diamond dust close to center, soft physically plausible circular light halo fading smoothly into fully transparent alpha. Subject occupies the central 40 percent, all four outer edges fully transparent. Mostly white and pale gold so it can be tinted pink, cyan, lavender, blue and gold by a shader. Realistic optical sparkle, refined luminous grain, airy delicate falloff, not a cartoon star icon, not a complete fireworks burst, no scene, no sky, no letters, no border, no checkerboard baked into pixels. Output actual transparent background.
