"use client";

/**
 * 힘내요 불꽃. 꺼짐: 선으로 그린 불꽃. 켜짐: 주황·빨강으로 타는 불꽃이
 * 아래에서 화르륵 솟으며(flare) 불티가 흩어지고, 그 뒤로는 천천히 일렁인다.
 * 외부 이미지 없이 SVG 패스 + 그라데이션 + CSS 애니메이션만 쓴다.
 */
const OUTER = "M12 22c4 0 7-2.8 7-6.8 0-3.6-2.4-6-4.2-8.2-.4 2.2-1.7 3.5-3 3.5.6-3-.4-6.2-3.3-8.5.2 3.6-1.6 5.6-3.2 7.6C4.2 11.4 5 13.4 5 15.2 5 19.2 8 22 12 22Z";
const INNER = "M12 22c-1.7 0-3-1.2-3-3 0-1.9 1.6-3 2.4-4.5.9 1.2 3.6 2.4 3.6 4.5 0 1.8-1.3 3-3 3Z";

export default function CheerFlame({ on, burst, size = 28 }: { on: boolean; burst?: boolean; size?: number }) {
  const id = "cfl";
  if (!on) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={OUTER} />
        <path d={INNER} />
      </svg>
    );
  }
  return (
    <span className={`cheer3d ${burst ? "burst" : ""}`} style={{ width: size, height: size }} aria-hidden>
      {burst && (
        <span className="cheer3d-sparks">
          {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * 51}deg`, ["--d" as string]: `${i % 2 ? 0 : 60}ms` }} />)}
        </span>
      )}
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={`${id}-outer`} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff9a3c" />
            <stop offset="0.55" stopColor="#f2542d" />
            <stop offset="1" stopColor="#c8261b" />
          </linearGradient>
          <linearGradient id={`${id}-inner`} x1="12" y1="14" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe9a0" />
            <stop offset="1" stopColor="#ffb52e" />
          </linearGradient>
          <radialGradient id={`${id}-gloss`} cx="9.5" cy="12" r="5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={OUTER} fill={`url(#${id}-outer)`} stroke="#a3200f" strokeOpacity="0.45" strokeWidth="0.8" strokeLinejoin="round" />
        <ellipse cx="9.4" cy="12.6" rx="2.2" ry="3.4" transform="rotate(-18 9.4 12.6)" fill={`url(#${id}-gloss)`} />
        <path d={INNER} fill={`url(#${id}-inner)`} />
      </svg>
    </span>
  );
}
