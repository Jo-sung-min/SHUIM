"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "./ui";
import MoruSprite, { type MoruMood } from "./MoruSprite";
import MoruCompanion, { COMPANIONS } from "./MoruCompanion";
import { ROOM_SCENES } from "./MoruRoom";
import MoruHomeScene from "./MoruHomeScene";
import { fetchMe } from "@/lib/auth";
import { EMPTY_ANSWERS, PET_MOODS, PET_NEEDS, PET_REASONS, PET_STEPS, PetError, answerCount, petRequest, type PetAnswers, type PetView } from "@/lib/pet";
import { sessionUserId, syncRecords, loadProfile } from "@/lib/storage";
import styles from "./MoruPet.module.css";

export default function MoruPet({ userId }: { userId: string | null }) {
  return <PetRoom key={userId || "guest"} userId={userId} />;
}
function PetRoom({ userId }: { userId: string | null }) {
  const [pet, setPet] = useState<PetView | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [message, setMessage] = useState("말없이 곁에 있어도 좋아.");
  const [mood, setMood] = useState<MoruMood>("idle");
  const [sheet, setSheet] = useState<"journal" | "name" | "guide" | "homes" | "companions" | null>(null);
  const [chosenAppearance, setChosenAppearance] = useState("moru");
  const [ownerName, setOwnerName] = useState("");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PetAnswers>({ ...EMPTY_ANSWERS });
  const [draftDate, setDraftDate] = useState("");
  const [name, setName] = useState("");
  const [scene, setScene] = useState(0);
  const [celebration, setCelebration] = useState<{ id: number; food: number; level: number | null } | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftDirty = useRef(false);
  const canUse = Boolean(userId && !needsLogin);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 4000);
    return () => clearTimeout(timer);
  }, [celebration]);
  const react = useCallback((next: MoruMood, text: string) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setMood(next); setMessage(text);
    reactionTimer.current = setTimeout(() => { setMood("idle"); setMessage("말없이 곁에 있어도 좋아."); }, 4200);
  }, []);
  useEffect(() => {
    alive.current = true;
    if (userId) void fetchMe().then((me) => {
      if (alive.current && me.user?.id === userId) setOwnerName(loadProfile().name.trim() || me.user.nick.trim());
    }).catch(() => {});
    return () => { alive.current = false; if (reactionTimer.current) clearTimeout(reactionTimer.current); };
  }, [userId]);
  const load = useCallback(async () => {
    if (!userId || lock.current) return;
    lock.current = true;
    try {
      const data = await petRequest();
      if (!alive.current || sessionUserId() !== userId) return;
      setPet(data); setError(""); setNeedsLogin(false);
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "방을 불러오지 못했어요."); if (e instanceof PetError && e.status === 401) setNeedsLogin(true); }
    } finally { lock.current = false; if (alive.current) setLoading(false); }
  }, [userId]);
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
      if (path === "/journal" && !await syncRecords()) throw new Error("아직 저장 중인 기록이 있어요. 연결을 확인한 뒤 다시 저장해 주세요.");
      if (!alive.current || sessionUserId() !== userId) return null;
      const data = await petRequest(path, body, method);
      if (!alive.current || sessionUserId() !== userId) return null;
      setPet(data);
      if (path === "/journal") await syncRecords();
      if (!alive.current || sessionUserId() !== userId) return null;
      return data;
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); if (e instanceof PetError && e.status === 401) setNeedsLogin(true); }
      return null;
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const openJournal = () => {
    if (!pet) return;
    if (!draftDirty.current) {
      setDraft({ ...EMPTY_ANSWERS, ...pet.answers });
      setDraftDate(pet.date);
      const answers = pet.answers;
      const firstEmpty = [answers.mood, answers.intensity, answers.reason, answers.note?.trim(), answers.need].findIndex((value) => !value);
      setStep(firstEmpty < 0 ? 4 : firstEmpty);
    }
    setSheet("journal"); setError("");
  };
  const change = (patch: Partial<PetAnswers>) => { setDraft((a) => ({ ...a, ...patch })); draftDirty.current = true; };
  const saveJournal = async () => {
    const previousLevel = pet?.level ?? 1;
    const data = await mutate("/journal", { date: draftDate, answers: draft });
    if (!data) return;
    if (data.reward > 0 || data.level > previousLevel) setCelebration({ id: Date.now(), food: data.reward, level: data.level > previousLevel ? data.level : null });
    draftDirty.current = false; setSheet(null);
    react("happy", data.reward ? `마음을 남겨줘서 고마워. 마음밥 +${data.reward}` : "네 마음, 잘 간직해 둘게.");
  };
  const progress = pet ? pet.level === 10 ? 100 : (pet.xp - pet.levelStart) / (pet.levelEnd - pet.levelStart) * 100 : 0;
  const petName = pet?.name || "모루";
  const staleDraft = Boolean(pet && draftDate !== pet.date);
  const address = ownerName ? `${ownerName}님, ` : "";
  const homeId = pet?.homeId ?? 0;
  const ownedHomes = pet?.ownedHomes ?? [0];
  if (!canUse) return <section className={styles.card} aria-label="모루를 만나기">
    <Link href="/auth" className={styles.closedRoom} aria-label="나를 찾아줘 — 로그인하고 모루 만나기">
      <span className={styles.closedRain} aria-hidden="true" />
      <span className={styles.closedWindow} aria-hidden="true"><i /><i /><b /><em>✦</em></span>
      <span className={styles.findMe}>나를 찾아줘<span>창문을 두드려 주세요</span></span>
    </Link>
  </section>;
  return <section className={styles.card} aria-label="나의 소로우 모루 키우기">
    <div className={styles.room}>
      <MoruHomeScene homeId={homeId} scene={scene} />
      <div className={styles.scenePicker} role="group" aria-label="창밖 풍경">
        {ROOM_SCENES.map((label, index) => <button key={label} type="button" title={label} aria-label={label} aria-pressed={scene === index} onClick={() => setScene(index)}><span aria-hidden="true">{index === 0 ? "☂" : index === 1 ? "❄" : "☾"}</span></button>)}
      </div>
      <div className={styles.roomHeader}>
      <div className={styles.identity}>
        <button type="button" disabled={!pet || !canUse} className={styles.name} onClick={() => { setName(petName); setSheet("name"); setError(""); }} aria-label={`${petName} 이름 바꾸기`}>{petName}<span aria-hidden="true">✎</span></button>
        <span className={styles.level}>Lv.{pet?.level ?? 1}</span>
      </div>
        <button type="button" className={styles.help} aria-label="친구 모습 고르기" title="친구 모습" onClick={() => { setChosenAppearance(pet?.appearance ?? "moru"); setError(""); setSheet("companions"); }}>♧</button>
        {pet && <button type="button" className={styles.points} onClick={() => { setError(""); setSheet("homes"); }} aria-label={`방문포인트 ${pet.points ?? 0} 포인트, 공간 상점 열기`}>{pet.points ?? 0} P</button>}
        <button type="button" className={styles.help} aria-label="돌봄 안내" onClick={() => setSheet("guide")}>?</button>
      </div>
      {celebration && <div key={celebration.id} className={styles.celebration} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setCelebration(null); }}>
        {Array.from({ length: celebration.food }, (_, i) => <i key={i} style={{ left: `${28 + i * 11}%`, animationDelay: `${i * 100}ms` }} aria-hidden="true" />)}
        <span role="status">{celebration.level ? `Lv.${celebration.level} ↑` : `🍚 +${celebration.food}`}</span>
      </div>}
      {mood !== "idle" && <div className={styles.speech} aria-live="polite">{message}</div>}
      <button type="button" className={styles.petButton} aria-label={`${petName} 쓰다듬기`} onClick={() => react("pet", `${address}와 줘서 좋아.`)}>
        <MoruCompanion appearance={pet?.appearance} mood={mood === "idle" && pet?.food === 0 ? "sleep" : mood} level={pet?.level} />
      </button>
    </div>
    <div className={styles.details}>
      <div className={styles.moodBar}><span>행복도 · {mood === "pet" ? "반가움" : mood === "happy" || mood === "eat" ? "포근함" : "고요함"}</span><span>{pet?.homes?.find((home) => home.id === homeId)?.name ?? "동굴"}</span></div>
      <div className={styles.xp} role="progressbar" aria-label="모루 성장" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div>
      {loading ? <p className={styles.notice} role="status">모루가 방을 정리하고 있어요…</p> : pet && canUse ? <>
        <div className={styles.stats}>
          <span aria-label={`마음밥 ${pet.food}개`}>🍚 <strong>{pet.food}</strong></span>
          <span aria-label={`오늘 식사 ${pet.meals}끼`}>식사 {pet.meals}/3</span>
          <Link href="/memo" aria-label="마음기록장 열기">기록장 ↗</Link>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={busy} onClick={openJournal}>{pet.earned === 5 ? "오늘의 마음 보기" : "모루 밥 주기"}</button>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setError(""); setSheet("homes"); }}>이사하기</button>

        </div>
      </> : !error || needsLogin ? <Link href="/auth" className={styles.adopt}>모루 만나기</Link> : null}
      {error && !sheet && <div className={styles.error} role="alert">{error}{!needsLogin && <button type="button" onClick={() => void load()}>다시 연결하기</button>}</div>}
    </div>
    <Sheet open={sheet === "journal"} title="모루의 마음밥" onClose={() => { if (!busy) setSheet(null); }}>
      <div className={styles.journal}>
        <p className={styles.foodIntro}>{address}모루는 마음의 양식을 먹고 자라요.</p>
        <div className={styles.steps}>{PET_STEPS.map((label, i) => <button type="button" key={label} aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)} disabled={busy}><b>{i + 1}</b><span>{label}</span></button>)}</div>
        <div className={styles.stepContent}>
          {step === 0 && <><h4>지금 마음은 어떤가요?</h4><Choices values={PET_MOODS} value={draft.mood} onChange={(mood) => change({ mood })} disabled={busy} /></>}
          {step === 1 && <><h4>그 마음은 얼마나 큰가요?</h4><p>좋고 나쁨이 아닌, 감정의 크기예요.</p><Choices values={["1", "2", "3", "4", "5"]} value={draft.intensity?.toString() ?? null} onChange={(v) => change({ intensity: Number(v) })} disabled={busy} /><div className={styles.rangeLabels}><span>아주 작게</span><span>아주 크게</span></div></>}
          {step === 2 && <><h4>어디에서 온 마음일까요?</h4><Choices values={PET_REASONS} value={draft.reason} onChange={(reason) => change({ reason })} disabled={busy} /></>}
          {step === 3 && <><h4>오늘의 한 조각을 남겨 주세요.</h4><label className={styles.noteLabel}>짧은 한 줄도 충분해요<textarea maxLength={500} value={draft.note || ""} onChange={(e) => change({ note: e.target.value })} placeholder="오늘은 어떤 하루였나요?" disabled={busy} /></label><div className={styles.rangeLabels}><button type="button" disabled={busy} onClick={() => change({ note: "오늘은 말 대신 조용히 쉬고 싶어요." })}>오늘은 말 대신 쉬고 싶어요</button><span>{draft.note?.length || 0}/500</span></div></>}
          {step === 4 && <><h4>지금 나에게 필요한 것은?</h4><Choices values={PET_NEEDS} value={draft.need} onChange={(need) => change({ need })} disabled={busy} /></>}
        </div>
        {staleDraft && <div className={styles.error} role="alert">한국 시간으로 날짜가 바뀌었어요. 작성한 내용은 그대로예요.<button type="button" onClick={() => setDraftDate(pet!.date)}>이 내용을 오늘의 기록으로 남기기</button></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.journalActions}><button type="button" className={styles.secondary} disabled={busy || answerCount(draft) === 0 || staleDraft} onClick={() => void saveJournal()}>{busy ? "저장 중…" : "여기까지 저장"}</button>{step < 4 ? <button type="button" className={styles.primary} disabled={busy} onClick={() => setStep((v) => v + 1)}>다음 마음 →</button> : <button type="button" className={styles.primary} disabled={busy || answerCount(draft) === 0 || staleDraft} onClick={() => void saveJournal()}>{busy ? "저장 중…" : "마음 남기고 밥 모으기"}</button>}</div>
      </div>
    </Sheet>
    <Sheet open={sheet === "companions"} title="나의 작은 친구" onClose={() => { if (!busy) setSheet(null); }}>
      <div className={styles.companionGallery}>
        <div className={styles.companionHero}><MoruCompanion appearance={chosenAppearance} mood="idle" level={pet?.level} /></div>
        <div className={styles.companionChoices} role="group" aria-label="캐릭터 선택">
          {COMPANIONS.map((friend) => <button key={friend.id} type="button" disabled={busy} aria-pressed={chosenAppearance === friend.id} onClick={() => setChosenAppearance(friend.id)}>
            <MoruCompanion appearance={friend.id} mood={chosenAppearance === friend.id ? "happy" : "idle"} />
            <strong>{friend.name}</strong><small>{friend.detail}</small>
          </button>)}
        </div>
        <p className={styles.footnote}>모습만 바뀌어요. 이름과 함께 쌓은 기록은 그대로예요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={styles.primary} disabled={busy || !pet || chosenAppearance === (pet.appearance ?? "moru")} onClick={async () => {
          const data = await mutate("/appearance", { appearance: chosenAppearance });
          if (data) { setSheet(null); setMood("idle"); if (reactionTimer.current) clearTimeout(reactionTimer.current); }
        }}>{busy ? "저장 중…" : !pet ? "연결 후 선택할 수 있어요" : chosenAppearance === (pet.appearance ?? "moru") ? "함께하는 중" : "이 모습으로 함께하기"}</button>
      </div>
    </Sheet>
    <Sheet open={sheet === "homes"} title="모루의 공간" onClose={() => { if (!busy) setSheet(null); }}>
      <div className={styles.shop}>
        <p className={styles.shopBalance}>방문포인트 <b>{pet?.points ?? 0} P</b><small>첫 방문 +10 · 마음기록 최대 +20 / 하루</small></p>
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
    <Sheet open={sheet === "name"} title="우리 친구의 이름" onClose={() => { if (!busy) setSheet(null); }}>
      <form className={styles.journal} onSubmit={async (e) => { e.preventDefault(); const data = await mutate("/name", { name }); if (data) { setSheet(null); react("happy", `${data.name}, 그게 내 이름이구나!`); } }}>
        <label className={styles.noteLabel}>부르고 싶은 이름<input maxLength={20} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required /></label>
        {error && <p role="alert" className={styles.error}>{error}</p>}<button type="submit" disabled={busy || !name.trim()} className={styles.primary}>이름 불러주기</button>
      </form>
    </Sheet>
    <Sheet open={sheet === "guide"} title="모루와 천천히, 함께" onClose={() => setSheet(null)}>
      <div className={styles.guide}>
        <MoruSprite mood="happy" />
        <p>마음 기록하면 +5 🍚<br />하루 세 끼 −3 🍚<br />쉬어 가도 괜찮아요.</p>
        <Link href="/memo" onClick={() => setSheet(null)}>기록장 ↗</Link>
      </div>
    </Sheet>
  </section>;
}
function Choices({ values, value, onChange, disabled }: { values: string[]; value: string | null; onChange: (v: string) => void; disabled: boolean }) {
  return <div className={styles.choices}>{values.map((v) => <button type="button" key={v} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{v}</button>)}</div>;
}
