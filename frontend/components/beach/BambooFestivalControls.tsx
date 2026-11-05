"use client";

import type { BambooToy } from "@/lib/beach/net";
import styles from "./beach.module.css";

const toys = [
  { kind: "balloon", label: "빛풍선", detail: "손에 들기" },
  { kind: "fan", label: "태극 부채", detail: "손에 들기" },
  { kind: "propeller", label: "빛 프로펠러", detail: "하늘로 날리기" },
] as const;

export default function BambooFestivalControls({ held, inFlight, disabled, onChoose }: {
  held: BambooToy | null; inFlight: boolean; disabled: boolean;
  onChoose: (choice: BambooToy | "put-away") => void;
}) {
  return <>{toys.map(({ kind, label, detail }) => {
    const putAway = kind !== "propeller" && held === kind;
    return <button key={kind} type="button" className={styles.actionTile + " " + styles.festivalTile}
      data-toy={kind} disabled={disabled || (kind === "propeller" && inFlight)}
      aria-pressed={kind === "propeller" ? undefined : putAway} onClick={() => onChoose(putAway ? "put-away" : kind)}>
      <span className={styles.actionIcon}><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.45" aria-hidden="true">
        {kind === "balloon" && <><ellipse cx="16" cy="12" rx="9" ry="10"/><path d="m16 22-1.5 2h3L16 22Zm0 2c-3 4 3 4 0 7M11 10q0-3 3-4"/><path d="m21 7 .7 1.8 1.8.7-1.8.7L21 12l-.7-1.8-1.8-.7 1.8-.7Z" fill="currentColor"/></>}
        {kind === "fan" && <><ellipse cx="16" cy="12" rx="10.5" ry="9.5"/><path d="M6 12c2-7 9-8 10-2s8 6 10 0M14.5 22v7a1.5 1.5 0 0 0 3 0v-7"/></>}
        {kind === "propeller" && <><circle cx="16" cy="14" r="2"/><path d="M15 12C3 6 11 0 14 4l2 8m2 2c11-7 13 2 8 3l-8-2m-3 1C16 29 7 26 9 21l5-6m5 7 1 4m3-5 2 8"/></>}
      </svg></span>
      <strong>{label}</strong><small>{putAway ? "내려놓기" : kind === "propeller" && inFlight ? "날아가는 중" : detail}</small>
    </button>;
  })}{held === "propeller" && <button type="button" className={styles.actionTile} disabled={disabled} onClick={() => onChoose("put-away")}>
    <span className={styles.actionIcon} aria-hidden="true">↓</span><strong>내려놓기</strong><small>프로펠러 손잡이</small>
  </button>}</>;
}
