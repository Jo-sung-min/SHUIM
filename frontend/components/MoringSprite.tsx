import type { CSSProperties } from "react";
import { assetUrl } from "@/lib/assets";
import type { MoruMood } from "./MoruSprite";
import styles from "./MoruPet.module.css";

/**
 * 모링: 추울수록 동그래지는 흰 솜털 새. 그림은 모두 이미지 에셋이다 (OpenAI 이미지로 만든 고화질 도트).
 * 표정마다 4프레임 움직임 판을 가로 띠 한 장(한 칸 300×310)으로 두고, 띠를 한 칸씩 넘겨 반복한다.
 *  - 평소: 슬픈 반쯤 감긴 눈 → 숨 들이쉬며 부풂 → 천천히 깜빡 → 내쉬며 옆을 힐끗
 *  - 웃음(쓰다듬기·안기): 감은 눈웃음, 깡충, 착지하며 납작, 하트가 떠오른다
 *  - 먹기: 밥그릇 앞에서 부리로 집고 오물오물
 *  - 잠: 감은 눈으로 숨쉬기, Z 가 떠오른다
 * 판마다 새의 크기·가운데·발끝을 맞춰 잘라 두어서(기준: 판에서 잰 새 폭 434px) 표정이 바뀌어도 새가 튀지 않는다.
 * 안기·간질이기·목욕·움찔 같은 손길 몸짓은 다른 친구와 같은 .sprite 애니메이션이 그 위에 얹힌다.
 */
const REF = { birdW: 434, half: 245, up: 501, down: 6 };
const S = 100 / REF.birdW; // 새 폭을 128×122 칸에서 100 으로
const FRAME = { x: 64 - REF.half * S, y: 112.5 - REF.up * S, w: REF.half * 2 * S, h: (REF.up + REF.down) * S };
const LOOPS: Record<"idle" | "happy" | "eat" | "sleep", { art: string; seconds: number }> = {
  idle: { art: assetUrl("/moru/moring/moring-idle-v1.webp"), seconds: 3.2 },
  happy: { art: assetUrl("/moru/moring/moring-happy-v1.webp"), seconds: 1.2 },
  eat: { art: assetUrl("/moru/moring/moring-eat-v1.webp"), seconds: 1.1 },
  sleep: { art: assetUrl("/moru/moring/moring-sleep-v1.webp"), seconds: 4 },
};

export default function MoringSprite({ mood }: { mood: MoruMood; level?: number }) {
  const name = mood === "sleep" ? "sleep" : mood === "eat" ? "eat" : mood === "happy" || mood === "pet" ? "happy" : "idle";
  const loop = LOOPS[name];
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-moring="" aria-hidden="true">
    <ellipse cx="64" cy="113" rx="32" ry="4.5" fill="#2a1b13" opacity=".16" />
    {/* 한 칸만 보이는 창: 띠를 왼쪽으로 한 칸씩 넘긴다 (steps(4)) */}
    <svg x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} overflow="hidden">
      <image key={name} className={styles.moringLoop} href={loop.art} x="0" y="0" width={FRAME.w * 4} height={FRAME.h} preserveAspectRatio="none"
        style={{ "--loop-w": `${-FRAME.w * 4}px`, animationDuration: `${loop.seconds}s` } as CSSProperties} />
    </svg>
  </svg>;
}
