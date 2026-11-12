import type { OrbSpot } from "../emotion-orbs";
import type { MapId } from "./maps";

/**
 * 감정구슬이 놓이는 자리 (docs/EMOTION_ORBS.md 3장). 맵마다 이름 붙은 자리를 여럿 두고, 그날의 자리 둘레(2.5~5m)의
 * 걸어갈 수 있는 곳에 놓는다. 좌표는 각 맵의 배치 파일에서 옮겨 왔다 (오른쪽 주석). 설 수 있는지는 엔진의 충돌 규칙이
 * 그때그때 확인하므로(BeachEngine.settleOrb) 여기 좌표는 "그 근처"이면 된다.
 * r: 그 자리에 놓인 것의 반지름 (그만큼 떨어져 놓는다). avoid: 구슬을 두지 않는 원 (물속, 모닥불).
 */
export interface OrbGround { spots: readonly OrbSpot[]; avoid?: readonly { x: number; z: number; r: number }[] }

export const ORB_GROUNDS: Record<MapId, OrbGround> = {
  beach: {
    spots: [
      { id: "campfire", name: "모닥불", x: 0, z: 12, r: 4.8 }, // cove.ts FIRE, 벤치 고리 반지름 4
      { id: "starlight", name: "별빛 자리", x: 7, z: 7, r: 2.8 }, // stargazing.ts
      { id: "hut-pine", name: "솔바람 오두막 앞", x: -13, z: 16.5 }, // shelters.ts (-13, 24.8), 문은 바다 쪽
      { id: "hut-wave", name: "파도소리 오두막 앞", x: 0, z: 19.4 },
      { id: "hut-sunset", name: "노을 오두막 앞", x: 13, z: 16.5 },
      { id: "boulder-w", name: "서쪽 바위", x: -21, z: 11, r: 1 }, // cove.ts
      { id: "boulder-e", name: "동쪽 바위", x: 21, z: 14, r: 1.1 },
      { id: "shore", name: "파도가 닿는 모래", x: 0, z: -3 },
      { id: "shore-w", name: "서쪽 물가", x: -14, z: -2 },
      { id: "shore-e", name: "동쪽 물가", x: 14, z: -2 },
    ],
    avoid: [{ x: 0, z: 12, r: 4.9 }],
  },
  uyuni: {
    spots: [
      { id: "starlight", name: "별빛 자리", x: 7, z: 7, r: 2.8 },
      { id: "hotel-dawn", name: "새벽빛 호텔 앞", x: -12, z: 10 }, // uyuni-hotel-layout.ts, 경사로 앞
      { id: "hotel-dusk", name: "별물결 호텔 앞", x: 12, z: 16 },
      { id: "behind-dusk", name: "별물결 호텔 뒤편", x: 12, z: 44 },
      { id: "flat-mid", name: "소금 평원 한가운데", x: 0, z: -20 },
      { id: "flat-west", name: "서쪽 소금 평원", x: -17, z: -14 },
      { id: "flat-east", name: "동쪽 소금 평원", x: 17, z: -30 },
      { id: "flat-far", name: "소금 평원 끝", x: 0, z: -43 },
    ],
  },
  bamboo: {
    spots: [
      { id: "trail-gate", name: "둘레길 입구", x: 0, z: 7 }, // bamboo-trail.ts
      { id: "step-pavilion", name: "첫걸음정", x: 14, z: 10 },
      { id: "trail-west", name: "서쪽 대숲길", x: -26, z: 40 },
      { id: "trail-east", name: "동쪽 대숲길", x: 26, z: 40 },
      { id: "meadow", name: "중턱 풀밭", x: -25, z: 50 },
      { id: "wind-pavilion", name: "바람정", x: -33, z: 50 },
      { id: "pine-pavilion", name: "솔숲정", x: 31, z: 58 },
      { id: "trail-upper-w", name: "윗 대숲길", x: -19, z: 70 },
      { id: "trail-upper-e", name: "윗 대숲길", x: 19, z: 70 },
      { id: "moon-pavilion", name: "달빛정", x: -18, z: 80 },
      { id: "summit", name: "정상 공터", x: 0, z: 91 },
      { id: "sky-deck", name: "하늘전망대", x: 0, z: 100, r: 1 },
      { id: "guestbook", name: "축제 게시판", x: 9, z: 100 },
      { id: "secret-path", name: "비밀 정원 오솔길", x: -38, z: 97 },
    ],
  },
  garden: {
    spots: [
      { id: "gate-yard", name: "남문 안마당", x: 0, z: -8 }, // garden-layout.ts
      { id: "willow-dock", name: "버들 선착장", x: 21.5, z: 8.5 },
      { id: "bench-sw", name: "남서쪽 호숫가 벤치", x: -21.3, z: 9.1, r: 0.8 },
      { id: "bench-se", name: "남동쪽 호숫가 벤치", x: 27.1, z: 15.5, r: 0.8 },
      { id: "bench-w", name: "서쪽 호숫가 벤치", x: -34.8, z: 34, r: 0.8 },
      { id: "bench-e", name: "동쪽 호숫가 벤치", x: 39.9, z: 34, r: 0.8 },
      { id: "bench-nw", name: "북서쪽 호숫가 벤치", x: -30.5, z: 53.4, r: 0.8 },
      { id: "bench-ne", name: "북동쪽 호숫가 벤치", x: 27.9, z: 51.8, r: 0.8 },
      { id: "island", name: "연향정", x: -16, z: 36 },
      { id: "bridge", name: "구곡교", x: -30, z: 40 },
      { id: "hall-pier", name: "청우헌 물가", x: -17, z: 61 },
      { id: "hall-back", name: "청우헌 뒤뜰", x: 0, z: 87 },
      { id: "east-lawn", name: "동쪽 잔디밭", x: 47, z: 34 },
      { id: "west-walk", name: "서쪽 호숫가 산책길", x: -41, z: 30 },
    ],
  },
  cloudspa: {
    spots: [
      { id: "terrace-front", name: "리조트 앞 구름 테라스", x: 0, z: 84 }, // cloud-spa-layout.ts
      { id: "terrace-east", name: "리조트 옆 구름 테라스", x: 25, z: 102 },
      { id: "terrace-west", name: "리조트 옆 구름 테라스", x: -25, z: 102 },
      { id: "pool-1", name: "달빛 온천 물가", x: 22, z: 66 },
      { id: "pool-2", name: "별빛 온천 물가", x: -39, z: 34.8 },
      { id: "pool-3", name: "구름바다 온천 물가", x: -22, z: 3.6 },
      { id: "pool-4", name: "노을빛 온천 물가", x: 39, z: -27.6 },
      { id: "pool-5", name: "하늘품 온천 물가", x: -25, z: -60.5 },
    ],
    // 물속에는 두지 않는다 (탕의 물 반지름)
    avoid: [{ x: 0, z: 66, r: 20.3 }, { x: -18, z: 34.8, r: 19.3 }, { x: 0, z: 3.6, r: 20.3 }, { x: 18, z: -27.6, r: 19.3 }, { x: 0, z: -60.5, r: 23.3 }],
  },
  baikal: {
    spots: [
      { id: "shore-ice", name: "호숫가 얼음판", x: 0, z: 34 }, // baikal-layout.ts
      { id: "blue-ice", name: "푸른 얼음 언덕", x: 14.5, z: 17.5, r: 9 },
      { id: "cabin-warm", name: "첫 번째 온기 처마 앞", x: -10.5, z: 9.4 },
      { id: "larch-bank", name: "낙엽송 기슭", x: -41, z: 6 },
      { id: "ice-east", name: "동쪽 얼음 무리", x: 60, z: 30, r: 8.5 },
      { id: "route-bend", name: "안내등 길 굽이", x: 25, z: -45 },
      { id: "cabin-refuge", name: "눈길 쉼터 앞", x: 26, z: -72 },
      { id: "route-far", name: "눈보라 길", x: 78, z: -155 },
      { id: "cabin-aurora", name: "오로라 관측소 앞", x: 80, z: -195 },
    ],
  },
};
