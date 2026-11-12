import { Sheet } from "./ui";
import styles from "./MoruPet.module.css";

/** 날씨 도감 열 칸: 흔한 하늘 여섯(날씨 × 풍경)과 드문 하늘 넷. 서버의 PetDays.WEATHERS 와 같은 순서·이름 */
export const WEATHER_BOOK: { id: string; name: string; rare?: boolean }[] = [
  { id: "rain-city", name: "비 오는 도시" }, { id: "rain-forest", name: "비 오는 숲" },
  { id: "clear-city", name: "맑은 도시" }, { id: "clear-forest", name: "맑은 숲" },
  { id: "snow-city", name: "눈 오는 도시" }, { id: "snow-forest", name: "눈 오는 숲" },
  { id: "rainbow", name: "무지개", rare: true }, { id: "shootingStar", name: "별똥별", rare: true },
  { id: "aurora", name: "오로라", rare: true }, { id: "firstSnow", name: "첫눈", rare: true },
];
export const weatherName = (id: string) => WEATHER_BOOK.find((w) => w.id === id)?.name ?? id;

const INK = "#4a3528";
/** 도감 한 칸의 작은 그림 (64×44): 하늘색 · 풍경 실루엣 · 날씨 표시. 아직 못 본 칸은 물음표 */
function WeatherCard({ id, seen }: { id: string; seen: boolean }) {
  if (!seen) return <svg viewBox="0 0 64 44" aria-hidden="true"><rect x="1" y="1" width="62" height="42" rx="9" fill="#f3e6cc" stroke="#b89a72" strokeWidth="1.6" strokeDasharray="4 3" /><text x="32" y="29" textAnchor="middle" fontSize="18" fill="#b89a72">?</text></svg>;
  const [weather, land] = id.includes("-") ? id.split("-") : [id === "firstSnow" ? "snow" : id === "aurora" ? "snow" : "clear", id === "aurora" ? "forest" : "city"];
  const night = id === "shootingStar" || id === "aurora";
  const sky = night ? "#26305a" : weather === "rain" ? "#b5c3cd" : weather === "snow" ? "#dfe7ee" : "#a9d2ec";
  const ground = night ? "#151a35" : weather === "snow" ? "#f7fafc" : land === "forest" ? "#8ca58f" : "#7e8f96";
  return <svg viewBox="0 0 64 44" aria-hidden="true" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
    <rect x="1" y="1" width="62" height="42" rx="9" fill={sky} />
    {id === "rainbow" && <g fill="none" strokeWidth="2.6" opacity=".9">{["#f3a3a3", "#f6c98a", "#f3e58f", "#a6d9a2", "#9cc4ee"].map((c, i) => <path key={c} stroke={c} d={`M${10 + i * 2.6} 34A${22 - i * 2.6} ${20 - i * 2.6} 0 0 1 ${54 - i * 2.6} 34`} />)}</g>}
    {id === "aurora" && <g fill="none" strokeWidth="4" opacity=".75">{["#7de0b8", "#6fc9d6", "#b79be8"].map((c, i) => <path key={c} stroke={c} d={`M4 ${12 + i * 5}C18 ${6 + i * 5} 30 ${18 + i * 5} 44 ${10 + i * 5}S58 ${8 + i * 5} 62 ${12 + i * 5}`} />)}</g>}
    {id === "shootingStar" && <g><path d="M46 8L30 18" stroke="#fff3cf" strokeWidth="1.6" /><circle cx="46" cy="8" r="2" fill="#fffbe8" strokeWidth="1" /><circle cx="14" cy="10" r=".9" fill="#fff3cf" stroke="none" /><circle cx="22" cy="6" r=".8" fill="#fff3cf" stroke="none" /></g>}
    {weather === "clear" && !night && id !== "rainbow" && <circle cx="50" cy="12" r="5" fill="#ffe9a8" stroke="#d9a55e" />}
    {land === "forest"
      ? <g fill={night ? "#1c2342" : weather === "snow" ? "#5a6f7c" : "#4f6d5b"}>{[14, 30, 46].map((x, i) => <path key={x} d={`M${x} ${16 + (i % 2) * 4}L${x + 8} 34H${x - 8}Z`} />)}</g>
      : <g fill={night ? "#1c2342" : "#93a5b5"}><rect x="8" y="18" width="12" height="16" rx="1.5" /><rect x="22" y="12" width="12" height="22" rx="1.5" /><rect x="36" y="20" width="10" height="14" rx="1.5" /><rect x="48" y="15" width="9" height="19" rx="1.5" /></g>}
    <path d="M1 33H63V34C63 39 59 43 54 43H10C5 43 1 39 1 34Z" fill={ground} />
    {weather === "rain" && <g stroke="#eef4f8" strokeWidth="1.2" opacity=".9">{[10, 22, 34, 46, 56].map((x) => <path key={x} d={`M${x} 6l-2 6M${x + 5} 16l-2 6`} />)}</g>}
    {weather === "snow" && <g fill="#fff" stroke="none">{[8, 18, 27, 38, 47, 56].map((x, i) => <circle key={x} cx={x} cy={8 + (i % 3) * 7} r={id === "firstSnow" ? 2.2 : 1.4} />)}</g>}
    <rect x="1" y="1" width="62" height="42" rx="9" fill="none" />
  </svg>;
}

/** ☰ 메뉴의 날씨 도감: 처음 본 하늘이 칸을 채운다 (처음 본 칸마다 +5 P). 드문 하늘은 우연히 만난다 */
export default function MoruWeatherBook({ open, onClose, seen }: { open: boolean; onClose: () => void; seen: string[] }) {
  const count = WEATHER_BOOK.filter((w) => seen.includes(w.id)).length;
  return <Sheet open={open} title="날씨 도감" onClose={onClose} className={styles.handSheet}>
    <div className={styles.book}>
      <p className={styles.bookIntro}>{count}/{WEATHER_BOOK.length} · 처음 본 하늘마다 +5 P</p>
      <ul className={styles.bookGrid}>
        {WEATHER_BOOK.map((w) => {
          const has = seen.includes(w.id);
          return <li key={w.id} data-seen={has ? "" : undefined}>
            <WeatherCard id={w.id} seen={has} />
            <b>{has ? w.name : "아직 못 봤어요"}</b>
            {w.rare && <small>드문 하늘</small>}
          </li>;
        })}
      </ul>
      <p className={styles.footnote}>날씨는 날마다 바뀌어요. 드문 하늘은 우연히 만나요.</p>
    </div>
  </Sheet>;
}
