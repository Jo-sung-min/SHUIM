"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { IconClose, IconSparkle } from "@/components/Icons";
import type { SparklerLetter, WishLanternColor } from "@/lib/beach/net";
import styles from "./UyuniMomentControls.module.css";

const LETTERS: readonly SparklerLetter[] = ["L", "O", "V", "E", "heart", "star"];
const sparklerLabel = (letter: SparklerLetter) => letter === "heart" ? "하트" : letter === "star" ? "별" : letter;
const COLORS: readonly { color: WishLanternColor; label: string; tint: string }[] = [
  { color: "amber", label: "주황", tint: "#f1bd77" },
  { color: "rose", label: "장밋빛", tint: "#eea4b8" },
  { color: "mint", label: "민트", tint: "#a9d8c3" },
  { color: "sky", label: "하늘빛", tint: "#a5cbe9" },
  { color: "violet", label: "보라빛", tint: "#c4afe6" },
];
type Panel = "sparkler" | "lantern";
export interface UyuniMomentControlsProps {
  disabled: boolean;
  busy: boolean;
  cooldowns: { sparkler: number; lantern: number };
  onSparkler: (letter: SparklerLetter) => Promise<boolean>;
  onLantern: (color: WishLanternColor, wish: string) => Promise<boolean>;
  active?: boolean;
  onOpenChange?: (open: boolean) => void;
}
const secondsLeft = (deadline: number, now: number) => Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;

function LanternIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M6 5.5c0-2 12-2 12 0l-1.3 12c-.2 1.8-9.2 1.8-9.4 0L6 5.5Z" />
    <path d="M6 5.5c2.5 1.6 9.5 1.6 12 0M8 17.5c2.2-1 5.8-1 8 0M12 18v3" />
  </svg>;
}

