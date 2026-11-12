"use client";

import { useState, type CSSProperties } from "react";
import { IconPlus } from "./Icons";
import {
  FRAME_COLORS, FRAME_COLOR_LABELS, FRAME_DECOS, FRAME_DECO_LABELS, FRAME_STYLES, FRAME_STYLE_LABELS,
  type FrameDeco, type SponsorFrame,
} from "@/lib/sponsor-frames";
import styles from "./SponsorFrame.module.css";

/** 대체 그림 색조 수. CSS 의 .art[data-tone="0..5"] 과 맞춘다. */
const TONES = 6;
const toneOf = (key: string) => Array.from(key).reduce((sum, char) => (sum * 31 + (char.codePointAt(0) ?? 0)) % 9973, 7) % TONES;
const initialOf = (name: string) => (Array.from(name.trim())[0] ?? "·").toUpperCase();

/** 모서리 장식 그림 (24×24). 스티커처럼 색을 채우고 흰 테를 두른다. */
const DECO_PATHS: Record<Exclude<FrameDeco, "none">, string> = {
  ribbon: "M8 13.4 6.1 21.3 12 18.5l5.9 2.8L16 13.4ZM12 2.7a6.3 6.3 0 1 0 0 12.6 6.3 6.3 0 0 0 0-12.6Z",
  star: "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9Z",
  leaf: "M4.6 19.4C4.6 10.2 10.2 4.6 19.4 4.6c0 9.2-5.6 14.8-14.8 14.8Z",
  flame: "M12 2.4c.7 3.3 5.6 5.7 5.6 11.2a5.6 5.6 0 0 1-11.2 0c0-2.2 1-3.7 2.2-4.9.3 1.6 1 2.5 1.9 2.9C10.2 8.7 10.6 5 12 2.4Z",
  heart: "M12 20.6s-8-5-8-11a4.6 4.6 0 0 1 8-3.1 4.6 4.6 0 0 1 8 3.1c0 6-8 11-8 11Z",
  sparkle: "M12 2.4l2.3 6.9 6.9 2.3-6.9 2.3L12 20.8l-2.3-6.9-6.9-2.3 6.9-2.3Z",
};
const DecoGlyph = ({ deco }: { deco: Exclude<FrameDeco, "none"> }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={DECO_PATHS[deco]} /></svg>;

/**
 * 액자에 건 기업 로고. 크기는 size(px) 또는 바깥 CSS 의 --frame-size 로 정한다.
 * live 면 네온·오로라가 살짝 움직인다 (시상대·시트·미리보기). 목록의 작은 액자는 멈춰 둔다.
 */
export function SponsorFrameView({ frame, name, logo, size, live = false, className }: {
  frame: SponsorFrame; name: string; logo: string | null; size?: number; live?: boolean; className?: string;
}) {
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  const image = logo && logo !== brokenLogo ? logo : null;
  return <span className={className ? `${styles.frame} ${className}` : styles.frame} data-style={frame.style} data-color={frame.color} data-live={live || undefined}
    style={size ? { "--frame-size": `${size}px` } as CSSProperties : undefined} aria-hidden="true">
    <span className={styles.art} data-tone={image ? undefined : toneOf(name)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image} alt="" loading="lazy" decoding="async" onError={() => setBrokenLogo(image)} /> : <span className={styles.initial}>{initialOf(name)}</span>}
    </span>
    {frame.deco !== "none" && <span className={styles.deco}><DecoGlyph deco={frame.deco} /></span>}
  </span>;
}

/** 아직 비어 있는 자리의 점선 액자 */
export function VacantFrame({ size }: { size?: number }) {
  return <span className={styles.vacant} style={size ? { "--frame-size": `${size}px` } as CSSProperties : undefined} aria-hidden="true"><IconPlus /></span>;
}

/** 액자 · 색 · 장식 고르기. 보기 칸마다 지금 고른 색과 기업 로고로 실제 액자를 그려 보여 준다. 바뀐 항목만 onPick 으로 알린다. */
export function SponsorFramePicker({ value, onPick, name, logo, disabled = false }: {
  value: SponsorFrame; onPick: (patch: Partial<SponsorFrame>) => void; name: string; logo: string | null; disabled?: boolean;
}) {
  return <fieldset className={styles.picker} disabled={disabled}>
    <div className={styles.group} role="radiogroup" aria-label="액자">
      <div className={styles.styles}>
        {FRAME_STYLES.map((style) => <button key={style} type="button" role="radio" aria-checked={value.style === style} className={styles.option} onClick={() => onPick({ style })}>
          <SponsorFrameView frame={{ style, color: value.color, deco: "none" }} name={name} logo={logo} />
          {FRAME_STYLE_LABELS[style]}
        </button>)}
      </div>
    </div>
    <div className={styles.group} role="radiogroup" aria-label="색">
      <div className={styles.colors}>
        {FRAME_COLORS.map((color) => <button key={color} type="button" role="radio" aria-checked={value.color === color} aria-label={FRAME_COLOR_LABELS[color]} title={FRAME_COLOR_LABELS[color]}
          className={styles.swatch} data-color={color} onClick={() => onPick({ color })}><i /></button>)}
      </div>
    </div>
    <div className={styles.group} role="radiogroup" aria-label="장식">
      <div className={styles.decos}>
        {FRAME_DECOS.map((deco) => <button key={deco} type="button" role="radio" aria-checked={value.deco === deco} aria-label={FRAME_DECO_LABELS[deco]} title={FRAME_DECO_LABELS[deco]}
          className={styles.sticker} data-color={value.color} data-deco={deco} onClick={() => onPick({ deco })}>
          {deco === "none" ? "없음" : <DecoGlyph deco={deco} />}
        </button>)}
      </div>
    </div>
  </fieldset>;
}
