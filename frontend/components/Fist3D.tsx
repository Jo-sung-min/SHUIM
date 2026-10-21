"use client";

/**
 * 힘내요 주먹. 꺼짐: 선 하나로 그린 불끈 쥔 주먹. 켜짐: 광택 있는 3D 느낌의 금빛 주먹이
 * 톡 튀어나오며(pop) 불꽃이 흩어지고, 그 뒤로는 천천히 숨 쉬듯 움직인다.
 * 외부 이미지 없이 SVG 패스 + 그라데이션 + CSS 애니메이션만 쓴다.
 */
const FINGERS = "M6 11V8.5a1.5 1.5 0 0 1 3 0V11M9 11V7.5a1.5 1.5 0 0 1 3 0V11M12 11V7.5a1.5 1.5 0 0 1 3 0V11M15 11V8.5a1.5 1.5 0 0 1 3 0V11";
const BODY = "M6 11h12v4.5A5.5 5.5 0 0 1 12.5 21h-1A5.5 5.5 0 0 1 6 15.5Z";
const THUMB = "M8 13.3h3.5a1.6 1.6 0 0 1 0 3.2H8a1.6 1.6 0 0 1 0-3.2Z";

export default function Fist3D({ on, burst, size = 28 }: { on: boolean; burst?: boolean; size?: number }) {
  const id = "f3d";
  if (!on) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={FINGERS} />
        <path d={BODY} />
        <path d={THUMB} />
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
          <linearGradient id={`${id}-base`} x1="6" y1="6" x2="18" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe08a" />
            <stop offset="0.5" stopColor="#f9a826" />
            <stop offset="1" stopColor="#c65d12" />
          </linearGradient>
          <radialGradient id={`${id}-gloss`} cx="9.5" cy="9.5" r="6" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-shade`} cx="12" cy="19" r="9" gradientUnits="userSpaceOnUse">
            <stop offset="0.5" stopColor="#7a3a06" stopOpacity="0" />
            <stop offset="1" stopColor="#7a3a06" stopOpacity="0.5" />
          </radialGradient>
        </defs>
        {/* 손가락 4개 + 몸통을 한 덩어리로 채우고, 그 위에 선으로 마디를 살린다 */}
        <path d={`${BODY} ${FINGERS.replace(/V11/g, "V11.5")}`} fill={`url(#${id}-base)`} stroke={`url(#${id}-base)`} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={BODY} fill={`url(#${id}-shade)`} />
        <path d={FINGERS} fill="none" stroke="#a84a0a" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <path d={THUMB} fill="#ffcf6a" stroke="#a84a0a" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx="9.8" cy="9.6" rx="3.4" ry="2" transform="rotate(-20 9.8 9.6)" fill={`url(#${id}-gloss)`} />
      </svg>
    </span>
  );
}
