"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "./ui";
import MoruSprite, { type MoruMood } from "./MoruSprite";
import MoruCompanion, { COMPANIONS } from "./MoruCompanion";
import { ROOM_SCENES } from "./MoruRoom";
import MoruHomeScene from "./MoruHomeScene";
import MoruMindSheet from "./MoruMindSheet";
import { IconBook, IconSmile } from "./Icons";
import { fetchMe } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useBackLayer } from "@/lib/use-back-layer";
import { PetError, petRequest, type PetView } from "@/lib/pet";
import { DAILY_FOOD_MAX, HUNGRY_LINE, IDLE_LINE, MEAL_LINES, RESULT_LINE, dueMeals, koreaHour, mealStatus, petLine, recordLine, saveCompanion, takeNewMeal, type Companion } from "@/lib/moru";
import { sessionUserId, syncRecords, loadProfile } from "@/lib/storage";
import styles from "./MoruPet.module.css";

interface Props {
  userId: string | null;
  /** 칭찬·사랑·정리를 기다리는 동안 모루가 돌려 말할 문장 (버튼은 홈의 "나를 위한 시간") */
  thinking?: string[] | null;
  /** 새 결과가 나온 시각: 바뀌면 모루가 "다 적었어" */
  answeredAt?: number | null;
  onCompanion?: (companion: Companion) => void;
  /** 마음 기록으로 오늘의 기록이 바뀌었을 때 (홈이 다시 읽는다) */
  onRecordsChange?: () => void;
}

export default function MoruPet(props: Props) {
  return <PetRoom key={props.userId || "guest"} {...props} />;
}

