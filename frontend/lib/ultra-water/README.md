# Ultra Water (가져온 코드)

- 원본: https://github.com/Humpalumps/Ultra-Water — MIT, commit `30ea65ecb0a66b137aa200d099965634bdd84d51` (2026-11-02)
- 바닷가 가까운 바다(`lib/beach/ultra-sea.ts`)가 쓰는 파일만 원본 `src/` 에서 그대로 가져왔다:
  `water/OceanSim.js`(FFT 물결), `water/OceanSurface.js`(물 표면 셰이더), `water/shoreMap.js`(해안 지도),
  `water/bakeTextures.js`(거품 무늬), `water/Caustics.js`(물속 빛 무늬), `scene/floaterShadow.js`, `engine/fullscreen.js`.
  데모 장면(섬·하늘·후처리·물보라·물속 패스·부유물)은 쓰지 않아 가져오지 않았다.
- 원본 파일은 고치지 않는다. 바닷가에 맞춘 조정(해수면 높이, 그리는 반경, 톤 매핑)은 `ultra-sea.ts` 에서 셰이더 문자열에 덧댄다.
- `*.d.ts` 는 TypeScript 에서 가져다 쓰기 위한 최소 선언이다.
- 저작권·제3자 고지: `LICENSE`, `THIRD_PARTY_NOTICES.md` (배포물에 함께 실려야 한다).
