import { IconSmile } from "@/components/Icons";
import type { BunkerState } from "@/lib/beach/engine";
import styles from "./beach.module.css";

export type BunkerAction = "enter" | "exit" | "sit" | "stand";

function LadderIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="M7 3v18M17 3v18M7 6h10M7 11h10M7 16h10" />
  </svg>;
}

function BoardIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" /><circle cx="9.2" cy="9.2" r="2" fill="currentColor" /><circle cx="14.8" cy="14.8" r="2" />
  </svg>;
}

/** Uses the shared nearby-actions column, leaving the fixed left thumb pad clear. */
export default function UyuniBunkerControls({ state, enabled, busy, disabled, gameLabel, onGame, onAction, onRead }: {
  state: BunkerState; enabled: boolean; busy: BunkerAction | null; disabled: boolean; gameLabel: string | null; onGame: () => void;
  onAction: (action: BunkerAction) => void;
  onRead: () => void;
}) {
  const ladder = !state.inside ? state.nearId !== null : state.ladderNear && !state.seated;
  const sofa = state.inside && (state.sofaNear || state.seated);
  return <>
    {ladder && <button type="button" className={styles.contextButton} disabled={disabled || !enabled || busy !== null}
      aria-keyshortcuts="E" onClick={() => onAction(state.inside ? "exit" : "enter")}>
      <span className={styles.contextIcon}><LadderIcon /></span>
      <span className={styles.contextCopy}>
        <strong>{!enabled && !state.inside ? "로그인 후 이용" : busy === "enter" ? "천천히 내려가는 중…" : busy === "exit" ? "천천히 올라가는 중…" : state.inside ? "사다리 올라가기" : "사다리 내려가기"}</strong>
        <small>{!enabled ? "쉬어갈 공간을 준비하고 있어요" : state.inside ? "호텔 데크로 돌아가요" : `${state.name || "호텔"} · 아래층의 아늑한 쉼터`}</small>
      </span>
    </button>}
    {gameLabel && <button type="button" className={styles.contextButton} disabled={disabled} aria-keyshortcuts={ladder || sofa ? undefined : "E"} onClick={onGame}>
      <span className={styles.contextIcon}><BoardIcon /></span>
      <span className={styles.contextCopy}><strong>{gameLabel}</strong></span>
    </button>}
    {sofa && <button type="button" className={styles.contextButton}
      disabled={disabled || !enabled || busy !== null || (!state.seated && !state.available)}
      aria-pressed={state.seated} aria-keyshortcuts={ladder ? undefined : "E"} onClick={() => onAction(state.seated ? "stand" : "sit")}>
      <span className={styles.contextIcon}><IconSmile /></span>
      <span className={styles.contextCopy}>
        <strong>{busy === "stand" ? "일어나는 중…" : busy === "sit" ? "자리 잡는 중…" : state.seated ? "일어나기" : state.available ? "앉기" : "자리 없음"}</strong>
      </span>
      <span className={styles.contextCount} aria-label={`좌석 ${state.capacity}석 중 ${state.occupied}석 사용 중`}>{state.occupied}/{state.capacity}</span>
    </button>}
    {state.inside && state.bookNear && <button type="button" className={styles.contextButton} disabled={disabled || busy !== null} onClick={onRead} aria-haspopup="dialog">
      <span className={styles.contextIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1ZM12 6v15" /></svg></span>
      <span className={styles.contextCopy}><strong>책보기</strong></span>
    </button>}
  </>;
}