function PetRoom({ userId, thinking = null, answeredAt = null, onCompanion, onRecordsChange }: Props) {
  const [pet, setPet] = useState<PetView | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [message, setMessage] = useState(IDLE_LINE);
  const [mood, setMood] = useState<MoruMood>("idle");
  const [sheet, setSheet] = useState<"mind" | "guide" | "homes" | "companions" | null>(null);
  const [chosenAppearance, setChosenAppearance] = useState("moru");
  const [ownerName, setOwnerName] = useState("");
  const [name, setName] = useState("");
  const [scene, setScene] = useState(0);
  const [thinkIndex, setThinkIndex] = useState(0);
  const [celebration, setCelebration] = useState<{ id: number; food: number; level: number | null } | null>(null);
  const [full, setFull] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greeted = useRef(false);
  const canUse = Boolean(userId && !needsLogin);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 4000);
    return () => clearTimeout(timer);
  }, [celebration]);
  const react = useCallback((next: MoruMood, text: string) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setMood(next); setMessage(text);
    reactionTimer.current = setTimeout(() => { setMood("idle"); setMessage(IDLE_LINE); }, 4200);
  }, []);
  useEffect(() => {
    alive.current = true;
    if (userId) void fetchMe().then((me) => {
      if (alive.current && me.user?.id === userId) setOwnerName(loadProfile().name.trim() || me.user.nick.trim());
    }).catch(() => {});
    return () => { alive.current = false; if (reactionTimer.current) clearTimeout(reactionTimer.current); };
  }, [userId]);
  /** 서버에서 방을 받는다. 끼니를 새로 먹었으면 처음 보는 순간 한마디, 밥이 없어 끼니를 거르고 있으면 한 번 말한다 */
  const load = useCallback(async (): Promise<PetView | null> => {
    if (!userId || lock.current) return null;
    lock.current = true;
    try {
      const data = await petRequest();
      if (!alive.current || sessionUserId() !== userId) return null;
      setPet(data); setError(""); setNeedsLogin(false);
      const meal = takeNewMeal(data.date, data.meals);
      if (meal !== null) react("eat", MEAL_LINES[meal]);
      else if (!greeted.current && data.food === 0 && dueMeals(koreaHour()) > data.meals) react("sleep", HUNGRY_LINE);
      greeted.current = true;
      return data;
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "방을 불러오지 못했어요."); if (e instanceof PetError && e.status === 401) setNeedsLogin(true); }
      return null;
    } finally { lock.current = false; if (alive.current) setLoading(false); }
  }, [userId, react]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); clearInterval(interval); };
  }, [load]);
  const mutate = async (path: string, body: unknown, method = "PUT") => {
    if (!canUse || lock.current || sessionUserId() !== userId) return null;
    lock.current = true; setBusy(true); setError("");
    try {
      const data = await petRequest(path, body, method);
      if (!alive.current || sessionUserId() !== userId) return null;
      setPet(data);
      return data;
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); if (e instanceof PetError && e.status === 401) setNeedsLogin(true); }
      return null;
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };

  const petName = pet?.name || "모루";
  const appearance = pet?.appearance ?? "moru";
  useEffect(() => {
    if (!pet) return;
    const companion = { name: petName, appearance };
    saveCompanion(companion);
    onCompanion?.(companion);
  }, [pet, petName, appearance, onCompanion]);

  // 칭찬·사랑·정리를 기다리는 동안 말풍선이 천천히 바뀐다. 결과가 오면 "다 적었어"
  useEffect(() => {
    if (!thinking) return;
    setThinkIndex(0);
    const timer = setInterval(() => setThinkIndex((i) => i + 1), 2600);
    return () => clearInterval(timer);
  }, [thinking]);
  const lastAnswer = useRef(answeredAt);
  useEffect(() => {
    if (answeredAt && answeredAt !== lastAnswer.current) react("happy", RESULT_LINE);
    lastAnswer.current = answeredAt;
  }, [answeredAt, react]);

  /** 마음 기록을 닫으면: 보낼 기록을 먼저 보내고(서버가 그때 마음밥을 준다) 방을 다시 받아 늘어난 밥만큼 축하 */
  const closeMind = async (changed: boolean) => {
    setSheet(null);
    if (!changed) return;
    const before = pet;
    await syncRecords();
    onRecordsChange?.();
    for (let i = 0; i < 20 && lock.current; i++) await new Promise((r) => setTimeout(r, 100));
    const data = await load();
    if (!data || !alive.current) return;
    const gained = Math.max(0, data.earned - (before?.earned ?? 0));
    const level = before && data.level > before.level ? data.level : null;
    if (gained > 0 || level) setCelebration({ id: Date.now(), food: gained, level });
    react("happy", recordLine(gained, data.earned));
  };

  const progress = pet ? pet.level === 10 ? 100 : (pet.xp - pet.levelStart) / (pet.levelEnd - pet.levelStart) * 100 : 0;
  const homeId = pet?.homeId ?? 0;
  const ownedHomes = pet?.ownedHomes ?? [0];
  const ready = Boolean(pet) && !busy;
  // 꽉 찬 화면: 방이 화면 전체(탭바 위까지)를 덮는다. 풍경·모루는 카드에서의 비율 그대로 화면을 채울 만큼 키운다 (가로가 넘치면 양옆이 잘린다)
  useBackLayer(full, () => { setFull(false); return false; });
  useEffect(() => {
    if (!full) return;
    const room = roomRef.current, world = worldRef.current;
    if (!room || !world) return;
    const fit = () => {
      const bottom = parseFloat(getComputedStyle(world).bottom) || 0;
      room.style.setProperty("--world-scale", Math.max(room.clientWidth / WORLD_W, (room.clientHeight - bottom) / WORLD_H).toFixed(4));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(room);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 뒤의 홈이 같이 스크롤되지 않게
    return () => { observer.disconnect(); document.body.style.overflow = previous; room.style.removeProperty("--world-scale"); };
  }, [full]);
  // 안드로이드 뒤로 가기는 열린 시트만 닫는다 (저장 중이면 그대로). 마음 기록은 남은 입력을 저장하고 닫는다
  const closeMindRef = useRef<(() => void) | null>(null);
  useBackLayer(sheet !== null, () => {
    if (busy) return true;
    if (sheet === "mind" && closeMindRef.current) closeMindRef.current();
    else setSheet(null);
    return false;
  });
  const openSheet = (next: NonNullable<typeof sheet>) => { haptic(8); setError(""); setSheet(next); };
  const speech = thinking ? thinking[thinkIndex % thinking.length] : mood !== "idle" ? message : null;

  if (!canUse) return <section className={styles.card} aria-label="모루를 만나기">
    <div className={styles.closedRoom}>
      <Link href="/auth" className={styles.closedLink} aria-label="나를 찾아줘 — 로그인하고 모루 만나기">
        <span className={styles.closedRain} aria-hidden="true" />
        <span className={styles.closedWindow} aria-hidden="true"><i /><i /><b /><em>✦</em></span>
        <span className={styles.findMe}>나를 찾아줘<span>창문을 두드려 주세요</span></span>
      </Link>
      <div className={styles.pad} role="group" aria-label="오늘의 마음">
        <div className={styles.keys}>
          <Link href="/log" className={`${styles.key} ${styles.keyMain}`} onClick={() => haptic(8)}><PenIcon /><span>마음 기록</span></Link>
        </div>
      </div>
    </div>
  </section>;
  // 모루의 방 한 장 = 게임 화면: 위에는 상태 HUD, 가운데는 모루, 아래에는 조작 패드. 버튼이 모두 이 안에 있다
  return <section className={styles.card} aria-label="나의 소로우 모루 키우기" data-full={full ? "" : undefined}>
    <div className={styles.room} ref={roomRef}>
      <div className={styles.world} ref={worldRef}>
        <MoruHomeScene homeId={homeId} scene={scene} />
        {speech && <div className={styles.speech} aria-live="polite" data-thinking={thinking ? "" : undefined}>{speech}</div>}
        <button type="button" className={styles.petButton} aria-label={`${petName} 쓰다듬기`} onClick={() => { haptic(8); react("pet", petLine(ownerName)); }}>
          <MoruCompanion appearance={pet?.appearance} mood={thinking ? "pet" : mood === "idle" && pet?.food === 0 ? "sleep" : mood} level={pet?.level} />
        </button>
      </div>
      <div className={styles.hud}>
        <div className={styles.nameplate}>
          <button type="button" disabled={!pet} onClick={() => { setName(petName); setChosenAppearance(appearance); openSheet("companions"); }} aria-label={`${petName}, 이름과 모습 바꾸기`}><b>{petName}</b><span>Lv.{pet?.level ?? 1}</span></button>
          <span className={styles.xp} role="progressbar" aria-label={`${petName} 성장`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></span>
        </div>
        <span className={styles.food} title="마음밥"><span aria-hidden="true">🍚</span><b aria-hidden="true">{pet?.food ?? 0}</b><span className="sr-only">마음밥 {pet?.food ?? 0}개</span></span>
        {pet && <button type="button" className={styles.points} onClick={() => openSheet("homes")} aria-label={`방문포인트 ${pet.points ?? 0} 포인트, 이사하기`}>{pet.points ?? 0} P</button>}
        <button type="button" className={styles.hudIcon} aria-label="돌봄 안내" onClick={() => openSheet("guide")}>?</button>
      </div>
      <div className={styles.scenePicker} role="group" aria-label="창밖 풍경">
        {ROOM_SCENES.map((label, index) => <button key={label} type="button" title={label} aria-label={label} aria-pressed={scene === index} onClick={() => { haptic(6); setScene(index); }}><span aria-hidden="true">{index === 0 ? "☂" : index === 1 ? "❄" : "☾"}</span></button>)}
      </div>
      <button type="button" className={styles.expand} aria-pressed={full} aria-label={full ? "작게 보기" : `${petName}를 꽉 찬 화면으로 보기`} title={full ? "작게 보기" : "꽉 찬 화면"} onClick={() => { haptic(8); setFull((v) => !v); }}><ExpandIcon shrink={full} /></button>
      {celebration && <div key={celebration.id} className={styles.celebration} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setCelebration(null); }}>
        {Array.from({ length: celebration.food }, (_, i) => <i key={i} style={{ left: `${28 + i * 11}%`, animationDelay: `${i * 100}ms` }} aria-hidden="true" />)}
        <span role="status">{celebration.level ? `Lv.${celebration.level} ↑` : `🍚 +${celebration.food}`}</span>
      </div>}
      {error && !sheet && <div className={styles.alert} role="alert"><span>{error}</span>{!needsLogin && <button type="button" onClick={() => void load()}>다시 연결</button>}</div>}
      <div className={styles.pad} role="group" aria-label={`${petName}와 오늘`}>
        <p className={styles.status}>{loading ? <span role="status">방을 정리하는 중…</span> : pet ? <><span>마음 {pet.earned}/{DAILY_FOOD_MAX} · 식사 {pet.meals}/3</span><span>{mealStatus(pet.meals, pet.food)}</span></> : <span>잠시 후 다시 만나요</span>}</p>
        <div className={styles.keys}>
          <button type="button" className={`${styles.key} ${styles.keyMain}`} disabled={!ready} onClick={() => { haptic(12); setError(""); setSheet("mind"); }} aria-label={`${petName}에게 오늘 마음 들려주기`}><PenIcon /><span>마음 기록</span></button>
          <button type="button" className={styles.key} disabled={!ready} onClick={() => openSheet("homes")} aria-label="이사하기, 공간 고르기"><HouseIcon /><span>이사</span></button>
          <button type="button" className={styles.key} disabled={!ready} onClick={() => { setName(petName); setChosenAppearance(appearance); openSheet("companions"); }} aria-label="이름과 모습 바꾸기"><IconSmile /><span>모습</span></button>
          <Link href="/memo" className={styles.key} onClick={() => haptic(8)} aria-label="마음기록장 열기"><IconBook /><span>기록장</span></Link>
        </div>
      </div>
    </div>
    <MoruMindSheet open={sheet === "mind"} name={petName} closeRef={closeMindRef} onClose={(changed) => void closeMind(changed)} />
    <Sheet open={sheet === "companions"} title="우리 친구" onClose={() => { if (!busy) setSheet(null); }}>
      <div className={styles.companionGallery}>
        <form className={styles.nameForm} onSubmit={async (e) => { e.preventDefault(); const data = await mutate("/name", { name }); if (data) { setSheet(null); react("happy", `${data.name}, 그게 내 이름이구나.`); } }}>
          <label className={styles.noteLabel}>부르고 싶은 이름<input maxLength={20} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required /></label>
          <button type="submit" className={styles.secondary} disabled={busy || !name.trim() || name.trim() === petName}>이름 바꾸기</button>
        </form>
        <div className={styles.companionHero}><MoruCompanion appearance={chosenAppearance} mood="idle" level={pet?.level} /></div>
        <div className={styles.companionChoices} role="group" aria-label="캐릭터 선택">
          {COMPANIONS.map((friend) => <button key={friend.id} type="button" disabled={busy} aria-pressed={chosenAppearance === friend.id} onClick={() => setChosenAppearance(friend.id)}>
            <MoruCompanion appearance={friend.id} mood={chosenAppearance === friend.id ? "happy" : "idle"} />
            <strong>{friend.name}</strong><small>{friend.detail}</small>
          </button>)}
        </div>
        <p className={styles.footnote}>모습만 바뀌어요. 이름과 함께 쌓은 기록은 그대로예요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={styles.primary} disabled={busy || !pet || chosenAppearance === appearance} onClick={async () => {
          const data = await mutate("/appearance", { appearance: chosenAppearance });
          if (data) { setSheet(null); setMood("idle"); if (reactionTimer.current) clearTimeout(reactionTimer.current); }
        }}>{busy ? "저장 중…" : !pet ? "연결 후 선택할 수 있어요" : chosenAppearance === appearance ? "함께하는 중" : "이 모습으로 함께하기"}</button>
      </div>
    </Sheet>
    <Sheet open={sheet === "homes"} title={`${petName}의 공간`} onClose={() => { if (!busy) setSheet(null); }}>
      <div className={styles.shop}>
        <p className={styles.shopBalance}>방문포인트 <b>{pet?.points ?? 0} P</b><small>첫 방문 +10 · 마음밥 하나에 +4 (하루 +20까지)</small></p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {pet?.homes?.map((home) => {
          const owned = ownedHomes.includes(home.id);
          const current = home.id === homeId;
          const previousNeeded = home.id > 0 && !owned && !ownedHomes.includes(home.id - 1);
          const lowLevel = pet.level < home.level;
          const missing = Math.max(0, home.cost - pet.points);
          const disabled = busy || current || !home.available || (!owned && (previousNeeded || lowLevel || missing > 0));
          const label = current ? "머무는 중" : !home.available ? "준비 중" : owned ? "머물기" : previousNeeded ? "이전 공간 필요" : lowLevel ? `Lv.${home.level} 필요` : missing ? `${missing} P 부족` : "구매하고 이사";
          return <article key={home.id} className={styles.homeCard}>
            <div className={styles.homePreview}>{home.available ? <MoruHomeScene homeId={home.id} scene={scene} /> : <span aria-hidden="true">⌂</span>}</div>
            <div className={styles.homeInfo}><strong>{home.name}</strong><small>Lv.{home.level} · {owned ? "보유" : `${home.cost} P`}</small>
              <button type="button" disabled={disabled} onClick={async () => { const data = await mutate("/home", { homeId: home.id }); if (data) { setSheet(null); setMood("idle"); if (reactionTimer.current) clearTimeout(reactionTimer.current); } }}>{label}</button>
            </div>
          </article>;
        })}
      </div>
    </Sheet>
    <Sheet open={sheet === "guide"} title={`${petName}와 천천히, 함께`} onClose={() => setSheet(null)}>
      <div className={styles.guide}>
        <MoruSprite mood="happy" />
        <p>오늘의 기록 하나 = 마음밥 1개 (하루 {DAILY_FOOD_MAX}개)<br />아침 8시 · 점심 13시 · 저녁 19시에 스스로 먹어요<br />쉬어 가도 괜찮아요.</p>
        <Link href="/memo">기록장 ↗</Link>
      </div>
    </Sheet>
  </section>;
}

function HouseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 11.5 12 4.5l8.5 7" /><path d="M6 10v9.5h12V10" /><path d="M10 19.5V15h4v4.5" /></svg>;
}
/** 꽉 찬 화면에서 풍경·모루를 키울 때의 기준 크기: 360px 폭 휴대폰의 카드 속 월드 */
const WORLD_W = 320;
const WORLD_H = 440;
/** 네 모서리가 벌어지는(키우기) / 모이는(줄이기) 화살표 */
function ExpandIcon({ shrink }: { shrink: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {shrink ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>;
}
function PenIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
}
