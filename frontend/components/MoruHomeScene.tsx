import MoruAtticScene from "./MoruAtticScene";
import MoruTrainScene from "./MoruTrainScene";
import MoruWindowBedScene from "./MoruWindowBedScene";

/** 화면에 쓰는 공간 이름 (서버의 이름보다 먼저 쓴다: 서버가 옛 이름을 줄 때도 그림과 이름이 맞게) */
export const HOME_NAMES: Record<number, string> = { 0: "기차 침대칸", 1: "다락방", 2: "창가 침대방" };

/** 공간마다의 그림: 0 기차 침대칸 · 1 다락방 · 2 창가 침대방 (그 뒤는 아직 준비 중이라 창가 침대방을 쓴다) */
export default function MoruHomeScene({ homeId = 0, scene = 0 }: { homeId?: number; scene?: number }) {
  if (homeId === 0) return <MoruTrainScene scene={scene} />;
  if (homeId === 1) return <MoruAtticScene scene={scene} />;
  return <MoruWindowBedScene scene={scene} />;
}
