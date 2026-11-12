import type { MoruMood } from "./MoruSprite";
import styles from "./MoruPet.module.css";

const INK = "#4a3528";
/**
 * 모링: 추울수록 동그래지는 작은 흰 새. 손그림 선(짙은 갈색 외곽선, 단색 면)으로 그린다.
 * 모루와 같은 128×122 칸과 같은 몸짓 클래스(body·blink·heart·rice)를 써서 그대로 바꿔 끼운다.
 */
export default function MoringSprite({ mood, level = 1 }: { mood: MoruMood; level?: number }) {
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-hand="" aria-hidden="true" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="64" cy="113" rx="34" ry="4.5" fill="#2a1b13" opacity=".16" stroke="none" />
    <g className={styles.body}>
      {/* 긴 꽁지 */}
      <path fill="#7a6672" d="M88 52L104 24C107 19 115 22 113 28L103 60Z" />
      <path fill="#7a6672" d="M94 56L114 32C118 28 124 33 121 37L104 63Z" />
      {/* 발 */}
      <path stroke="#5d4a4e" strokeWidth="2.4" d="M53 106V113M53 113L48 116M53 113V117M53 113L58 116M75 106V113M75 113L70 116M75 113V117M75 113L80 116" />
      {/* 동그란 솜털 몸 */}
      <path fill="#fffdf8" d="M64 35C83 33 100 46 104 66C108 87 95 109 64 110C33 109 20 87 24 66C28 46 45 33 64 35Z" />
      <path stroke="none" fill="#efe7f0" d="M29 82C40 102 88 104 99 82C98 99 85 108 64 108C43 108 30 99 29 82Z" />
      <path strokeWidth="2.2" d="M59 36Q61 29 64 28M66 35Q69 30 73 30" />
      <path stroke="#d9cedb" strokeWidth="2" d="M37 91Q41 95 46 93M82 95Q87 96 91 92M57 99Q64 103 71 99" />
      {/* 어깨의 짙은 날개 */}
      <path fill="#7a6672" strokeWidth="2.2" d="M25 70C21 78 23 89 31 95C33 87 32 78 29 71Z" />
      <path fill="#7a6672" strokeWidth="2.2" d="M103 70C107 78 105 89 97 95C95 87 96 78 99 71Z" />
      {level >= 5 && <g>{/* 함께한 시간이 쌓이면 두르는 목도리 */}
        <path fill="#e3b560" d="M29 81C44 91 84 91 99 81C101 86 100 90 97 92C82 101 46 101 31 92C28 90 27 86 29 81Z" />
        <path fill="#e3b560" d="M80 96L86 109L95 106L90 93Z" /><path stroke="#c08f3d" strokeWidth="1.8" d="M44 89L43 96M60 92V99M76 91L77 98" />
      </g>}
      <g className={styles.face}>
        <ellipse cx="40" cy="75" rx="6.5" ry="3.8" fill={happy ? "#f59fb0" : "#f8bcc6"} opacity={happy ? ".8" : ".55"} stroke="none" />
        <ellipse cx="88" cy="75" rx="6.5" ry="3.8" fill={happy ? "#f59fb0" : "#f8bcc6"} opacity={happy ? ".8" : ".55"} stroke="none" />
        {mood === "sleep" ? <path strokeWidth="2.8" d="M44 66Q49 70 54 66M74 66Q79 70 84 66" />
          : happy ? <path strokeWidth="2.8" d="M44 68Q49 61 54 68M74 68Q79 61 84 68" />
          : <g className={styles.blink} style={{ transformOrigin: "64px 66px" }}>
            <circle cx="49" cy="66" r="3.9" fill="#2e2222" stroke="none" /><circle cx="79" cy="66" r="3.9" fill="#2e2222" stroke="none" />
            <circle cx="50.4" cy="64.5" r="1.3" fill="#fff" stroke="none" /><circle cx="80.4" cy="64.5" r="1.3" fill="#fff" stroke="none" />
          </g>}
        {mood === "eat"
          ? <path fill="#5d4a4e" strokeWidth="1.6" d="M60 68Q64 66 68 68L64 71ZM61 73.500H67L64 77.500Z" />
          : <path fill="#5d4a4e" strokeWidth="1.6" d="M60.500 69.500Q64 67.500 67.500 69.500Q66 74.500 64 75Q62 74.500 60.500 69.500Z" />}
      </g>
      {level >= 10 && <g strokeWidth="1.6">{/* 머리 위의 작은 꽃 */}
        {[[82, 33], [88, 38], [86, 45], [78, 45], [76, 38]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#f6b6c8" />)}<circle cx="82" cy="40" r="3" fill="#ffe2a0" />
      </g>}
      {mood === "eat" && <g className={styles.rice}>
        <path fill="#fffaf0" d="M50 97C52 86 76 86 78 97Z" /><path fill="#cdbbf0" d="M45 96H83C83 106 75 111 64 111C53 111 45 106 45 96Z" />
      </g>}
    </g>
    {(mood === "pet" || mood === "happy") && <path className={styles.heart} fill="#f29aab" strokeWidth="2" d="M18 50C10 44 8 38 12 35C15 33 18 36 18 38C18 36 21 33 24 35C28 38 26 44 18 50Z" />}
    {mood === "sleep" && <g className={styles.heart}>
      <path stroke={INK} strokeWidth="5" d="M97 31H106L97 41H106M111 18H118L111 26H118" /><path stroke="#fff6e0" strokeWidth="2.2" d="M97 31H106L97 41H106M111 18H118L111 26H118" />
    </g>}
  </svg>;
}
