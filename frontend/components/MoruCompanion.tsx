import MoruSprite, { type MoruMood } from "./MoruSprite";
import MoringSprite from "./MoringSprite";
import styles from "./MoruPet.module.css";

export const COMPANIONS = [
  { id: "moru", name: "모루", detail: "보랏빛 새싹" },
  { id: "noa", name: "노아", detail: "흑발 · 달빛 리본" },
  { id: "leo", name: "레오", detail: "금발 · 작은 망토" },
  { id: "lumi", name: "루미", detail: "라벤더 · 별빛 베레모" },
  { id: "moring", name: "모링", detail: "눈밭의 흰 솜털 새" },
];
/** 서버가 처음부터 알던 모습. 그 뒤에 생긴 모습(모링)은 서버가 받아 준다고 알려 줄 때만 고르게 한다 */
const FIRST_LOOKS = ["moru", "noa", "leo", "lumi"];
export const companionChoices = (allowed?: string[]) => COMPANIONS.filter((c) => (allowed ?? FIRST_LOOKS).includes(c.id));

const INK = "#4a3528";
const SKIN = "#ffe6cf";
/** 노아·레오·루미: 머리가 큰 작은 아이. 모루·모링과 같은 손그림 선으로 그리고, 머리 모양과 옷 색만 다르다 */
const LOOKS: Record<string, { hair: string; dress: string }> = {
  noa: { hair: "#3f3a4e", dress: "#8a7190" },
  leo: { hair: "#e9c27c", dress: "#5f7f81" },
  lumi: { hair: "#b8a0cc", dress: "#8f83ad" },
};

