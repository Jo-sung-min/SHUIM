import MoruAtticScene from "./MoruAtticScene";
import { DEFAULT_SKY, NO_DECOR, type Sky } from "./MoruScene";
import MoruTrainScene from "./MoruTrainScene";
import MoruWindowBedScene from "./MoruWindowBedScene";

/** 화면에 쓰는 공간 이름 (서버의 이름보다 먼저 쓴다: 서버가 옛 이름을 줄 때도 그림과 이름이 맞게) */
export const HOME_NAMES: Record<number, string> = {
  0: "기차 침대칸", 1: "다락방", 2: "창가 침대방",
  3: "이불 요새", 4: "캠핑카", 5: "숲속 오두막", 6: "유리 온실", 7: "책방 창가", 8: "관람차 칸",
};

/**
 * 공간마다의 그림: 0 기차 침대칸 · 1 다락방 · 2 창가 침대방 (그 뒤는 아직 준비 중이라 창가 침대방을 쓴다). 창밖은 오늘의 하늘.
 * decor 는 꾸미기 자리마다 놓인 가구 (자리 → 가구): 가구가 놓인 자리의 원래 소품은 그리지 않는다 (가구 그림은 MoruDecor 가 위에 얹는다)
 */
export default function MoruHomeScene({ homeId = 0, sky = DEFAULT_SKY, decor = NO_DECOR }: { homeId?: number; sky?: Sky; decor?: Record<string, string> }) {
  if (homeId === 0) return <MoruTrainScene sky={sky} decor={decor} />;
  if (homeId === 1) return <MoruAtticScene sky={sky} decor={decor} />;
  return <MoruWindowBedScene sky={sky} decor={decor} />;
}
