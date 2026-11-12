import styles from "./MoruPet.module.css";

export type MoruMood = "idle" | "happy" | "eat" | "sleep" | "pet";
const INK = "#4a3528";
/**
 * 모루: 머리에 보랏빛 새싹이 난 하얀 찹쌀떡 같은 친구. 처진 눈과 조용한 표정은 그대로, 손그림 선(짙은 갈색 외곽선, 단색 면)으로 그린다.
 * 128×122 칸. 몸짓은 클래스(body·sprout·blink·wave·heart·rice)에 걸린 애니메이션이 맡는다.
 */
export default function MoruSprite({ mood, level = 1 }: { mood: MoruMood; level?: number }) {
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-hand="" aria-hidden="true" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="64" cy="112" rx="44" ry="4.5" fill="#2a1b13" opacity=".16" stroke="none" />
    <g className={styles.body}>
      <g className={styles.sprout}>
        <path d="M64 38C63 32 64 27 65 23" />
        <path fill="#b99bd4" d="M63 24C52 25 40 19 33 9C46 6 58 12 63 24Z" />
        <path fill="#b99bd4" d="M66 23C74 12 88 8 100 12C94 22 80 26 66 23Z" />
        <path stroke="#8f73b3" strokeWidth="1.6" d="M39 11C47 14 55 19 61 23M95 13C86 15 76 19 69 22" />
        {level >= 10 && <g strokeWidth="1.6">
          {[[64, 12], [70, 17], [68, 24], [60, 24], [58, 17]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#f6b6c8" />)}<circle cx="64" cy="19" r="3" fill="#ffe2a0" />
        </g>}
      </g>
      {/* 둥글고 넓적한 몸 */}
      <path fill="#fffaf3" d="M64 36C88 35 106 50 112 72C116 88 110 104 96 107C82 110 46 110 32 107C18 104 12 88 16 72C22 50 40 35 64 36Z" />
      <path stroke="none" fill="#e9dff0" d="M19 84C28 99 46 103 64 103C82 103 100 99 109 84C110 97 102 105 92 106C78 108 50 108 36 106C26 105 18 97 19 84Z" />
      <path fill="#fffaf3" d="M30 104C30 99 44 99 45 104C45 109 31 110 30 104ZM83 104C84 99 98 99 98 104C97 110 83 109 83 104Z" />
      {level >= 3 && (mood === "happy" || mood === "pet") && <path className={styles.wave} fill="#fffaf3" d="M103 82C104 72 111 63 117 65C122 69 118 81 110 89Z" />}
      <g className={styles.face}>
        <ellipse cx="29" cy="87" rx="7" ry="3.6" fill={happy ? "#f2b3cb" : "#eadbec"} stroke="none" />
        <ellipse cx="99" cy="87" rx="7" ry="3.6" fill={happy ? "#f2b3cb" : "#eadbec"} stroke="none" />
        {happy && <path fill="#ffe9a8" strokeWidth="1.2" d="M31 61C31.500 64 33 65.500 36 66C33 66.500 31.500 68 31 71C30.500 68 29 66.500 26 66C29 65.500 30.500 64 31 61ZM97 61C97.500 64 99 65.500 102 66C99 66.500 97.500 68 97 71C96.500 68 95 66.500 92 66C95 65.500 96.500 64 97 61Z" />}
        {mood === "sleep" ? <path strokeWidth="3" d="M37 76Q47 83 57 77M71 77Q81 83 91 76" />
          : happy ? <path strokeWidth="3.2" d="M37 80Q47 66 57 80M71 80Q81 66 91 80" />
          : <g className={styles.blink}>{/* 바깥쪽이 처진 반쯤 감긴 눈 */}
            <path fill="#4f3d59" strokeWidth="2.2" d="M35 72L58 68C60 78 57 87 48 87C40 87 35 81 35 72Z" />
            <path fill="#4f3d59" strokeWidth="2.2" d="M93 72L70 68C68 78 71 87 80 87C88 87 93 81 93 72Z" />
            <circle cx="52" cy="74.500" r="1.800" fill="#fff" stroke="none" /><circle cx="76" cy="74.500" r="1.800" fill="#fff" stroke="none" />
          </g>}
        {mood === "eat" ? <path fill="#80617f" strokeWidth="2" d="M60 88C60 85 68 85 68 88C68 94 60 94 60 88Z" />
          : happy ? <path stroke="#8a6a8a" strokeWidth="2.2" d="M59 88Q61.500 92 64 89Q66.500 92 69 88" />
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
