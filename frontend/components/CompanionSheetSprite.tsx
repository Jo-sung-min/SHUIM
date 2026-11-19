import { useId } from "react";
import type { MoruMood } from "./MoruSprite";
import type { MoodStage } from "@/lib/moru-rules";
import styles from "./MoruPet.module.css";

// Each row is a complete six-frame loop in both atlases. The paws rest at y=86 in every cell.
const CELL = 96;
const COLUMNS = 6;
const ROWS = 15;
const CARE_ROW = { happy: 5, pet: 6, eat: 7, sleep: 8 };
const TALK_ROW = new Map([["tired", 9], ["happy", 10], ["sad", 11], ["anxious", 12], ["bored", 13], ["just", 14]]);
const LOOP_SECONDS = [4.6, 4.2, 3.6, 3, 2.6, 1.5, 1.9, 1.6, 4.8, 3.7, 1.8, 3.8, 4.1, 2.5, 3];

export default function CompanionSheetSprite({ appearance, mood, stage = 3, talk }: {
  appearance: "bamu" | "mongul"; mood: MoruMood; stage?: MoodStage; talk?: string | null;
}) {
  const clip = useId();
  const talkRow = mood === "pet" && talk ? TALK_ROW.get(talk) : undefined;
  const row = mood === "idle" ? stage - 1 : talkRow ?? CARE_ROW[mood];
  return <svg viewBox="0 0 128 122" className={styles.sprite} data-mood={mood} data-stage={stage} data-companion={appearance} aria-hidden="true">
    <defs><clipPath id={clip}><rect width={CELL} height={CELL} /></clipPath></defs>
    <ellipse cx="64" cy="113" rx="31" ry="4" fill="#2a1b13" opacity=".16" />
    <g transform="translate(1 0) scale(1.3125)">
      <g clipPath={`url(#${clip})`}>
        <image key={row} href={`/companions/${appearance}.png`} x="0" y={-row * CELL}
          width={COLUMNS * CELL} height={ROWS * CELL} className={styles.companionSheetLoop}
          style={{ animationDuration: `${LOOP_SECONDS[row]}s` }} />
      </g>
    </g>
  </svg>;
}
