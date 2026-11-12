export type MapId = "beach" | "uyuni" | "bamboo" | "garden" | "cloudspa" | "baikal";

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
  cloudspa: {
    id: "cloudspa", name: "구름미그린 온천", path: "/cloudspa",
    eyebrow: "도시의 불빛 위에 머무는 밤",
    description: "구름산을 따라 이어지는 다섯 온천과 포근한 리조트. 발아래 도시의 야경을 바라봐요.",
    welcome: "구름 위 따뜻한 물에 몸을 맡겨요.",
    loading: "구름미그린 온천으로 가는 중", loadingDetail: "도시의 불빛을 품은 구름 위로",
  },
  baikal: {
    id: "baikal", name: "바이칼", path: "/baikal",
    eyebrow: "세 번의 온기, 끝에서 만나는 오로라",
    description: "눈과 푸른 얼음 호수를 건너 세 산장을 찾아가요. 멀리 닿은 마지막 산장에서는 밤하늘의 오로라가 펼쳐져요.",
    welcome: "눈보라를 지나 산장의 불빛으로 들어와요.",
    loading: "바이칼로 가는 중", loadingDetail: "눈보라 너머 산장의 불빛으로",
  },
} as const;

/**
 * 공간은 두 가지다. 누구나 들어오는 공용 공간(방 id "public", 서버 SpaceMaps.PUBLIC_ID 와 같다)과
 * 그 소로우의 멤버만 들어오는 소로우 공간(방 id 는 소로우 id). 소로우 공간의 풍경은 멤버가 늘수록 하나씩 열린다.
 */
export const PUBLIC_SPACE_ID = "public";

/** communityId 는 공간 id: 소로우 id 또는 공용 공간의 PUBLIC_SPACE_ID */
export function mapHref(mapId: MapId, communityId: string): string {
  return `${MAPS[mapId].path}?communityId=${encodeURIComponent(communityId)}`;
}

/** 들어서며 보이는 한 줄. 공용 공간에서는 '우리만의'라고 하지 않는다. */
export function mapEyebrow(mapId: MapId, shared: boolean): string {
  return shared && mapId === "beach" ? "누구나 쉬어 가는 해변" : MAPS[mapId].eyebrow;
}
