import type { MoruMood } from "./MoruSprite";
import bodyArt from "./moring/moring-body.webp";
import { BODY, BOWL, BROW, CELL, CHEEK, EYES, FACE, HEART, MOUTH_OPEN, ZZ, dots, type Dot } from "./moring/face";
import styles from "./MoruPet.module.css";

/** 도트 사각형 묶음 */
function Dots({ list }: { list: Dot[] }) {
  return <>{list.map((d, i) => <rect key={i} x={d.x} y={d.y} width={d.w} height={d.h} fill={d.fill} />)}</>;
}
const pair = (rows: readonly string[], dx = 0, dy = 0) => [
  ...dots(rows, FACE.eyeL[0] + dx, FACE.eyeL[1] + dy),
  ...dots(rows, FACE.eyeR[0] - dx, FACE.eyeR[1] + dy, CELL, true),
];
const brows = (rows: readonly string[]) => [
  ...dots(rows, FACE.eyeL[0] + CELL, FACE.eyeL[1] + FACE.browDy),
  ...dots(rows, FACE.eyeR[0] - CELL, FACE.eyeR[1] + FACE.browDy, CELL, true),
];
const [EYE_CX, EYE_CY] = [(FACE.eyeL[0] + FACE.eyeR[0]) / 2, FACE.eyeL[1]];
/** 잘 때의 Z 둘: 어두운 밤 창에서도 낮잠의 밝은 방에서도 보이게, 한 칸 아래에 짙은 그림자를 깐다 */
const zee = (x: number, y: number, cell: number) => [
  ...dots(ZZ, x + cell, y + cell, cell).map((d) => ({ ...d, fill: "#5e5478" })),
  ...dots(ZZ, x, y, cell).map((d) => ({ ...d, fill: "#f3eefc" })),
];
const SLEEP_Z = [...zee(104, 32, CELL * 1.6), ...zee(115, 19, CELL * 1.2)];

/**
 * 모링: 추울수록 동그래지는 흰 솜털 새. 몸통은 고화질 도트 그림(눈을 지운 것)이고, 표정은 같은 크기의 도트로 얹는다 (moring/face.ts).
 * 평소에는 바깥쪽이 처진 슬픈 눈과 걱정스러운 눈썹, 가끔 옆을 힐끗 보고 천천히 갸웃한다.
 * 웃을 때는 둥글게 감은 눈, 먹을 때는 부리를 벌리고, 잘 때는 감은 눈과 Z. 몸짓은 다른 친구들과 같은 클래스(body·blink·heart·rice)를 쓴다.
 */
export default function MoringSprite({ mood }: { mood: MoruMood; level?: number }) {
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  const sleeping = mood === "sleep";
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-hand="" data-moring="" aria-hidden="true">
    <ellipse cx="64" cy="113" rx="34" ry="4.5" fill="#2a1b13" opacity=".16" />
    <g className={styles.body}>
      <g className={styles.moringSway}>
        <image href={bodyArt.src} x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} />
        <g className={styles.face} shapeRendering="crispEdges">
          <g opacity={happy ? 0.75 : 0.4}><Dots list={[...dots(CHEEK, FACE.cheekL[0], FACE.cheekL[1]), ...dots(CHEEK, FACE.cheekR[0], FACE.cheekR[1])]} /></g>
          {sleeping ? <><Dots list={pair(EYES.sleep)} /><Dots list={brows(BROW.soft)} /></>
            : happy ? <Dots list={pair(EYES.smile)} />
            : <>
              {/* 평소: 슬픈 눈. 깜빡이고(blink), 가끔 옆을 힐끗 본다(moringGlance) */}
              <g className={styles.moringGlance}>
                <g className={styles.blink} style={{ transformOrigin: `${EYE_CX}px ${EYE_CY}px` }}><Dots list={pair(EYES.sad)} /></g>
              </g>
              <Dots list={brows(BROW.sad)} />
            </>}
          {mood === "eat" && <Dots list={dots(MOUTH_OPEN, FACE.mouth[0], FACE.mouth[1])} />}
        </g>
      </g>
      {mood === "eat" && <g className={styles.rice} shapeRendering="crispEdges"><Dots list={dots(BOWL, 64, 94, CELL * 2.4)} /></g>}
    </g>
    {(mood === "pet" || mood === "happy") && <g className={styles.heart} shapeRendering="crispEdges"><Dots list={dots(HEART, 110, 40, CELL * 2)} /></g>}
    {sleeping && <g className={styles.heart} shapeRendering="crispEdges"><Dots list={SLEEP_Z} /></g>}
  </svg>;
}
