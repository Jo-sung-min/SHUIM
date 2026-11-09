import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { IconClose } from "@/components/Icons";
import type { BoardGame } from "@/lib/beach/net";
import styles from "./BunkerBoardGame.module.css";

export type BoardAction = "join" | "leave" | "move" | "rematch";

const REASON: Record<string, string> = {
  five: "다섯 개를 나란히 이었어요", count: "판이 끝났어요", left: "상대가 자리를 떠났어요", time: "시간이 다 됐어요", full: "판이 가득 찼어요",
};
const STAR_POINTS = [3, 7, 11];
const clock = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** One shared board for two people. Everyone else in the lodge can watch. The server decides what is legal; this only asks. */
export default function BunkerBoardGame({ title, board, myPid, busy, onAction, onClose }: {
  title: string; board: BoardGame; myPid: string | null; busy: boolean;
  onAction: (action: BoardAction, cell?: number) => void; onClose: () => void;
}) {
  const omok = board.game === "omok", size = board.size;
  const myColor = myPid && board.black?.pid === myPid ? "black" : myPid && board.white?.pid === myPid ? "white" : null;
  const myTurn = myColor !== null && board.turn === myColor;
  const legal = useMemo(() => new Set(board.legal), [board.legal]);
  const canPlay = (cell: number) => myTurn && !busy && (omok ? board.cells[cell] === "." : legal.has(cell));
  const [draft, setDraft] = useState<number | null>(null);
  const [resigning, setResigning] = useState(false);
  const [leftMs, setLeftMs] = useState(board.turnMsLeft);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => { setDraft(null); setResigning(false); }, [board.version]);
  useEffect(() => {
    const deadline = Date.now() + board.turnMsLeft;
    setLeftMs(board.turnMsLeft);
    if (board.turn === null) return;
    const timer = window.setInterval(() => setLeftMs(Math.max(0, deadline - Date.now())), 500);
    return () => window.clearInterval(timer);
  }, [board.version, board.turn, board.turnMsLeft]);
  useEffect(() => {
    if (!resigning) return;
    const timer = window.setTimeout(() => setResigning(false), 3500);
    return () => window.clearTimeout(timer);
  }, [resigning]);

  const place = (cell: number) => { if (canPlay(cell)) onAction("move", cell); };
  /** Points on the larger board are small under a thumb, so the first tap only marks the spot. */
  const tap = (cell: number) => {
    if (!canPlay(cell)) return;
    if (!omok || draft === cell) place(cell); else setDraft(cell);
  };
  const onBoardKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size };
    if (event.key in moves) {
      event.preventDefault();
      const from = draft ?? Math.floor(size * size / 2), next = from + moves[event.key];
      const sameLine = Math.abs(moves[event.key]) === size || Math.floor(next / size) === Math.floor(from / size);
      if (next >= 0 && next < size * size && sameLine) setDraft(next);
    } else if ((event.key === "Enter" || event.key === " ") && draft !== null) { event.preventDefault(); place(draft); }
  };

  const nameOf = (color: "black" | "white") => board[color]?.nick ?? "빈자리";
  const winner = board.result === "black" || board.result === "white" ? board.result : null;
  const status = board.result
    ? { main: winner ? (winner === myColor ? "이겼어요!" : myColor ? "아쉽게 졌어요" : `${nameOf(winner)}님 승리`) : "무승부예요", sub: board.reason === "count" ? `흑 ${board.blackCount} : 백 ${board.whiteCount}` : REASON[board.reason ?? ""] ?? "" }
    : board.turn
      ? { main: myTurn ? "내 차례예요" : `${nameOf(board.turn)}님 차례`, sub: board.passed && board.passed !== board.turn ? `${board.passed === myColor ? "둘 곳이 없어 넘어갔어요" : "상대가 둘 곳이 없어 한 번 더 둬요"}` : omok && myTurn ? "같은 자리를 한 번 더 누르면 놓여요" : "" }
      : { main: myColor ? "상대를 기다리고 있어요" : "두 사람이 앉으면 시작돼요", sub: myColor ? "다른 분이 앉으면 바로 시작돼요" : "" };
  const open = !board.black || !board.white;
  const stone = (color: "B" | "W", cell: number, ghost = false) => {
    const x = cell % size + .5, y = Math.floor(cell / size) + .5;
    return <circle key={ghost ? `ghost${cell}` : cell} cx={x} cy={y} r={omok ? .44 : .39} fill={`url(#${color === "B" ? "boardBlack" : "boardWhite"})`} opacity={ghost ? .55 : 1} />;
  };

  return <div className={styles.backdrop} role="presentation" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
      <header className={styles.header}>
        <h2>{title}</h2>
        <span className={styles.status} aria-live="polite"><strong>{status.main}</strong>{board.turn !== null && <em>{clock(leftMs)}</em>}</span>
        <button ref={closeRef} type="button" className={styles.close} aria-label="닫기" onClick={onClose}><IconClose /></button>
      </header>
      <div className={styles.seats}>
        {(["black", "white"] as const).map(color => <div key={color} className={styles.seat} data-active={board.turn === color}>
          <span className={styles.chip} data-color={color} aria-hidden="true" />
          <span className={styles.name}>{nameOf(color)}{board[color]?.pid === myPid && board[color] ? " (나)" : ""}</span>
          {!omok && <b>{color === "black" ? board.blackCount : board.whiteCount}</b>}
        </div>)}
      </div>
      <svg className={styles.board} data-game={board.game} viewBox={`0 0 ${size} ${size}`} role="application" tabIndex={0}
        aria-label={`${title} 판. 화살표로 자리를 고르고 Enter로 둡니다.`} onKeyDown={onBoardKey}>
        <defs>
          <radialGradient id="boardBlack" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#5a5753" /><stop offset="1" stopColor="#100e0d" /></radialGradient>
          <radialGradient id="boardWhite" cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d5cdbd" /></radialGradient>
        </defs>
        <rect width={size} height={size} className={styles.surface} />
        {omok
          ? Array.from({ length: size }, (_, i) => <g key={i} className={styles.line}><path d={`M.5 ${i + .5}H${size - .5}`} /><path d={`M${i + .5} .5V${size - .5}`} /></g>)
          : Array.from({ length: size + 1 }, (_, i) => <g key={i} className={styles.line}><path d={`M0 ${i}H${size}`} /><path d={`M${i} 0V${size}`} /></g>)}
        {omok && STAR_POINTS.flatMap(y => STAR_POINTS.map(x => <circle key={`${x}-${y}`} cx={x + .5} cy={y + .5} r=".11" className={styles.star} />))}
        {Array.from(board.cells, (cell, index) => cell === "B" || cell === "W" ? stone(cell, index) : null)}
        {board.lastCell !== null && <circle cx={board.lastCell % size + .5} cy={Math.floor(board.lastCell / size) + .5} r=".12" className={styles.last} data-on={board.cells[board.lastCell]} />}
        {!omok && myTurn && board.legal.map(cell => <circle key={`hint${cell}`} cx={cell % size + .5} cy={Math.floor(cell / size) + .5} r=".13" className={styles.hint} />)}
        {draft !== null && myColor && canPlay(draft) && stone(myColor === "black" ? "B" : "W", draft, true)}
        {Array.from({ length: size * size }, (_, cell) => <rect key={`hit${cell}`} x={cell % size} y={Math.floor(cell / size)} width="1" height="1" className={styles.hit} data-playable={canPlay(cell)} onClick={() => tap(cell)} />)}
      </svg>
      {status.sub && <p className={styles.sub}>{status.sub}</p>}
      <div className={styles.actions}>
        {!myColor && open && <button type="button" className={styles.primary} disabled={busy} onClick={() => onAction("join")}>자리에 앉기</button>}
        {!myColor && !open && <p className={styles.watching}>두 분의 대국을 구경하고 있어요</p>}
        {myColor && draft !== null && canPlay(draft) && <button type="button" className={styles.primary} disabled={busy} onClick={() => place(draft)}>여기에 두기</button>}
        {myColor && board.result && !open && <button type="button" className={styles.primary} disabled={busy} onClick={() => onAction("rematch")}>한 판 더</button>}
        {myColor && <button type="button" className={styles.secondary} disabled={busy} onClick={() => {
          if (board.turn !== null && !resigning) setResigning(true); else onAction("leave");
        }}>{board.turn === null ? "일어나기" : resigning ? "정말 기권할까요?" : "기권하고 일어나기"}</button>}
      </div>
    </section>
  </div>;
}