export default function MoruCompanion({ appearance = "moru", mood, level = 1 }: { appearance?: string; mood: MoruMood; level?: number }) {
  if (appearance === "moring") return <MoringSprite mood={mood} level={level} />;
  const look = LOOKS[appearance];
  if (!look) return <MoruSprite mood={mood} level={level} />;
  const boy = appearance === "leo";
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-hand="" aria-hidden="true" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="64" cy="113" rx="30" ry="4" fill="#2a1b13" opacity=".16" stroke="none" />
    <g className={styles.body}>
      {/* 뒷머리 (레오는 짧은 머리라 망토가 보인다) */}
      {appearance === "noa" && <path fill={look.hair} d="M34 50C32 28 48 16 64 16C80 16 96 28 94 50C94 70 98 86 96 99L82 99L80 70H48L46 99L32 99C30 86 34 70 34 50Z" />}
      {appearance === "lumi" && <path fill={look.hair} d="M33 52C31 30 47 17 64 17C81 17 97 30 95 52C95 66 97 78 92 87L80 87V70H48V87L36 87C31 78 33 66 33 52Z" />}
      {boy && <path fill="#4a6266" d="M48 76C36 84 31 96 33 105L50 101ZM80 76C92 84 97 96 95 105L78 101Z" />}
      {/* 신발과 옷 */}
      <path fill="#4a3d4a" d="M52 100H61V110H50C49 106 50 103 52 100ZM67 100H76C78 103 79 106 78 110H67Z" />
      {boy ? <path fill={look.dress} d="M50 76H78L84 103H44Z" /> : <path fill={look.dress} d="M50 76H78C82 86 88 96 90 103C74 107 54 107 38 103C40 96 46 86 50 76Z" />}
      {boy && <path fill="#fff3dc" d="M54 76H74L64 87Z" />}
      <path fill={SKIN} d="M45 82C38 84 36 92 39 97C44 96 47 90 48 84ZM83 82C90 84 92 92 89 97C84 96 81 90 80 84Z" />
      {level >= 5 && <circle cx="64" cy="81" r="3" fill="#ffe2a0" strokeWidth="1.6" />}
      {/* 얼굴 */}
      <path fill={SKIN} d="M64 22C82 22 94 34 94 50C94 66 82 76 64 76C46 76 34 66 34 50C34 34 46 22 64 22Z" />
      <g className={styles.face}>
        <ellipse cx="46" cy="61" rx="5" ry="3" fill="#f6b3ae" opacity={happy ? ".9" : ".6"} stroke="none" />
        <ellipse cx="82" cy="61" rx="5" ry="3" fill="#f6b3ae" opacity={happy ? ".9" : ".6"} stroke="none" />
        {mood === "sleep" ? <path strokeWidth="2.8" d="M48 55Q53 59 58 55M70 55Q75 59 80 55" />
          : happy ? <path strokeWidth="2.8" d="M48 57Q53 50 58 57M70 57Q75 50 80 57" />
          : <g className={styles.blink} style={{ transformOrigin: "64px 55px" }}>
            <ellipse cx="53" cy="55" rx="3.4" ry="4.6" fill="#3d2f3d" stroke="none" /><ellipse cx="75" cy="55" rx="3.4" ry="4.6" fill="#3d2f3d" stroke="none" />
            <circle cx="54.2" cy="53.4" r="1.2" fill="#fff" stroke="none" /><circle cx="76.2" cy="53.4" r="1.2" fill="#fff" stroke="none" />
          </g>}
        {mood === "eat" ? <path fill="#a8797c" strokeWidth="1.8" d="M61 64C61 62 67 62 67 64C67 69 61 69 61 64Z" />
          : <path stroke="#a8797c" strokeWidth="2.2" d={happy ? "M60 64Q64 69 68 64" : "M61 65Q64 67 67 65"} />}
      </g>
      {/* 앞머리 */}
      {boy
        ? <path fill={look.hair} d="M33 48C30 30 46 16 64 17C82 16 98 30 95 48C90 44 88 38 84 40C82 34 76 32 72 38C68 30 60 30 56 38C50 32 44 36 42 42C38 42 35 44 33 48ZM59 18C61 10 70 10 70 18" />
        : <path fill={look.hair} d="M34 50C32 30 48 18 64 18C80 18 96 30 94 50C90 42 84 38 80 44C76 38 70 36 66 42C60 36 54 36 50 44C44 38 38 42 34 50Z" />}
      {appearance === "noa" && <g>{/* 리본과 달 */}
        <path fill="#d9b7d0" d="M41 25C32 18 29 29 38 31ZM41 25C47 16 54 22 45 31Z" /><circle cx="41" cy="27" r="3" fill="#bea0b9" strokeWidth="1.6" />
        <path fill="#ffe2a0" strokeWidth="1.6" d="M90 30C84 32 83 40 89 43C86 38 87 34 90 30Z" />
      </g>}
      {appearance === "lumi" && <g>{/* 별을 단 베레모 */}
        <path fill="#5f5a78" d="M36 31C34 14 54 8 68 10C86 10 98 22 92 33C76 26 52 26 36 31Z" /><path d="M64 10V5" />
        <path fill="#ffe2a0" strokeWidth="1.4" d="M82 14L84 19L89 20L85 23L86 28L82 25.500L78 28L79 23L75 20L80 19Z" />
      </g>}
      {mood === "eat" && <g className={styles.rice}>
        <path fill="#fffaf0" d="M52 89C54 80 74 80 76 89Z" /><path fill="#cdbbf0" d="M48 88H80C80 97 73 101 64 101C55 101 48 97 48 88Z" />
      </g>}
    </g>
    {(mood === "pet" || mood === "happy") && <path className={styles.heart} fill="#f29aab" strokeWidth="2" d="M110 42C102 36 100 30 104 27C107 25 110 28 110 30C110 28 113 25 116 27C120 30 118 36 110 42Z" />}
    {mood === "sleep" && <g className={styles.heart}>
      <path stroke={INK} strokeWidth="5" d="M99 31H108L99 41H108M112 18H119L112 26H119" /><path stroke="#fff6e0" strokeWidth="2.2" d="M99 31H108L99 41H108M112 18H119L112 26H119" />
    </g>}
  </svg>;
}
