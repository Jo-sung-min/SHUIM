import type { MoodStage } from "@/lib/moru-rules";
import styles from "./MoruPet.module.css";

export type MoruMood = "idle" | "happy" | "eat" | "sleep" | "pet";
const INK = "#4a3528";
/** 오늘의 기분(마음 닮기)에 따른 새싹의 기울기: 가라앉은 날은 처진다. 평소의 흔들림은 그 위에 얹힌다 */
const SPROUT_TILT: Record<MoodStage, number> = { 1: -26, 2: -13, 3: 0, 4: 0, 5: 0 };
/** 평소 볼의 색: 가라앉은 날은 옅고, 가벼운 날은 분홍이 돈다 */
const REST_CHEEK: Record<MoodStage, string> = { 1: "#efe8f1", 2: "#ede2ee", 3: "#eadbec", 4: "#f0c9da", 5: "#f2b3cb" };
/**
 * 모루: 머리에 보랏빛 새싹이 난 하얀 찹쌀떡 같은 친구. 처진 눈과 조용한 표정은 그대로, 손그림 선(짙은 갈색 외곽선, 단색 면)으로 그린다.
 * 128×122 칸. 몸짓은 클래스(body·sprout·blink·wave·heart·rice)에 걸린 애니메이션이 맡는다.
 * stage 는 오늘의 기분(docs/MORU_MOOD_SYNC.md): 깨어 있는 평소(idle)의 얼굴만 바꾼다. 1 은 이불을 머리까지 쓰고, 5 는 눈웃음.
 * 손길·식사·잠의 얼굴은 어느 날이나 같다. 우는 얼굴은 없다.
 */
