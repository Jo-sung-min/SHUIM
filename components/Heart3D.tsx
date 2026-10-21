"use client";

/**
 * 힘내요 하트. 꺼짐: 선 하나로 그린 하트. 켜짐: 광택 있는 3D 느낌의 빨간 하트가
 * 톡 튀어나오며(pop) 작은 하트들이 흩어지고, 그 뒤로는 천천히 숨 쉬듯 움직인다.
 * 외부 이미지 없이 SVG 그라데이션 + CSS 애니메이션만 쓴다.
 */
export default function Heart3D({ on, burst, size = 28 }: { on: boolean; burst?: boolean; size?: number }) {
  const id = "h3d";
  if (!on) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
    );
  }
  return (
    <span className={`heart3d ${burst ? "burst" : ""}`} style={{ width: size, height: size }} aria-hidden>
      {burst && (
        <span className="heart3d-sparks">
          {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * 51}deg`, ["--d" as string]: `${i % 2 ? 0 : 60}ms` }} />)}
        </span>
      )}
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={`${id}-base`} x1="4" y1="4" x2="20" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff7a8a" />
            <stop offset="0.45" stopColor="#ff2d55" />
            <stop offset="1" stopColor="#b8102e" />
          </linearGradient>
          <radialGradient id={`${id}-gloss`} cx="8.5" cy="7.5" r="6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-shade`} cx="12" cy="18" r="9" gradientUnits="userSpaceOnUse">
            <stop offset="0.5" stopColor="#7a0a1f" stopOpacity="0" />
            <stop offset="1" stopColor="#7a0a1f" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11Z" fill={`url(#${id}-base)`} />
        <path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11Z" fill={`url(#${id}-shade)`} />
        <ellipse cx="8.6" cy="8.2" rx="3.1" ry="2.1" transform="rotate(-25 8.6 8.2)" fill={`url(#${id}-gloss)`} />
      </svg>
    </span>
  );
}
