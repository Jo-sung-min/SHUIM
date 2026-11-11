import { useId } from "react";
import styles from "./MoruRoom.module.css";

export const ROOM_SCENES = ["비 오는 도시", "눈 내리는 숲", "비 오는 밤"];
export default function MoruRoom({ scene }: { scene: number }) {
  const clipId = useId();
  const snow = scene === 1;
  const night = scene === 2;
  const glowId = `${clipId}-glow`;
  const photo = [
    "https://images.unsplash.com/photo-1650355282040-e0fe8cb289d2?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1673411036192-59e1c08500f6?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1716561687644-df913cde0fd0?auto=format&fit=crop&w=1200&q=85",
  ][scene] ?? "https://images.unsplash.com/photo-1650355282040-e0fe8cb289d2?auto=format&fit=crop&w=1200&q=85";
  return <>
    <svg className={styles.scenery} viewBox="0 0 240 260" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
      <defs>
        <clipPath id={clipId}><path d="M47 45h165v131H47z" /></clipPath>
        <filter id={glowId} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope="2" intercept="-.95" />
            <feFuncG type="linear" slope="2" intercept="-.95" />
            <feFuncB type="linear" slope="2" intercept="-.95" />
          </feComponentTransfer>
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <path fill="#302c39" d="M0 0h240v260H0z" />
      <path fill="#39323d" d="M0 0h30v208H0z" /><path fill="#49404a" d="M30 0h4v208h-4z" />
      <path fill="#493b40" d="M0 208h240v52H0z" />
      <path fill="#5c4949" d="M0 209h240v3H0zM0 231h240v2H0zM0 252h240v2H0zM40 212h2v19h-2zM159 212h2v19h-2zM92 233h2v19h-2zM210 233h2v19h-2z" />
      <path fill="#1e202b" d="M41 39h177v145H41z" />
      <g clipPath={`url(#${clipId})`}>
        <path fill={snow ? "#667789" : night ? "#252d48" : "#526679"} d="M47 45h165v131H47z" />
        <image key={photo} href={photo} x="47" y="45" width="165" height="131" preserveAspectRatio="xMidYMid slice" className={styles.photo} />
        <path fill={snow ? "#25364b" : "#151a30"} opacity={snow ? .22 : .13} d="M47 45h165v131H47z" />
        {!snow && <image href={photo} x="47" y="45" width="165" height="131" preserveAspectRatio="xMidYMid slice" filter={`url(#${glowId})`} className={styles.cityGlow} />}
        <g className={snow ? styles.snow : styles.rain}>
          {Array.from({ length: snow ? 42 : 58 }, (_, i) => <rect key={i} x={47 + i * 37 % 165} y={20 + i * 29 % 170} width={snow ? (i % 3 === 0 ? 1.4 : .8) : .35} height={snow ? 1.4 : 5} fill={snow ? "#e2e7e9" : "#a5bfce"} opacity={.12 + i % 4 * .08} />)}
        </g>
        <path fill="#b9c8d0" opacity=".08" d="M48 45h18v131H48zM144 45h7v131h-7z" />
      </g>
      <path fill="#74636a" d="M43 41h173v4H43zM43 176h173v5H43zM43 45h4v131h-4zM212 45h4v131h-4zM127 45h4v131h-4z" />
      <path fill="#b69b91" d="M39 181h181v4H39z" /><path fill="#44383e" d="M42 185h176v4H42z" />
      <path fill="#61515a" d="M32 35h9v145h-9zM219 35h10v145h-10z" /><path fill="#7e6770" d="M34 35h3v139h-3zM221 35h3v139h-3z" />
      <path fill="#201f29" d="M9 65h17v28H9zM7 109h20v23H7z" /><path fill="#a18a7b" d="M11 67h13v24H11zM9 111h16v19H9z" /><path fill="#58616b" d="M13 70h9v18h-9zM11 113h12v15H11z" />
      <path fill="#705a54" d="M5 170h27v4H5z" /><path fill="#b9a38d" d="M9 154h5v16H9z" /><path fill="#95869a" d="M15 151h5v19h-5z" /><path fill="#c3b29a" d="M21 157h4v13h-4z" />
      <path fill="#654d44" d="M12 216h30v6H12zM15 222h3v23h-3zM35 222h3v23h-3z" />
      <path fill="#a47c54" d="M24 201h4v15h-4zM19 214h14v2H19z" />
      <path fill="#efd3a1" d="M19 186h14v3h3v7h3v5H13v-5h3v-7h3z" /><path fill="#ffe7b5" d="M20 189h11v10H17v-3h3z" />
      <path fill="#eab779" opacity=".08" d="M13 202h26l18 43H0z" />
      <path fill="#4e4541" d="M218 207h14v14h-14z" /><path fill="#778578" d="M224 188h3v19h-3zM219 189h5v8h-5zM227 183h5v9h-5z" />
    </svg>
    <svg className={styles.bed} viewBox="0 0 160 95" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#211d2b" opacity=".3" d="M10 83h140v8H10z" />
      <path fill="#94747b" d="M13 24V9h4V5h126v4h4v45H13z" /><path fill="#b59599" d="M18 10h124v35H18z" />
      <path fill="#c3a7a7" d="M22 12h116v3H22zM23 17h3v24h-3zM53 17h3v24h-3zM83 17h3v24h-3zM113 17h3v24h-3z" />
      <path fill="#6f555e" d="M10 46h140v36H10zM17 82h8v8h-8zM135 82h8v8h-8z" />
      <path fill="#c5b4bb" d="M14 36h132v4h6v26H8V40h6z" /><path fill="#f0e3dd" d="M17 34h126v4h5v20H12V38h5z" />
      <path fill="#ccbac7" d="M24 20h47v3h5v20h-5v4H24v-4h-5V24h5zM90 20h46v4h5v19h-5v4H90v-4h-5V24h5z" />
      <path fill="#f8efea" d="M25 23h44v3h3v14h-4v3H26v-3h-3V27h2zM91 23h43v4h3v13h-4v3H92v-3h-4V27h3z" />
      <path fill="#e3d4d9" d="M29 38h35v3H29zM96 38h33v3H96z" />
      <path fill="#aa929f" d="M8 59h144v15h-4v8H12v-8H8z" />
    </svg>
    <svg className={styles.quilt} viewBox="0 0 160 40" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#ad939f" d="M8 3h18v4h108V3h18v25h-4v8H12v-8H8z" />
      <path fill="#dec9cf" d="M10 2h17v5h106V2h17v22h-4v8H14v-8h-4z" />
      <path fill="#f5e6df" d="M11 2h16v5h106V2h16v8h-15v4H26v-4H11z" />
      <path fill="#c8aebc" d="M26 16h4v14h-4zM52 16h3v14h-3zM79 16h4v14h-4zM107 16h3v14h-3zM133 15h4v12h-4z" />
      <path fill="#ead8d8" d="M33 17h16v3H33zM58 17h17v3H58zM85 17h18v3H85zM113 17h16v3h-16z" />
    </svg>
  </>;
}
