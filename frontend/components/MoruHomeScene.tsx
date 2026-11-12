import { useId } from "react";
import MoruRoom from "./MoruRoom";
import MoruTrainScene from "./MoruTrainScene";
import styles from "./MoruRoom.module.css";

export default function MoruHomeScene({ homeId = 0, scene = 0 }: { homeId?: number; scene?: number }) {
  const clip = useId();
  if (homeId === 0) return <MoruTrainScene scene={scene} />;
  if (homeId >= 2) return <MoruRoom scene={scene} />;
  const cave = homeId === 0;
  return <svg className={styles.scenery} viewBox="0 0 240 260" preserveAspectRatio="none" aria-hidden="true">
    <defs><clipPath id={clip}><path d={cave ? "M67 191V101L78 74L98 57L127 52L155 64L176 94L181 191Z" : "M59 61H201V166H59Z"} /></clipPath></defs>
    <path fill={cave ? "#25292f" : "#3b302f"} d="M0 0h240v260H0z" />
    {cave ? <g fill="#363940"><path d="M0 0h95L71 42L51 93L32 177L0 199Z" /><path d="M144 0h96v201l-27-39-17-71-24-49Z" /><path fill="#45454b" d="M6 31L57 8L39 61L11 107Z" /><path fill="#1d232a" d="M191 21l36 17 13 66-25-14Z" /><path fill="#4c494b" d="M0 179l39-35 14 46-28 28H0Z" /></g> : <g shapeRendering="crispEdges">{Array.from({length:12},(_,i)=><path key={i} fill={i%2 ? "#493938":"#58433d"} d={`M${i*21} 0h19v218h-19z`} />)}<path fill="#786052" d="M0 35h240v6H0zM0 185h240v6H0z" /></g>}
    <g clipPath={`url(#${clip})`}>
      <path fill="#495c69" d="M48 47h160v148H48z" />
      <image href="https://images.unsplash.com/photo-1673411036192-59e1c08500f6?auto=format&fit=crop&w=800&q=80" x="48" y="47" width="160" height="148" preserveAspectRatio="xMidYMid slice" style={{filter:"brightness(.55) saturate(.45)"}} />
      <g className={scene === 1 ? styles.snow : styles.rain}>{Array.from({length:42},(_,i)=><rect key={i} x={50+i*37%150} y={40+i*29%165} width={scene === 1 ? 1.3 : .4} height={scene === 1 ? 1.5 : 7} fill="#d6e2e5" opacity=".4" />)}</g>
    </g>
    {cave ? <path fill="none" stroke="#4c4c50" strokeWidth="7" d="M64 191V102L76 73L97 54L128 49L158 62L179 94L184 191" /> : <path fill="none" stroke="#987c65" strokeWidth="5" d="M57 59H203V168H57ZM130 59V168" />}
    <path fill={cave ? "#423e40" : "#5e4841"} d="M0 208l64-13 117 1 59 12v52H0Z" />
    <path fill="#241e28" opacity=".5" d="M45 237h154v9H45z" />
    <path fill={cave ? "#776a70" : "#8e6b58"} d="M50 211l12-8h119l13 8v24H50z" />
    <path fill="#b5a3ae" d="M56 206l9-7h111l12 9v22H56z" />
    <path fill="#d9c5cb" d="M61 199h112l9 7v9H58v-10z" />
    <path fill="#ede0dc" d="M78 186h81v3h5v17H73v-17h5z" />
    <path fill="#9c839b" d="M55 218h133v13H55z" /><path fill="#c9b1c3" d="M55 216h133v6H55z" />
    <path fill="#75553e" d="M22 215h13v19H22z" /><path fill="#e5b97a" d="M25 205h7v14h-7z" /><path fill="#ffe3a1" d="M27 199h3v9h-3z" />
    <ellipse fill="#ebad68" opacity=".06" cx="29" cy="217" rx="33" ry="35" />
  </svg>;
}
