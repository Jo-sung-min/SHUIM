import { useId } from "react";
import { ORB_KINDS, type OrbMood } from "@/lib/emotion-orbs";

/**
 * 감정구슬 그림 (docs/EMOTION_ORBS.md 1장): 손으로 그린 듯 살짝 찌그러진 유리알 안에 그날의 작은 풍경 하나.
 * 1 가라앉는 물방울 · 2 빗줄기 · 3 엷은 안개 · 4 새싹 · 5 햇살 조각. 빛깔은 lib/emotion-orbs 의 ORB_KINDS 를 따른다.
 * 꾸밈 그림이라 이름은 쓰는 쪽이 글자로 적는다 (aria-hidden).
 */
export default function EmotionOrb({ mood, size = 56, glow = true }: { mood: OrbMood; size?: number; glow?: boolean }) {
  const kind = ORB_KINDS[mood];
  const id = useId();
  const body = `${id}b`, shine = `${id}s`, clip = `${id}c`;
  const ink = { fill: "none", stroke: "#fff", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false"
      style={{ display: "block", flex: "none", overflow: "visible", filter: glow ? `drop-shadow(0 ${size * 0.04}px ${size * 0.14}px ${kind.glow}99)` : undefined }}>
      <defs>
        <radialGradient id={body} cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor={kind.light} />
          <stop offset="0.52" stopColor={kind.body} />
          <stop offset="1" stopColor={kind.deep} />
        </radialGradient>
        <radialGradient id={shine} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clip}><path d="M50 9C74 8 92 27 91 52C90 76 73 94 50 93C26 94 9 76 9 51C9 27 26 9 50 9Z" /></clipPath>
      </defs>
      <path d="M50 9C74 8 92 27 91 52C90 76 73 94 50 93C26 94 9 76 9 51C9 27 26 9 50 9Z" fill={`url(#${body})`} />
      <g clipPath={`url(#${clip})`}>
        {/* 아래쪽에 고인 빛 */}
        <ellipse cx="56" cy="84" rx="30" ry="12" fill={kind.light} opacity="0.34" />
        <g opacity="0.82">
          {mood === 1 && <>
            <path d="M40 40c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12Z" fill="#fff" opacity="0.8" />
            <path d="M60 52c3 5 5 7 5 10a5 5 0 0 1-10 0c0-3 2-5 5-10Z" fill="#fff" opacity="0.62" />
            <path d="M47 66c2.4 4 4 5.6 4 8a4 4 0 0 1-8 0c0-2.4 1.6-4 4-8Z" fill="#fff" opacity="0.46" />
          </>}
          {mood === 2 && <g {...ink} strokeWidth="3.4">
            <path d="M38 36l-5 13" opacity="0.85" /><path d="M54 32l-5 13" opacity="0.7" /><path d="M68 42l-5 13" opacity="0.8" />
            <path d="M44 56l-5 13" opacity="0.6" /><path d="M60 60l-5 13" opacity="0.75" />
          </g>}
          {mood === 3 && <g {...ink} strokeWidth="3.2">
            <path d="M28 44c7-5 13 5 20 0s13 5 20 0" opacity="0.85" />
            <path d="M34 57c6-4 11 4 17 0s11 4 17 0" opacity="0.65" />
            <path d="M30 70c6-4 10 4 16 0s10 4 16 0" opacity="0.45" />
          </g>}
          {mood === 4 && <>
            <path d="M50 76V52" {...ink} strokeWidth="3.4" />
            <path d="M50 56c-2-11-12-15-20-13c0 10 9 16 20 13Z" fill="#fff" opacity="0.9" />
            <path d="M50 50c2-10 11-13 18-11c0 9-8 14-18 11Z" fill="#fff" opacity="0.72" />
          </>}
          {mood === 5 && <>
            <circle cx="50" cy="54" r="9" fill="#fff" opacity="0.9" />
            <g {...ink} strokeWidth="3.2" opacity="0.8">
              <path d="M50 36v-6" /><path d="M50 78v-6" /><path d="M32 54h-6" /><path d="M74 54h-6" />
              <path d="M37 41l-4-4" /><path d="M67 71l-4-4" /><path d="M63 41l4-4" /><path d="M33 71l4-4" />
            </g>
          </>}
        </g>
        {/* 유리의 윤기 */}
        <ellipse cx="34" cy="28" rx="15" ry="9" fill={`url(#${shine})`} transform="rotate(-28 34 28)" />
        <circle cx="70" cy="26" r="3.2" fill="#fff" opacity="0.7" />
      </g>
      <path d="M50 9C74 8 92 27 91 52C90 76 73 94 50 93C26 94 9 76 9 51C9 27 26 9 50 9Z" fill="none" stroke={kind.deep} strokeWidth="2.4" strokeLinejoin="round" opacity="0.75" />
    </svg>
  );
}