export default function MoruSprite({ mood, level = 1, stage = 3 }: { mood: MoruMood; level?: number; stage?: MoodStage }) {
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  const rest = mood === "idle" ? stage : 3; // 평소 얼굴에만 기분이 드러난다
  const smiling = happy || (mood === "idle" && rest === 5);
  const hood = mood === "idle" && rest === 1;
  const tilt = mood === "idle" ? SPROUT_TILT[stage] : 0;
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-stage={stage} data-hand="" aria-hidden="true" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="64" cy="112" rx="44" ry="4.5" fill="#2a1b13" opacity=".16" stroke="none" />
    <g className={styles.body}>
      <g transform={tilt ? `rotate(${tilt} 64 38)` : undefined}>
        <g className={styles.sprout}>
          <path d="M64 38C63 32 64 27 65 23" />
          <path fill="#b99bd4" d="M63 24C52 25 40 19 33 9C46 6 58 12 63 24Z" />
          <path fill="#b99bd4" d="M66 23C74 12 88 8 100 12C94 22 80 26 66 23Z" />
          <path stroke="#8f73b3" strokeWidth="1.6" d="M39 11C47 14 55 19 61 23M95 13C86 15 76 19 69 22" />
          {level >= 10 && <g strokeWidth="1.6">
            {[[64, 12], [70, 17], [68, 24], [60, 24], [58, 17]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#f6b6c8" />)}<circle cx="64" cy="19" r="3" fill="#ffe2a0" />
          </g>}
        </g>
      </g>
      {/* 둥글고 넓적한 몸 */}
      <path fill="#fffaf3" d="M64 36C88 35 106 50 112 72C116 88 110 104 96 107C82 110 46 110 32 107C18 104 12 88 16 72C22 50 40 35 64 36Z" />
      <path stroke="none" fill="#e9dff0" d="M19 84C28 99 46 103 64 103C82 103 100 99 109 84C110 97 102 105 92 106C78 108 50 108 36 106C26 105 18 97 19 84Z" />
      <path fill="#fffaf3" d="M30 104C30 99 44 99 45 104C45 109 31 110 30 104ZM83 104C84 99 98 99 98 104C97 110 83 109 83 104Z" />
      {level >= 3 && (mood === "happy" || mood === "pet") && <path className={styles.wave} fill="#fffaf3" d="M103 82C104 72 111 63 117 65C122 69 118 81 110 89Z" />}
      {hood && <g>{/* 울적한 날: 이불을 머리까지 쓰고 얼굴만 내민다 */}
        <path fill="#bfa6d1" fillRule="evenodd" d="M9 103C3 83 12 54 38 39C54 30 74 30 90 39C116 54 125 83 119 103C112 112 16 112 9 103ZM64 61C85 61 102 70 102 83C102 95 86 101 64 101C42 101 26 95 26 83C26 70 43 61 64 61Z" />
        <path stroke="#9a7fb5" strokeWidth="1.8" d="M40 43L33 59M64 34V57M88 43L95 59M15 80L23 83M113 80L105 83M40 104L42 109M64 105V110M88 104L86 109" />
      </g>}
      <g className={styles.face}>
        {!hood && <>
          <ellipse cx="29" cy="87" rx="7" ry="3.6" fill={happy ? "#f2b3cb" : REST_CHEEK[rest]} stroke="none" />
          <ellipse cx="99" cy="87" rx="7" ry="3.6" fill={happy ? "#f2b3cb" : REST_CHEEK[rest]} stroke="none" />
        </>}
        {happy && <path fill="#ffe9a8" strokeWidth="1.2" d="M31 61C31.500 64 33 65.500 36 66C33 66.500 31.500 68 31 71C30.500 68 29 66.500 26 66C29 65.500 30.500 64 31 61ZM97 61C97.500 64 99 65.500 102 66C99 66.500 97.500 68 97 71C96.500 68 95 66.500 92 66C95 65.500 96.500 64 97 61Z" />}
        {mood === "sleep" ? <path strokeWidth="3" d="M37 76Q47 83 57 77M71 77Q81 83 91 76" />
          : smiling ? <path strokeWidth="3.2" d="M37 80Q47 66 57 80M71 80Q81 66 91 80" />
          : <g className={styles.blink}>{/* 바깥쪽이 처진 반쯤 감긴 눈. 가라앉은 날은 눈꺼풀이 더 내려오고, 가벼운 날은 조금 더 뜬다 */}
            {rest === 1 ? <>
              <path fill="#4f3d59" strokeWidth="2.2" d="M36 81L58 77C59 82 56 87 48 87C42 87 37.500 85 36 81Z" />
              <path fill="#4f3d59" strokeWidth="2.2" d="M92 81L70 77C69 82 72 87 80 87C86 87 90.500 85 92 81Z" />
            </> : rest === 2 ? <>
              <path fill="#4f3d59" strokeWidth="2.2" d="M35 77L58 72C59.500 80 56.500 87 48 87C41 87 36 83.500 35 77Z" />
              <path fill="#4f3d59" strokeWidth="2.2" d="M93 77L70 72C68.500 80 71.500 87 80 87C87 87 92 83.500 93 77Z" />
              <circle cx="52" cy="77.500" r="1.500" fill="#fff" stroke="none" /><circle cx="76" cy="77.500" r="1.500" fill="#fff" stroke="none" />
            </> : rest === 4 ? <>
              <path fill="#4f3d59" strokeWidth="2.2" d="M35 70L58 65.500C60.500 77 57 87 48 87C40 87 35 80 35 70Z" />
              <path fill="#4f3d59" strokeWidth="2.2" d="M93 70L70 65.500C67.500 77 71 87 80 87C88 87 93 80 93 70Z" />
              <circle cx="52" cy="72.500" r="2.100" fill="#fff" stroke="none" /><circle cx="76" cy="72.500" r="2.100" fill="#fff" stroke="none" />
            </> : <>
              <path fill="#4f3d59" strokeWidth="2.2" d="M35 72L58 68C60 78 57 87 48 87C40 87 35 81 35 72Z" />
              <path fill="#4f3d59" strokeWidth="2.2" d="M93 72L70 68C68 78 71 87 80 87C88 87 93 81 93 72Z" />
              <circle cx="52" cy="74.500" r="1.800" fill="#fff" stroke="none" /><circle cx="76" cy="74.500" r="1.800" fill="#fff" stroke="none" />
            </>}
          </g>}
        {mood === "eat" ? <path fill="#80617f" strokeWidth="2" d="M60 88C60 85 68 85 68 88C68 94 60 94 60 88Z" />
          : smiling ? <path stroke="#8a6a8a" strokeWidth="2.2" d="M59 88Q61.500 92 64 89Q66.500 92 69 88" />
          : mood === "idle" && rest === 1 ? <path stroke="#9a7f9c" strokeWidth="2.2" d="M60 93.500Q64 90.500 68 93.500" />
          : mood === "idle" && rest === 2 ? <path stroke="#9a7f9c" strokeWidth="2.2" d="M60.500 92.500Q64 90.500 67.500 92.500" />
          : mood === "idle" && rest === 4 ? <path stroke="#8a6a8a" strokeWidth="2.2" d="M60 90Q64 93.500 68 90" />
          : <path stroke="#9a7f9c" strokeWidth="2.2" d="M61 91Q64 92.500 67 91" />}
      </g>
      {mood === "eat" && <g className={styles.rice}>
        <path fill="#fffaf0" d="M50 97C52 86 76 86 78 97Z" /><path fill="#cdbbf0" d="M45 96H83C83 106 75 111 64 111C53 111 45 106 45 96Z" />
        <path fill="#fffaf3" d="M38 99C38 95 47 95 47 99C47 104 38 104 38 99ZM81 99C81 95 90 95 90 99C90 104 81 104 81 99Z" />
      </g>}
      {mood === "sleep" && level >= 5 && <g>{/* 함께한 시간이 쌓이면 덮고 자는 담요 */}
        <path fill="#bfa6d1" d="M21 93C40 86 88 86 107 93C110 99 108 105 100 107C80 110 48 110 28 107C20 105 18 99 21 93Z" />
        <path stroke="#9a7fb5" strokeWidth="1.8" d="M44 90L42 108M64 88V109M84 90L86 108" />
      </g>}
    </g>
    {(mood === "pet" || mood === "happy") && <path className={styles.heart} fill="#f29aab" strokeWidth="2" d="M113 50C105 44 103 38 107 35C110 33 113 36 113 38C113 36 116 33 119 35C123 38 121 44 113 50Z" />}
    {mood === "sleep" && <g className={styles.heart}>
      <path stroke={INK} strokeWidth="5" d="M97 31H106L97 41H106M111 18H118L111 26H118" /><path stroke="#fff6e0" strokeWidth="2.2" d="M97 31H106L97 41H106M111 18H118L111 26H118" />
    </g>}
  </svg>;
}
