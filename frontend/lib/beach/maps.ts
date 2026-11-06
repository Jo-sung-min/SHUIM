export type MapId = "beach" | "uyuni" | "bamboo" | "garden";

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
  bamboo: {
    id: "bamboo", name: "대나무숲", path: "/bamboo",
    eyebrow: "바람이 지나는 둘레길",
    description: "댓잎 사이로 난 길을 걷고, 정자에 앉아 함께 쉬어요.",
    welcome: "대나무 사이로 난 길을 천천히 걸어요.",
    loading: "대나무숲으로 가는 중", loadingDetail: "댓잎 소리 곁으로",
  },
  garden: {
    id: "garden", name: "봄물 정원", path: "/garden",
    eyebrow: "비를 듣는 호숫가",
    description: "버드나무 호수를 걷고, 통창 아래 앉아 비 내리는 물을 바라봐요.",
    welcome: "봄물이 고인 호수를 천천히 걸어요.",
    loading: "봄물 정원으로 가는 중", loadingDetail: "버드나무 그늘 곁으로",
  },
} as const;

export function mapHref(mapId: MapId, communityId: string): string {
  return `${MAPS[mapId].path}?communityId=${encodeURIComponent(communityId)}`;
}
