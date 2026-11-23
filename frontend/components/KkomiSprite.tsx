import { useId, type CSSProperties } from "react";
import type { MoruMood } from "./MoruSprite";
import styles from "./KkomiSprite.module.css";

// Four consecutive drawings in each row of the 192 px grid.
const clips = {
  guarded: { row: 0, ms: 3600 }, warming: { row: 1, ms: 3600 }, trusted: { row: 2, ms: 3200 },
  hiss: { row: 3, ms: 880 }, shy: { row: 4, ms: 1600 }, reach: { row: 5, ms: 1600 },
  walk: { row: 6, ms: 540 }, eat: { row: 7, ms: 1280 }, sleep: { row: 8, ms: 4000 },
  nuzzle: { row: 9, ms: 2000 },
} as const;
export type KkomiMotion = keyof typeof clips;

export function touchMotion(affinity: number): KkomiMotion {
  if (affinity < 3) return "hiss";
  if (affinity < 8) return "shy";
  return affinity < 16 ? "reach" : "nuzzle";
}
export function idleMotion(affinity: number): KkomiMotion {
  return affinity < 3 ? "guarded" : affinity < 8 ? "warming" : "trusted";
}
function defaultMotion(mood: MoruMood, affinity: number): KkomiMotion {
  if (mood === "eat" || mood === "sleep") return mood;
  if (mood === "pet") return affinity < 8 ? "warming" : "trusted";
  if (mood === "happy") return affinity < 8 ? "shy" : "reach";
  return idleMotion(affinity);
}
export default function KkomiSprite({ mood, affinity = 0, motion }: {
  mood: MoruMood; affinity?: number; motion?: KkomiMotion;
}) {
  const clipId = useId();
  const name = motion ?? defaultMotion(mood, affinity);
  const { row, ms } = clips[name];
  const once = name === "hiss" || name === "reach" || name === "shy";
  return <svg className={styles.sprite} viewBox="0 0 192 192" data-companion="kkomi" data-motion={name} aria-hidden="true">
    <defs><clipPath id={clipId}><rect width="192" height="192" /></clipPath></defs>
    <ellipse cx="96" cy="178" rx="36" ry="5" fill="#392525" opacity=".13" />
    <g clipPath={`url(#${clipId})`}>
      <image key={name} href="/companions/kkomi.png" x="0" y={-row * 192} width="768" height="1920"
        className={once ? styles.gesture : styles.loop} style={{ "--duration": ms + "ms" } as CSSProperties} />
    </g>
  </svg>;
}
