import MoruSprite, { type MoruMood } from "./MoruSprite";
import styles from "./MoruPet.module.css";

export const COMPANIONS = [
  { id: "moru", name: "모루", detail: "보랏빛 새싹" },
  { id: "noa", name: "노아", detail: "흑발 · 달빛 리본" },
  { id: "leo", name: "레오", detail: "금발 · 작은 망토" },
  { id: "lumi", name: "루미", detail: "라벤더 · 별빛 베레모" },
];

export default function MoruCompanion({ appearance = "moru", mood, level = 1 }: { appearance?: string; mood: MoruMood; level?: number }) {
  if (!COMPANIONS.some((c) => c.id === appearance) || appearance === "moru") return <MoruSprite mood={mood} level={level} />;
  const boy = appearance === "leo";
  const lavender = appearance === "lumi";
  const happy = mood === "happy" || mood === "pet" || mood === "eat";
  const hair = boy ? ["#79523c", "#b78a51", "#e4bc76", "#ffe2a5"] : lavender ? ["#655275", "#9079a6", "#b8a0cc", "#dcc8e7"] : ["#242335", "#393749", "#555066", "#756980"];
  const dress = boy ? ["#34484e", "#577779", "#8baba2"] : lavender ? ["#555074", "#82769e", "#b5a4ca"] : ["#44394f", "#746078", "#b294a8"];
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#191723" opacity=".25" d="M36 110h56v3H36zM42 113h44v2H42z" />
    <g className={styles.body}>
      {/* Hair silhouettes are distinct; no tiny strand noise. */}
      <path fill={hair[0]} d={boy ? "M32 29h5v-8h10v-5h34v4h10v6h7v11h3v29h-5v10H32V65h-5V40h5z" : lavender ? "M35 25h9v-7h38v5h10v10h6v37h5v13h-8v12H82V76H46v19H32V83h-7V70h5V35h5z" : "M34 28h6v-8h38v3h12v8h7v23h5v42h-7v10H81V77H46v28H30v-9h-5V55h5V35h4z"} />
      {!boy && <><path fill={hair[1]} d="M31 60h11v36h-5v6h-7V82h-3V69h4zM87 58h9v13h4v16h-5v14h-9V78h-4V66h5z" /><path fill={hair[2]} d="M33 72h3v23h-3zM90 70h3v25h-3z" /></>}
      {/* Boots and a compact body anchor the oversized head. */}
      <path fill="#39313e" d="M46 100h15v12H43v-7h3zM68 100h14v5h4v7H68z" />
      <path fill="#b6a0ac" d="M47 108h11v2H47zM71 108h11v2H71z" />
      <path fill={dress[0]} d={boy ? "M46 72h36l7 23h-9v10H67V93h-6v12H47V95h-8z" : "M48 72h32v6h5v10h5v10h-7v5H45v-5h-7V88h5V78h5z"} />
      <path fill={dress[1]} d={boy ? "M49 76h29v8h5v9H73V87H55v6H45v-9h4z" : "M49 77h29v8h5v10H45V85h4z"} />
      <path fill={dress[2]} d="M49 77h6v13h-6zM74 77h4v13h-4z" />
      {!boy && <><path fill="#ede0dd" d="M43 95h7v4h6v-3h6v3h7v-3h7v3h7v-4h4v6H43z" /><path fill={dress[0]} d="M58 82h4v12h-4zM68 82h4v12h-4z" /></>}
      {boy && <><path fill="#e4d4b4" d="M48 75h30v6H48zM59 81h8v15h-8z" /><path fill="#bb8a52" d="M61 82h4v11h-4z" /><path fill={dress[2]} d="M40 78h7v14h-9v-7h2zM80 78h7v7h3v7H80z" /></>}
      <path fill="#b98780" d="M36 83h7v12h-7zM85 83h7v12h-7z" />
      <path fill="#f1c9b6" d="M37 84h5v8h-5zM86 84h5v8h-5z" />
      {/* Face and stepped jaw. */}
      <path fill="#bc8c83" d="M36 38h55v7h5v18h-5v7h-8v5H48v-4h-9v-7h-5V46h2z" />
      <path fill="#efc8b5" d="M39 38h48v7h5v17h-5v7h-8v4H50v-4h-8v-6h-5V47h2z" />
      <path fill="#ffe3ca" d="M41 39h44v7h5v14h-5v7H46v-5h-7V46h2z" />
      <path fill="#f5d5bf" d="M44 63h6v5h30v-3h7v4h-8v3H51v-3h-7z" />
      <g className={styles.face}>
        {mood === "sleep" ? <path fill="#5e495c" d="M44 56h4v3h9v-2h3v5H47v-2h-3zM71 57h3v2h9v-3h4v4h-3v2H71z" /> : happy ? <>
          <path fill="#504052" d="M43 56h3v-4h10v3h4v7h-3v-6h-9v6h-5zM70 56h3v-4h10v3h4v7h-3v-6h-9v6h-5z" />
          <path fill="#fff9d8" d="M39 51h2v-2h2v2h2v2h-2v2h-2v-2h-2zM88 51h2v-2h2v2h2v2h-2v2h-2v-2h-2z" />
        </> : <g className={styles.blink} style={{transformOrigin:"64px 57px"}}>
          <path fill="#4c394b" d="M44 51h15v3H44zM72 51h15v3H72zM47 54h10v10H47zM74 54h10v10H74z" />
          <path fill={lavender ? "#9786b1" : boy ? "#719b91" : "#9e7b93"} d="M49 60h6v3h-6zM76 60h6v3h-6z" />
          <path fill="#d9ad9e" d="M44 49h15v2H44zM72 49h15v2H72z" />
        </g>}
        <path fill="#eab3ac" d="M40 63h9v3h-9zM82 63h9v3h-9z" />
        <path fill="#a8797c" d={mood === "eat" ? "M61 65h7v6h-7z" : happy ? "M61 65h2v2h3v-2h2v4h-7z" : "M62 67h5v2h-5z"} />
      </g>
      {/* Chunky bangs, cap and ribbon details echo small RPG portraits. */}
      <path fill={hair[1]} d={boy ? "M35 29h6v-6h12v-4h25v4h11v7h6v16h-5v-8h-7v10h-6V37h-8v9h-6V35h-8v11h-6V37h-8v17h-7z" : "M36 31h6v-6h12v-4h24v4h11v7h6v19h-6V40h-6v7h-7V37h-8v10h-7V37h-8v8h-7v-6h-6v19h-5z"} />
      <path fill={hair[2]} d="M43 27h11v-3h22v3h11v6h-8v-3H53v3H42v9h-4v-8h5z" />
      <path fill={hair[3]} d="M49 26h7v2h-7zM58 24h15v2H58zM78 28h7v2h-7z" />
      {lavender ? <g><path fill="#56516c" d="M31 23h5v-7h10v-5h38v3h11v6h5v10H39v-3h-8z" /><path fill="#8b7b9d" d="M39 17h10v-4h33v3h10v5h5v5H36v-5h3z" /><path fill="#b9a5c4" d="M49 14h31v3H49z" /><path fill="#f4d99e" d="M83 18h3v3h4v3h-4v4h-3v-4h-4v-3h4z" /></g> : boy ? <g><path fill="#5b6a62" d="M84 29h8v3h5v5H84z" /><path fill="#c8bea0" d="M86 30h5v2h-5z" /></g> : <g><path fill="#66516e" d="M28 33h11v5h5v7H33v-3h-5zM44 38h7v-5h10v10H50v4h-6z" /><path fill="#bea0b9" d="M30 35h7v5h-7zM52 35h7v5h-7z" /><path fill="#ead5d3" d="M40 38h6v6h-6z" /><path fill="#ddc69a" d="M88 39h3v9h-3zM85 43h3v5h-3z" /></g>}
      {mood === "eat" && <g className={styles.rice}><path fill="#d8a8ba" d="M51 88h28v9h-4v4H55v-4h-4z" /><path fill="#fff1d7" d="M54 83h21v8H54zM59 80h11v3H59z" /><path fill="#efc8b5" d="M46 89h8v6h-8zM77 89h8v6h-8z" /></g>}
      {level >= 5 && <path fill="#ead5a4" d="M61 77h6v5h-6z" />}
    </g>
    {happy && <path className={styles.heart} fill="#e8acc9" d="M104 30h5v3h3v-3h5v7h-3v3h-3v3h-3v-3h-4z" />}
    {mood === "sleep" && <path className={styles.heart} fill="#c6b3df" d="M103 28h10v3h-3v3h-3v3h6v3h-10v-3h3v-3h3v-3h-6z" />}
  </svg>;
}