/** Keep mounted inside the action tray so a folded menu never discards a wish. */
export default function UyuniMomentControls({ disabled, busy, cooldowns, onSparkler, onLantern,
  active = true, onOpenChange }: UyuniMomentControlsProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [wish, setWish] = useState("");
  const [color, setColor] = useState<WishLanternColor>("amber");
  const [pending, setPending] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const lock = useRef(false), mounted = useRef(true);
  const trigger = useRef<HTMLButtonElement | null>(null), dialog = useRef<HTMLDivElement>(null);
  const notify = useRef(onOpenChange); notify.current = onOpenChange;
  const id = useId(), visible = active && panel !== null;
  const remaining = { sparkler: secondsLeft(cooldowns.sparkler, now), lantern: secondsLeft(cooldowns.lantern, now) };
  const locked = disabled || busy || pending !== null || !active;
  const length = Array.from(wish).length;
  const validWish = wish.trim().length > 0 && length <= 80;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; notify.current?.(false); };
  }, []);
  useEffect(() => { if (!active) setPanel(null); }, [active]);
  useEffect(() => { notify.current?.(visible); }, [visible]);
  useEffect(() => {
    setNow(Date.now());
    const deadline = Math.max(cooldowns.sparkler || 0, cooldowns.lantern || 0);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now(); setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldowns.sparkler, cooldowns.lantern]);
  useEffect(() => {
    if (!visible) return;
    const view = window.visualViewport;
    const resize = () => setViewport({ top: view?.offsetTop ?? 0, height: view?.height ?? window.innerHeight });
    resize(); view?.addEventListener("resize", resize); view?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    dialog.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus({ preventScroll: true });
    return () => {
      view?.removeEventListener("resize", resize); view?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      trigger.current?.focus({ preventScroll: true });
    };
  }, [visible]);

  function open(kind: Panel, button: HTMLButtonElement) {
    if (locked || secondsLeft(cooldowns[kind], Date.now()) > 0) return;
    trigger.current = button; setError(null); setPanel(kind);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); setPanel(null); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  async function send(kind: Panel, letter?: SparklerLetter) {
    if (lock.current || locked || secondsLeft(cooldowns[kind], Date.now()) > 0
      || (kind === "lantern" && !validWish) || (kind === "sparkler" && !letter)) return;
    lock.current = true; setPending(kind); setError(null);
    try {
      const confirmed = kind === "sparkler" ? await onSparkler(letter!) : await onLantern(color, wish.trim());
      if (!mounted.current) return;
      if (confirmed) {
        if (kind === "lantern") setWish("");
        setNotice(kind === "lantern" ? "소원을 담은 등을 날렸어요." : `손에 든 스파클러로 ${sparklerLabel(letter!)} 그리기를 시작했어요.`);
        setPanel(null);
      } else setError("시작을 확인하지 못했어요. 같은 선택으로 다시 눌러 주세요.");
    } catch {
      if (mounted.current) setError("연결을 확인한 뒤 다시 시도해 주세요. 적어 둔 마음은 그대로 있어요.");
    } finally {
      lock.current = false;
      if (mounted.current) setPending(null);
    }
  }

  return <>
    <button type="button" className={styles.tile} disabled={locked || remaining.sparkler > 0}
      aria-haspopup="dialog" aria-expanded={visible && panel === "sparkler"} aria-controls={`${id}-dialog`}
      aria-label={remaining.sparkler ? `불꽃 막대, ${remaining.sparkler}초 후 가능` : "불꽃 막대"}
      onClick={event => open("sparkler", event.currentTarget)}>
      <span className={styles.sparklerIcon}><IconSparkle /></span><strong>불꽃 막대</strong>
      <small>{pending === "sparkler" ? "그리는 중…" : remaining.sparkler ? `${remaining.sparkler}초 후` : "손끝에 남는 빛"}</small>
    </button>
    <button type="button" className={styles.tile} disabled={locked || remaining.lantern > 0}
      aria-haspopup="dialog" aria-expanded={visible && panel === "lantern"} aria-controls={`${id}-dialog`}
      aria-label={remaining.lantern ? `소원등, ${remaining.lantern}초 후 가능` : "소원등"}
      onClick={event => open("lantern", event.currentTarget)}>
      <span className={styles.lanternIcon}><LanternIcon /></span><strong>소원등</strong>
      <small>{pending === "lantern" ? "날리는 중…" : remaining.lantern ? `${remaining.lantern}초 후` : "하늘에 전하는 마음"}</small>
    </button>
    <span className={styles.srOnly} role="status">{notice}</span>
    {visible && createPortal(<div className={styles.backdrop} style={viewport ?? undefined}
      onPointerDown={event => { if (event.target === event.currentTarget) setPanel(null); }}>
      <div ref={dialog} id={`${id}-dialog`} className={styles.dialog} role="dialog" aria-modal="true"
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={pending !== null || busy}
        tabIndex={-1} onKeyDown={onKeyDown} onKeyUp={event => event.stopPropagation()}>
        <header className={styles.header}>
          <h2 id={`${id}-title`}>{panel === "sparkler" ? "불꽃으로 마음 남기기" : "소원을 담은 등"}</h2>
          <button type="button" className={styles.close} aria-label="닫기" onClick={() => setPanel(null)}><IconClose /></button>
        </header>
        <p id={`${id}-description`} className={styles.description}>{panel === "sparkler"
          ? "글자나 모양을 고르면 불꽃 막대로 다섯 번 겹쳐 그려요. 손이 지나간 자리마다 빛줄기가 조금씩 포개져요." : "작은 바람을 적어 하늘에 보내요."}</p>
        {panel === "sparkler" ? <>
          <div className={styles.letters} role="group" aria-label="불꽃으로 그릴 글자와 모양">
            {LETTERS.map((letter, index) => <button key={letter} type="button" data-initial-focus={index === 0 || undefined}
              disabled={locked || remaining.sparkler > 0} aria-label={`불꽃으로 ${sparklerLabel(letter)} 그리기`}
              onClick={() => void send("sparkler", letter)}>{letter === "heart" || letter === "star"
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={letter === "heart" ? "M12 20S3 14.4 3 8.5C3 3.9 9 2.4 12 7c3-4.6 9-3.1 9 1.5C21 14.4 12 20 12 20Z"
                    : "m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9L12 3Z"} />
                </svg> : letter}</button>)}
          </div>
          {remaining.sparkler > 0 && <p className={styles.hint}>{remaining.sparkler}초 뒤에 다시 그릴 수 있어요.</p>}
        </> : <form onSubmit={event => { event.preventDefault(); void send("lantern"); }}>
          <fieldset className={styles.colors} disabled={locked}>
            <legend>등 색</legend><div className={styles.swatches}>
              {COLORS.map(option => <button key={option.color} type="button" aria-pressed={color === option.color}
                aria-label={`${option.label} 등`} onClick={() => setColor(option.color)}
                style={{ "--lantern-color": option.tint } as CSSProperties}>
                <span aria-hidden="true">{color === option.color ? "✓" : ""}</span><small>{option.label}</small>
              </button>)}
            </div>
          </fieldset>
          <div className={styles.wishHeading}><label htmlFor={`${id}-wish`}>나의 소원</label>
            <span id={`${id}-count`} aria-label={`${length}자, 최대 80자`} data-invalid={length > 80}>{length}/80</span></div>
          <input id={`${id}-wish`} data-initial-focus type="text" value={wish} disabled={locked} autoComplete="off"
            placeholder="이루고 싶은 작은 바람" aria-invalid={length > 80} aria-describedby={`${id}-count ${id}-sharing`}
            onChange={event => setWish(event.target.value.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f-\u009f]/g, ""))} />
          <p id={`${id}-sharing`} className={styles.hint}>같은 공간에 있는 사람들도 소원을 읽을 수 있어요.</p>
          {length > 80 && <p className={styles.error}>소원은 80자 이내로 적어 주세요.</p>}
          <button className={styles.submit} type="submit" disabled={locked || remaining.lantern > 0 || !validWish}>
            {pending === "lantern" ? "날리는 중…" : remaining.lantern ? `${remaining.lantern}초 후 등 날리기` : "등 날리기"}
          </button>
        </form>}
        {disabled && <p className={styles.hint}>연결을 확인하고 있어요.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>, document.body)}
  </>;
}
