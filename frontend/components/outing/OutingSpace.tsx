"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MoruCompanion from "@/components/MoruCompanion";
import { Sheet } from "@/components/ui";
import { OUTING_ACTIVITIES, OUTING_PLACES, activityUnlocked, isOutingPlace, type OutingActivity } from "@/lib/outing";
import { useOuting } from "@/lib/use-outing";
import { createOutingSound } from "@/lib/outing-sound";
import OutingActivitySheet from "./OutingActivitySheet";
import OutingIcon from "./OutingIcon";
import styles from "./Outing.module.css";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export default function OutingSpace() {
  const search = useSearchParams();
  const requested = search.get("place");
  if (!isOutingPlace(requested)) return <main className={styles.invalidPlace}><OutingIcon name="leaf" size={40} /><h1>오늘 머물 풍경을 골라 주세요.</h1><Link href="/outing" className={styles.primaryButton}>외출 고르기</Link></main>;
  return <PlaceScene key={requested} placeId={requested} />;
}

function PlaceScene({ placeId }: { placeId: "park" | "sea" | "mountain" }) {
  const place = OUTING_PLACES[placeId];
  const activities = OUTING_ACTIVITIES.filter(a => a.place === placeId);
  const { view, setView, companion, status, error, refresh } = useOuting();
  const [active, setActive] = useState<OutingActivity | null>(null);
  const [locked, setLocked] = useState<OutingActivity | null>(null);
  const [list, setList] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [actor, setActor] = useState({ x: 52, y: 76 });
  const [moving, setMoving] = useState(false);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [imageError, setImageError] = useState(false);
  const [bubble, setBubble] = useState<string>(place.whisper);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<ReturnType<typeof createOutingSound> | null>(null);
  const soundWanted = useRef(false);
  const soundPending = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const bound = useCallback((x: number, y: number, scale = zoom) => {
    const v = viewport.current; const w = world.current;
    if (!v || !w) return { x: 0, y: 0 };
    const maxX = Math.max(0, (w.offsetWidth * scale - v.clientWidth) / 2);
    const maxY = Math.max(0, (w.offsetHeight * scale - v.clientHeight) / 2);
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }, [zoom]);
  useEffect(() => {
    const onResize = () => setPan(p => bound(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bound]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) void audio.current?.pause();
      else if (soundWanted.current) void audio.current?.play().catch(() => { setSound(false); soundWanted.current = false; });
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { if (walkTimer.current) clearTimeout(walkTimer.current); document.removeEventListener("visibilitychange", visibility); void audio.current?.close().catch(() => {}); audio.current = null; };
  }, []);
  const walk = (x: number, y: number) => {
    setActor({ x: clamp(x, 6, 94), y: clamp(y, 56, 87) }); setMoving(true); setBubble("천천히 갈게. 같이 가자.");
    if (walkTimer.current) clearTimeout(walkTimer.current);
    walkTimer.current = setTimeout(() => { setMoving(false); setBubble(place.whisper); }, 1400);
  };
  const openActivity = (a: OutingActivity) => {
    setList(false);
    if (!activityUnlocked(a, view.affinity, view.xp) || !view.unlocked.includes(a.id)) { setLocked(a); return; }
    walk(a.x, Math.max(62, a.y)); setActive(a);
  };
  const moveView = (dx: number, dy = 0) => setPan(p => bound(p.x + dx, p.y + dy));
  const zoomTo = (amount: number) => { const next = clamp(amount, 1, 1.65); setZoom(next); setPan(p => bound(p.x, p.y, next)); };
  function down(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button,a") || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y, moved: false };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 7) d.moved = true;
    if (d.moved) setPan(bound(d.startX + dx, d.startY + dy));
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current; drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved && world.current) { const rect = world.current.getBoundingClientRect(); walk((e.clientX - rect.left) / rect.width * 100, (e.clientY - rect.top) / rect.height * 100); }
  }
  async function toggleSound() {
    if (soundPending.current) return;
    soundPending.current = true; setSoundError("");
    try {
      if (!audio.current) audio.current = createOutingSound(placeId);
      if (sound) await audio.current.pause(); else await audio.current.play();
      soundWanted.current = !sound; setSound(!sound);
    } catch { setSoundError("이 브라우저에서는 소리를 켜지 못했어요."); }
    finally { soundPending.current = false; }
  }
  const night = active?.kind === "stars";
  return <main className={styles.scene} data-place={placeId} data-night={night || undefined}>
    <div ref={viewport} className={styles.viewport} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} role="group" aria-label={`${place.short} 파노라마. 드래그로 둘러보고, 빈 곳을 눌러 함께 걸어요.`}>
      <div ref={world} className={styles.world} style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
        <img src={place.image} width="1672" height="941" alt={place.mood} draggable={false} fetchPriority="high" onError={() => setImageError(true)} />
        <div className={styles.landscapeTint} />
        <div className={styles.waterShimmer} aria-hidden="true" />
        <div className={styles.distantMist} style={{ transform: `translateX(${-pan.x * .02}px)` }} aria-hidden="true" />
        <div className={styles.mapPins}>{activities.map(a => { const unlocked = view.unlocked.includes(a.id); return <button key={a.id} className={styles.mapPin} style={{ left: `${a.x}%`, top: `${a.y}%`, "--pin-scale": 1 / zoom } as CSSProperties} data-locked={!unlocked || undefined} data-done={view.completedToday.includes(a.id) || undefined} onClick={() => openActivity(a)} aria-label={`${a.name}${unlocked ? " 시작" : ` · 함께한 ${a.day}일에 열려요`}`}><span className={styles.pinGlyph}><OutingIcon name={unlocked ? a.icon : "lock"} size={19} /></span><span className={styles.pinLabel}>{a.name}<small>{unlocked ? view.completedToday.includes(a.id) ? "오늘 남긴 추억" : "함께하기" : `${a.day}일에 열려요`}</small></span></button>; })}</div>
        <button className={styles.walkingCompanion} data-moving={moving || undefined} style={{ left: `${actor.x}%`, top: `${actor.y}%`, "--companion-size": .70 + (actor.y - 56) / 31 * .7 } as CSSProperties} onClick={() => { setBubble("네가 불러 주니까 좋다."); setMoving(false); }} aria-label={`${companion.name}에게 말 걸기`}><span className={styles.companionShadow} /><MoruCompanion appearance={companion.appearance} mood={moving ? "idle" : "happy"} level={view.level} /><span className={styles.nameTag}>{companion.name}</span></button>
      </div>
      <div className={styles.foregroundHaze} style={{ transform: `translateX(${pan.x * .025}px)` }} aria-hidden="true" />
      <div className={styles.particles} aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ left: `${(i * 31 + 7) % 100}%`, top: `${(i * 17 + 11) % 86}%`, animationDelay: `${-i * 1.8}s`, animationDuration: `${14 + i % 5 * 3}s` }} />)}</div>
    </div>
    <header className={styles.sceneHeader}><Link href="/outing" className={styles.glassButton} aria-label="외출 장소 선택으로 돌아가기"><OutingIcon name="back" /></Link><div><span>{place.english}</span><h1>{place.short}</h1></div><button className={styles.glassButton} onClick={() => void toggleSound()} aria-label={sound ? "풍경 소리 끄기" : "풍경 소리 켜기"} aria-pressed={sound}><OutingIcon name={sound ? "volume" : "mute"} /></button></header>
    <div className={styles.sceneProgress}><span><OutingIcon name="heart" size={14} /> {view.affinity} <small>/ 1,000</small></span><i /><span>Lv.{view.level}</span><i /><span>함께한 {view.days}일</span></div>
    {(error || soundError || imageError) && <div className={styles.sceneNotice} role="alert">{imageError ? "풍경 이미지를 불러오지 못했어요. 활동은 아래 목록에서 즐길 수 있어요." : soundError || error}{error && <button onClick={() => void refresh()}>다시 연결</button>}</div>}
    <aside className={styles.sceneTools} aria-label="풍경 시점 조절"><button onClick={() => zoomTo(zoom + .15)} disabled={zoom >= 1.65} aria-label="풍경 확대">+</button><button onClick={() => zoomTo(zoom - .15)} disabled={zoom <= 1} aria-label="풍경 축소">−</button><span /><button onClick={() => moveView(180)} aria-label="풍경 왼쪽 보기">‹</button><button onClick={() => moveView(-180)} aria-label="풍경 오른쪽 보기">›</button><button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }} aria-label="시점 가운데로">◎</button></aside>
    <div className={styles.sceneBottom}><div className={styles.speech}><span>{companion.name}</span><p aria-live="polite">“{bubble}”</p></div><div className={styles.sceneActions}><button onClick={() => setList(true)}><OutingIcon name="spark" size={18} /> 여기서 함께할 것들 <span>{activities.filter(a => view.unlocked.includes(a.id)).length}</span></button><Link href="/outing/meet" aria-label="소로우 통합모임에서 사람들 만나러 가기"><OutingIcon name="people" size={19} /></Link></div><p className={styles.sceneHint}>옆으로 드래그해 둘러보기 · 빈 곳을 눌러 함께 걷기</p></div>
    <Sheet open={list} onClose={() => setList(false)} title="여기서 함께할 것들" className={styles.activitySheet}><div className={styles.activityList}>{activities.map(a => { const open = view.unlocked.includes(a.id); return <button key={a.id} onClick={() => openActivity(a)}><span><OutingIcon name={open ? a.icon : "lock"} size={23} /></span><div><b>{a.name}</b><small>{open ? a.detail : `함께한 ${a.day}일 · 호감도 ${a.day * 10}부터`}</small></div><OutingIcon name={view.completedToday.includes(a.id) ? "check" : "arrow"} size={16} /></button>; })}</div><p className={styles.quietNote}>오늘 첫 활동에 호감도 +10, 경험치 +20.<br />다른 순간도 마음껏 즐겨요.</p></Sheet>
    <Sheet open={Boolean(locked)} onClose={() => setLocked(null)} title="조금 더 가까워지면" className={styles.activitySheet}>{locked && <div className={styles.lockedContent}><span className={styles.keepsake}><OutingIcon name={locked.icon} size={34} /></span><h2>{locked.name}</h2><p>{locked.detail}</p><b>함께한 {locked.day}일에 열려요.</b><small>호감도 {locked.day * 10} · 경험치 {locked.day * 20}<br />지금부터 {Math.max(0, locked.day - view.days)}번의 작은 외출 뒤에 만나요.</small><button className={styles.primaryButton} onClick={() => { setLocked(null); setList(true); }}>지금 즐길 수 있는 것 보기</button></div>}</Sheet>
    {active && <OutingActivitySheet key={active.id} activity={active} companion={companion} status={status} onClose={() => setActive(null)} onComplete={setView} />}
  </main>;
}
