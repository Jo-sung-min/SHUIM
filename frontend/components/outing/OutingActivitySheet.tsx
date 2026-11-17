"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui";
import MoruCompanion from "@/components/MoruCompanion";
import type { Companion } from "@/lib/moru";
import { sessionUserId } from "@/lib/storage";
import { OUTING_MILESTONES, OutingError, outingRequest, type OutingActivity, type OutingSession, type OutingView } from "@/lib/outing";
import OutingIcon from "./OutingIcon";
import styles from "./Outing.module.css";

export default function OutingActivitySheet({ activity, companion, status, onClose, onComplete }: {
  activity: OutingActivity; companion: Companion; status: "loading" | "guest" | "ready" | "error";
  onClose: () => void; onComplete: (view: OutingView) => void;
}) {
  const [session, setSession] = useState<OutingSession | null>(null);
  const [remaining, setRemaining] = useState(activity.seconds);
  const [picked, setPicked] = useState<number[]>([]);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reward, setReward] = useState(0);
  const [gift, setGift] = useState("");
  const [retry, setRetry] = useState(0);
  const started = useRef<number | null>(null);
  const sessionOwner = useRef<string | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const saveAbort = useRef<AbortController | null>(null);
  const drawing = useRef<HTMLCanvasElement>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const guest = status === "guest";

  useEffect(() => { alive.current = true; return () => { alive.current = false; saveAbort.current?.abort(); }; }, []);
  useEffect(() => {
    const abort = new AbortController(); started.current = null; setError(""); setSession(null);
    if (status === "loading") return () => abort.abort();
    if (status !== "ready") { started.current = performance.now(); return () => abort.abort(); }
    sessionOwner.current = sessionUserId();
    outingRequest<OutingSession>("/start", { actionId: activity.id }, abort.signal).then(next => {
      if (abort.signal.aborted) return;
      setSession(next); started.current = performance.now() - Math.max(0, activity.seconds * 1000 - (next.readyAt - next.serverTime));
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [activity.id, activity.seconds, status, retry]);
  useEffect(() => {
    let previous = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      // Background tabs do not speed through the visible moment.
      if (started.current !== null) {
        if (document.hidden) started.current += now - previous;
        else setRemaining(Math.max(0, Math.ceil(activity.seconds - (now - started.current) / 1000)));
      }
      previous = now;
    }, 250);
    return () => clearInterval(tick);
  }, [activity.seconds]);

  const pick = (id: number) => setPicked(p => p.includes(id) ? p : [...p, id]);
  const completeInteraction = activity.kind === "collect" ? picked.length >= 3 : activity.kind === "stars" ? picked.length >= 5 : activity.kind === "picnic" ? Boolean(choice) : activity.kind === "draw" ? drawn : true;
  const ready = remaining === 0 && completeInteraction && (status !== "ready" || Boolean(session));
  const line = activity.lines[Math.min(2, Math.floor((1 - remaining / activity.seconds) * 3))];
  async function complete() {
    if (!ready || pending.current || finished) return;
    if (status !== "ready") { setFinished(true); return; }
    if (!session || sessionOwner.current !== sessionUserId()) { setError("계정이 바뀌었어요. 외출을 다시 시작해 주세요."); return; }
    pending.current = true; setBusy(true); setError("");
    const abort = new AbortController(); saveAbort.current = abort;
    try {
      const result = await outingRequest<OutingView>("/complete", { token: session.token, note }, abort.signal);
      if (!alive.current || sessionOwner.current !== sessionUserId()) return;
      onComplete(result); setReward(result.rewardAffinity);
      if (result.rewardAffinity > 0) setGift(OUTING_MILESTONES.find(m => m.day === result.days)?.gift ?? "");
      setFinished(true);
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "추억을 저장하지 못했어요.");
        if (e instanceof OutingError && (e.status === 410 || e.status === 401)) setSession(null);
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (event.type === "pointerdown") { event.currentTarget.setPointerCapture(event.pointerId); point.current = null; }
    else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = event.currentTarget.getBoundingClientRect();
    const next = { x: (event.clientX - box.left) * 600 / box.width, y: (event.clientY - box.top) * 260 / box.height };
    const ctx = event.currentTarget.getContext("2d");
    if (ctx) { ctx.strokeStyle = "#92725c"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(point.current?.x ?? next.x, point.current?.y ?? next.y); ctx.lineTo(next.x, next.y); ctx.stroke(); }
    point.current = next; setDrawn(true);
  }
  function stamp() {
    const ctx = drawing.current?.getContext("2d"); if (!ctx) return;
    ctx.font = "60px serif"; ctx.fillStyle = "#92725c"; ctx.textAlign = "center"; ctx.fillText("♡", 300, 155); setDrawn(true);
  }
  const canClose = () => { if (!pending.current) onClose(); };
  return <Sheet open onClose={canClose} title={finished ? "우리의 작은 순간" : activity.name} className={styles.activitySheet}>
    {finished ? <div className={styles.activityFinished}><div className={styles.keepsake}><OutingIcon name={activity.icon} size={38} /></div><span className={styles.eyebrow}>A MOMENT TO KEEP</span><h2>{activity.keepsake}</h2><p>{companion.name}와 오늘의 풍경을 나눴어요.</p>{status === "ready" ? <><span className={styles.reward}>{reward ? "호감도 +10 · 경험치 +20" : "오늘의 추억이 남았어요"}</span><small>{reward ? "함께한 하루가 차곡차곡 쌓였어요." : "성장은 하루 한 번, 즐거운 순간은 몇 번이든."}</small>{gift && <p className={styles.newGift}>새로 열렸어요<br /><b>{gift}</b></p>}</> : <><small>{guest ? "로그인하면 다음 외출부터 추억이 저장돼요." : "서버가 연결되지 않아 이번 추억은 저장되지 않았어요."}</small>{guest && <Link className={styles.textLink} href="/auth">로그인하기 <OutingIcon name="arrow" size={15} /></Link>}</>}<button className={styles.primaryButton} onClick={onClose}>조금 더 둘러보기</button></div> : <>
      <p className={styles.activityDetail}>{activity.detail}</p>
      <div className={styles.companionSays}><div><MoruCompanion appearance={companion.appearance} mood={remaining > 0 ? "idle" : "happy"} /></div><p><small>{companion.name}</small>{line}</p></div>
      {(activity.kind === "rest" || activity.kind === "breath") && <div className={styles.breathing} data-kind={activity.kind}><div className={styles.breathHalo}><OutingIcon name={activity.icon} size={34} /></div><span>{activity.kind === "breath" ? remaining % 8 > 4 ? "편안하게 들이쉬고" : "천천히 내쉬어요" : "잠깐, 이 풍경에 머물러요"}</span></div>}
      {activity.kind === "collect" && <div className={styles.collectGame}><p>마음에 드는 {activity.place === "park" ? "잎사귀" : "조개"} 세 개를 골라요 <b>{Math.min(picked.length, 3)} / 3</b></p><div>{[0, 1, 2, 3, 4, 5].map(id => <button key={id} data-picked={picked.includes(id)} onClick={() => pick(id)} aria-label={`${activity.place === "park" ? "잎사귀" : "조개"} ${id + 1} ${picked.includes(id) ? "골랐어요" : "고르기"}`} aria-pressed={picked.includes(id)} style={{ color: ["#8a9d6e", "#c19481", "#8e9bac", "#b3a17e", "#9d91b2", "#78a294"][id], rotate: `${id * 17 - 35}deg` }}><OutingIcon name={activity.place === "park" ? "leaf" : "shell"} size={36} />{picked.includes(id) && <i><OutingIcon name="check" size={13} /></i>}</button>)}</div></div>}
      {activity.kind === "stars" && <div className={styles.constellation}><svg viewBox="0 0 320 155" aria-hidden="true"><polyline points={[[35, 85], [95, 35], [158, 100], [225, 40], [280, 110]].filter((_, i) => picked.includes(i)).map(p => p.join(",")).join(" ")} fill="none" stroke="#e6dba7" strokeWidth="1.5" strokeDasharray="3 5" /></svg>{[[11, 55], [30, 23], [49, 65], [70, 26], [87, 71]].map(([x, y], id) => <button key={id} style={{ left: `${x}%`, top: `${y}%` }} data-picked={picked.includes(id)} onClick={() => pick(id)} aria-label={`${activity.id.includes("fireflies") ? "반딧불" : "별"} ${id + 1} 잇기`} aria-pressed={picked.includes(id)}><OutingIcon name="spark" size={picked.includes(id) ? 29 : 19} /></button>)}<span>작은 빛을 하나씩 이어 봐요 · {picked.length} / 5</span></div>}
      {activity.kind === "picnic" && <div className={styles.picnic}><div className={styles.teaCup}><OutingIcon name="cup" size={48} /><i /><i /><i /></div><p>오늘 같이 나누고 싶은 건?</p><div>{(activity.place === "park" ? ["따뜻한 빵", "달콤한 과일", "조용한 대화"] : ["보리차", "유자차", "따뜻한 물"]).map(c => <button key={c} aria-pressed={choice === c} onClick={() => setChoice(c)}>{c}</button>)}</div>{choice && <small>“{choice}, 좋아. 천천히 같이 나누자.”</small>}</div>}
      {activity.kind === "draw" && <div className={styles.sandGame}><canvas ref={drawing} width={600} height={260} onPointerDown={draw} onPointerMove={draw} onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); point.current = null; }} onPointerCancel={() => { point.current = null; }} aria-label="손가락이나 마우스로 모래에 그림을 그려요" /><div><button onClick={stamp}>하트 그리기</button><button onClick={() => drawing.current?.getContext("2d")?.clearRect(0, 0, 600, 260)}>파도에 맡기기</button></div></div>}
      {activity.kind === "write" && <label className={styles.letter}><span>지금 남기고 싶은 한마디 <small>선택</small></span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={240} rows={3} placeholder={activity.day === 100 ? "다음 계절에도, 우리…" : "오늘 내 마음은…"} /><small>나에게만 보이는 추억 · {note.length} / 240</small></label>}
      <div className={styles.activityProgress}><div className={styles.progress}><i style={{ width: `${Math.min(100, (1 - remaining / activity.seconds) * 100)}%` }} /></div><span>{remaining ? `${remaining}초, 조금 더 함께` : completeInteraction ? "이 순간을 간직할까요?" : "작은 활동을 마저 즐겨요"}</span></div>
      {status === "guest" && <p className={styles.previewNote}>지금은 둘러보는 중이에요. 로그인하면 함께한 날이 쌓여요.</p>}
      {status === "error" && <p className={styles.previewNote}>풍경은 즐길 수 있지만, 연결 전에는 기록이 저장되지 않아요.</p>}
      {error && <div className={styles.activityError} role="alert"><p>{error}</p>{!session && <button onClick={() => { setRemaining(activity.seconds); setRetry(v => v + 1); }}>활동 다시 시작</button>}</div>}
      <button className={styles.primaryButton} disabled={!ready || busy || status === "loading" || (status === "ready" && !session)} onClick={() => void complete()}>{busy ? "추억을 간직하는 중…" : status === "ready" ? "이 순간 간직하기" : "함께한 순간 마치기"}<OutingIcon name="heart" size={17} /></button>
    </>}
  </Sheet>;
}
