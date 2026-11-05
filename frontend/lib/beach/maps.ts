export type MapId = "beach" | "uyuni";

export const MAPS = {
  beach: {
    id: "beach", name: "바닷가", path: "/beach",
    eyebrow: "우리만의 프라이빗 해변",
    description: "하얀 모래와 푸른 바다, 포근하게 쉬어가요.",
    welcome: "하얀 모래와 파도 곁에서 쉬어가요.",
    loading: "바닷가로 가는 중", loadingDetail: "하얀 모래와 파도 소리 곁으로",
  },
  uyuni: {
    id: "uyuni", name: "우유니", path: "/uyuni",
    eyebrow: "하늘이 머무는 곳",
    description: "발끝에 비치는 하늘, 함께 천천히 걸어요.",
    welcome: "발끝에 비치는 별빛",
    loading: "우유니로 가는 중", loadingDetail: "하늘과 물이 맞닿은 곳으로",
  },
} as const;

export function mapHref(mapId: MapId, communityId: string): string {
  return `${MAPS[mapId].path}?communityId=${encodeURIComponent(communityId)}`;
}
