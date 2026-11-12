import type { CSSProperties } from "react";
import { assetUrl } from "@/lib/assets";
import { moringLoop, type MoringLoop } from "@/lib/moring";
import type { MoruMood } from "./MoruSprite";
import type { MoodStage } from "@/lib/moru-rules";
import styles from "./MoruPet.module.css";

/**
 * 모링: 추울수록 동그래지는 흰 솜털 새. 그림은 모두 이미지 에셋이다 (OpenAI 이미지로 만든 고화질 도트).
 * 표정마다 4프레임 움직임 판을 가로 띠 한 장(한 칸 300×310)으로 두고, 띠를 한 칸씩 넘겨 반복한다. 어느 띠를 쓸지는 lib/moring.ts.
 * 판마다 새의 크기·가운데·발끝을 맞춰 잘라 두어서(기준: 판에서 잰 새 폭 434px) 표정이 바뀌어도 새가 튀지 않는다.
 * 감정 띠 여섯(울적·가벼움·행복·포근·걱정·갸웃)은 꼬리 깃과 음표·물음표가 위로 나와서 칸 위에 40px 를 더 둔다(300×350, 발끝은 같은 자리).
 * 안기·간질이기·목욕·움찔 같은 손길 몸짓은 다른 친구와 같은 .sprite 애니메이션이 그 위에 얹힌다.
 */
const REF = { birdW: 434, half: 245, up: 501, down: 6 };
const S = 100 / REF.birdW; // 새 폭을 128×122 칸에서 100 으로
const FRAME = { x: 64 - REF.half * S, y: 112.5 - REF.up * S, w: REF.half * 2 * S, h: (REF.up + REF.down) * S };
/** 감정 띠의 칸: 위로 40px(띠 픽셀) 더 높다. 바깥 svg 는 overflow:visible 이라 128×122 위로 나와도 그려진다 */
const TALL_PX = 40;
const TALL_FRAME = { ...FRAME, y: FRAME.y - TALL_PX * (FRAME.h / 310), h: FRAME.h + TALL_PX * (FRAME.h / 310) };
const TALL = new Set<MoringLoop>(["gloomy", "light", "joy", "cozy", "worry", "curious"]);
/** 한 바퀴(네 칸)의 초 */
const SECONDS: Record<MoringLoop, number> = {
  idle: 3.2, // 슬픈 반쯤 감긴 눈 → 숨 들이쉬며 부풂 → 천천히 깜빡 → 내쉬며 옆을 힐끗
  happy: 1.2, // 쓰다듬기·안기·기뻐: 감은 눈웃음, 깡충, 착지하며 납작, 하트
  eat: 1.1, // 밥그릇 앞에서 부리로 집고 오물오물
  sleep: 4, // 감은 눈으로 숨쉬기, Z
  gloomy: 4.2, // 울적해: 처진 눈꺼풀로 아래를 보고 안쪽 눈썹이 올라감. 숨, 깜빡, 한숨
  light: 3, // 가벼워·그냥 왔어: 참고 그림 그대로의 작은 콩 눈. 숨, 깜빡, 위를 힐끗
  joy: 2.2, // 행복해: 감은 눈웃음(^ ^)과 붉은 볼, 좌우로 흔들리며 음표가 떠오른다
  cozy: 3.4, // 지쳤어·불안해: 편히 감은 눈으로 기대듯 기울어 천천히 숨 쉬고, 끝에 살짝 눈을 뜬다
  worry: 2.8, // 슬퍼: 안쪽 눈썹을 올린 콩 눈으로 올려다보고, 다가오고, 갸웃 (눈물은 없다)
  curious: 2.4, // 심심해: 동그래진 콩 눈과 한쪽 눈썹, 고개를 이쪽저쪽 갸웃, 물음표가 뜬다
};
/** 가라앉은 날(2단계)의 평소는 지금의 평소 띠를 조금 느리게 (1·4·5단계는 띠가 따로 있다) */
const IDLE_TEMPO: Record<MoodStage, number> = { 1: 1, 2: 1.3, 3: 1, 4: 1, 5: 1 };

export default function MoringSprite({ mood, stage = 3, talk = null }: { mood: MoruMood; level?: number; stage?: MoodStage; talk?: string | null }) {
  const name = moringLoop(mood, stage, talk);
  const seconds = SECONDS[name] * (name === "idle" ? IDLE_TEMPO[stage] ?? 1 : 1);
  const frame = TALL.has(name) ? TALL_FRAME : FRAME;
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-stage={stage} data-moring={name} aria-hidden="true">
    <ellipse cx="64" cy="113" rx="32" ry="4.5" fill="#2a1b13" opacity=".16" />
    {/* 한 칸만 보이는 창: 띠를 왼쪽으로 한 칸씩 넘긴다 (steps(4)). 지금 표정의 띠만 받는다. 동작 줄이기에서는 첫 칸에 멈춘다 */}
    <svg key={name} x={frame.x} y={frame.y} width={frame.w} height={frame.h} viewBox={`0 0 ${frame.w} ${frame.h}`} overflow="hidden">
      <image className={styles.moringLoop} href={assetUrl(`/moru/moring/moring-${name}-v1.webp`)} x="0" y="0" width={frame.w * 4} height={frame.h} preserveAspectRatio="none"
        style={{ "--loop-w": `${-frame.w * 4}px`, animationDuration: `${seconds}s` } as CSSProperties} />
    </svg>
  </svg>;
}
