"use client";
import { requestAiProcessing } from "@/lib/safety";
import SafetyReport from "@/components/SafetyReport";
import DailyQuote from "@/components/DailyQuote";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Briefing,
  Goal,
  Journal,
  LogBook,
  Memo,
  Moment,
  MomentMode,
  Review,
  ScheduleItem,
  addDays,
  loadBriefing,
  loadCategoryOrder,
  loadCustomCategories,
  loadGoals,
  loadJournal,
  loadLog,
  loadMemos,
  loadMoments,
  loadPrompts,
  loadReview,
  loadSchedule,
  saveBriefing,
  saveMoment,
  saveReview,
  sessionUserId,
  syncRecords,
  todayKey,
} from "@/lib/storage";
import { completeKakaoLogin, fetchMe } from "@/lib/auth";
import { allCategories, orderCategories } from "@/lib/categories";
import HelpBanner from "@/components/HelpBanner";
import { SkeletonCard, SkeletonHero, fmtRelative } from "@/components/ui";
import { useScrollMemory } from "@/lib/scroll-memory";
import { IconChevronR, IconCheck, IconNote, IconBubble, IconPlus, IconSquarePlus, IconHeart, IconStar, IconPen } from "@/components/Icons";
import { useRouter } from "next/navigation";
import { CARE_BUILTIN, CARE_CATALOG, type CareAction, type CareTone, careDoneToday, loadCareExtras, markCareDone, saveCareExtras } from "@/lib/care";
import { BreathSheet, CareAddSheet, CareIcon } from "@/components/CareSheets";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import styles from "./account-screens.module.css";

const TONE_CLASS: Record<CareTone, string> = { briefing: styles.toneBriefing, praise: styles.tonePraise, love: styles.toneLove, review: styles.toneReview, mint: styles.toneMint, plum: styles.tonePlum };

interface Data {
  journal: Journal;
  log: LogBook;
  memos: Memo[];
  goals: Goal[];
  schedule: ScheduleItem[];
}

type Mode = "briefing" | MomentMode | "review";

/** 홈 상단: 가운데 로고, 오른쪽에 인스타그램처럼 새 글(+). 내리면 숨고 올리면 다시 나온다 (프로필은 하단 탭의 "나"에서) */
function HomeHeader() {
  const hidden = useHideOnScroll();
  return <header className={styles.homeHeader} data-hidden={hidden || undefined}>
    <span aria-hidden="true" />
    <h1 aria-label="소로우">SOROW</h1>
    <Link href="/write" className={`icon-btn ${styles.homeWrite}`} aria-label="새 외침 쓰기" title="새 외침 쓰기"><IconSquarePlus /></Link>
  </header>;
}

/** 나를 위한 시간 한 칸. 기본 4칸은 AI 상태에서, 추가한 칸은 lib/care 의 오늘 기록에서 done 을 정한다 (안 했으면 빨간 점) */
interface CareTile { action: CareAction; label: string; done: boolean; on: boolean; busy: boolean; disabled: boolean; aria: string; onPress: () => void }

const MOMENTS: Record<MomentMode, { label: string; heading: string }> = {
  praise: { label: "칭찬받기", heading: "오늘의 칭찬" },
  love: { label: "사랑받기", heading: "나를 사랑하는 법" },
};

/** API로 보낼 재료: 최근 기록, 오늘 한 일, 메모, 목표, 일정 */
function buildPayload(data: Data, today: string) {
  const recentKeys = Object.keys(data.journal)
    .filter((k) => k < today && k >= addDays(today, -7))
    .sort();
  return {
    date: today,
    categories: orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder()),
    prompts: loadPrompts(),
    today: data.journal[today] ?? {},
    todayDid: data.log[today]?.did ?? [],
    recent: recentKeys.map((k) => ({ date: k, record: data.journal[k], did: data.log[k]?.did ?? [] })),
    memos: [...data.memos]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .slice(0, 20)
      .map((m) => ({ cat: m.cat, text: m.text, pinned: m.pinned })),
    goals: data.goals
      .filter((g) => !g.doneAt)
      .map((g) => ({ title: g.title, cat: g.cat, why: g.why, due: g.due, steps: g.steps.map((s) => ({ text: s.text, done: s.done })) })),
    schedule: data.schedule
      .filter((s) => s.date >= today && s.date <= addDays(today, 3))
      .sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")))
      .map((s) => ({ date: s.date, time: s.time, title: s.title, cat: s.cat, done: s.done })),
  };
}

export default function HomePage() {
  const [today, setToday] = useState(todayKey);
  const [data, setData] = useState<Data | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [moments, setMoments] = useState<Partial<Record<MomentMode, Moment>>>({});
  const [open, setOpen] = useState<MomentMode | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loading, setLoading] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  // 나를 위한 시간: 추가한 칸과 오늘 했는지 (이 기기, 계정별)
  const [careExtras, setCareExtras] = useState<string[]>([]);
  const [careDone, setCareDone] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const refreshCare = useCallback(() => {
    const ids = loadCareExtras();
    setCareExtras(ids);
    setCareDone(Object.fromEntries(ids.map((id) => [id, careDoneToday(id, today)])));
  }, [today]);

  // Refresh the record day too when the app stays open overnight or resumes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      setToday(todayKey(now));
      clearTimeout(timer);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const reload = useCallback(() => {
    setBriefing((current) => current?.date === today ? current : null);
    setMoments((current) => ({ praise: current.praise?.date === today ? current.praise : undefined, love: current.love?.date === today ? current.love : undefined }));
    setReview((current) => current?.date === today ? current : null);
    const apply = () => {
      setData({ journal: loadJournal(), log: loadLog(), memos: loadMemos(), goals: loadGoals(), schedule: loadSchedule() });
      const b = loadBriefing();
      setBriefing(b && b.date === today ? b : null);
      const m = loadMoments();
      setMoments({ praise: m.praise?.date === today ? m.praise : undefined, love: m.love?.date === today ? m.love : undefined });
      const r = loadReview();
      setReview(r && r.date === today ? r : null);
      setReviewOpen(false);
      setOpen(null);
      refreshCare();
    };
    // 익명이면 이 기기의 데이터를 바로. 로그인 계정이면 서버에서 받은 뒤에 (빈 화면이 잠깐 비치지 않게)
    const guest = !sessionUserId();
    if (guest) apply();
    // 카카오 로그인 콜백은 /?kakao=1 로 돌아온다: 세션 쿠키는 이미 있으니 가입 때처럼 게스트 기록을 계정으로 옮긴 뒤 진행
    const fromKakao = new URLSearchParams(window.location.search).get("kakao") === "1";
    if (fromKakao) window.history.replaceState(null, "", "/");
    (fromKakao ? completeKakaoLogin() : fetchMe())
      .catch(() => null) // 세션 키만 맞춘다 (계정 표시는 하단 탭 "나"에서)
      .then(() => syncRecords())
      .then((pulled) => { if (!guest || pulled) apply(); });
  }, [today, refreshCare]);

  useEffect(reload, [reload]);
  useScrollMemory(data !== null);

  const empty = useMemo(
    () => Boolean(data) && Object.keys(data!.journal).length === 0 && !Object.values(data!.log).some((day) => day.did.length > 0) && data!.memos.length === 0 && data!.goals.length === 0 && data!.schedule.length === 0,
    [data]
  );

  const call = async (mode: Mode) => {
    if (!data || inFlight.current) return;
    inFlight.current = true;
    setLoading(mode);
    setError(null);
    try {
      if (!(await requestAiProcessing())) return;
      const payload = buildPayload(data, today);
      const allMemos =
        mode === "review"
          ? [...data.memos]
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((m) => ({ date: todayKey(new Date(m.createdAt)), cat: m.cat, text: m.text, pinned: m.pinned }))
          : undefined;
      const res = await fetch("/api/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, ...payload, allMemos }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "정리하지 못했어요");
      const json = await res.json();
      if (todayKey() !== today) return;
      const base = { date: today, generatedAt: Date.now(), source: json.source, crisis: json.crisis };
      if (mode === "briefing") {
        const b: Briefing = { ...base, data: json.briefing };
        saveBriefing(b);
        setBriefing(b);
      } else if (mode === "review") {
        const r: Review = { ...base, data: json.review };
        saveReview(r);
        setReview(r);
        setReviewOpen(true);
        setOpen(null);
      } else {
        const m: Moment = { ...base, mode, data: json.moment };
        saveMoment(m);
        setMoments((cur) => ({ ...cur, [mode]: m }));
        setOpen(mode);
        setReviewOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "정리하지 못했어요");
    } finally {
      inFlight.current = false;
      setLoading(null);
    }
  };

  const press = (mode: Mode) => {
    if (loading) return;
    if (mode === "briefing") {
      if (!briefing) call("briefing");
    } else if (mode === "review") {
      if (review) {
        setReviewOpen((v) => !v);
        setOpen(null);
      } else call("review");
    } else {
      if (moments[mode]) {
        setOpen((cur) => (cur === mode ? null : mode));
        setReviewOpen(false);
      } else call(mode);
    }
  };

  if (!data) return <><HomeHeader /><div className="screen" role="status" aria-label="오늘의 기록을 불러오고 있어요"><SkeletonHero /><div style={{ height: 16 }} /><SkeletonCard lines={2} head /></div></>;

  const d = briefing?.data;
  const categories = orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder());
  const total = categories.length;
  const filled = categories.filter((category) => data.journal[today]?.[category.id] !== undefined).length;
  const didCount = data.log[today]?.did.length ?? 0;
  const logDone = filled >= total && total > 0;
  const dirLabel = { up: "▲ 올라오는 중", flat: "→ 유지 중", down: "▼ 내려간 날" } as const;
  const crisis = briefing?.crisis || moments.praise?.crisis || moments.love?.crisis || review?.crisis;
  const openMoment = open ? moments[open] : undefined;
  // 기본 4칸: AI 상태(오늘 캐시)로 done/busy 를 정한다
  const aiState: Record<string, { done: boolean; on: boolean; aria: string; busyLabel: string; doneLabel?: string }> = {
    briefing: { done: Boolean(briefing), on: false, aria: "오늘의 나 정리", busyLabel: "정리 중…", doneLabel: "정리 완료" },
    praise: { done: Boolean(moments.praise), on: open === "praise", aria: MOMENTS.praise.heading, busyLabel: "생각 중…" },
    love: { done: Boolean(moments.love), on: open === "love", aria: MOMENTS.love.heading, busyLabel: "생각 중…" },
    review: { done: Boolean(review), on: reviewOpen, aria: "메모로 나를 분석", busyLabel: "분석 중…" },
  };
  const runCare = (action: CareAction) => {
    if (action.kind === "breath") { setBreathing(true); return; }
    if (action.kind === "link" && action.href) {
      markCareDone(action.id, today);
      refreshCare();
      router.push(action.href);
    }
  };
  const care: CareTile[] = [
    ...CARE_BUILTIN.map((action) => {
      const s = aiState[action.id];
      const busy = loading === action.id;
      return {
        action, done: s.done, on: s.on, busy, aria: s.aria,
        label: busy ? s.busyLabel : s.done && s.doneLabel ? s.doneLabel : action.label,
        disabled: loading !== null || (action.id === "briefing" && s.done),
        onPress: () => press(action.id as Mode),
      };
    }),
    ...careExtras.flatMap((id) => {
      const action = CARE_CATALOG.find((c) => c.id === id);
      return action ? [{ action, label: action.label, done: Boolean(careDone[id]), on: false, busy: false, disabled: false, aria: action.desc, onPress: () => runCare(action) }] : [];
    }),
  ];

  return (
    <>
      <HomeHeader />
      <div className="screen home">

        <DailyQuote />

        {/* 오늘의 기록: 버튼 하나 (글라스). 아직 아무것도 안 썼으면 빨간 점, 다 채우면 체크 */}
        <Link
          href="/log"
          className={`${styles.recordBtn} ${logDone ? styles.recordDone : ""}`}
          aria-label={logDone ? `오늘의 기록 돌아보기, 마음 ${filled}/${total}, 한 일 ${didCount}개` : filled || didCount ? `오늘의 기록 이어 쓰기, 마음 ${filled}/${total}, 한 일 ${didCount}개` : "오늘의 마음 기록하기, 아직 쓴 기록이 없어요"}
        >
          <span className={styles.recordIcon}>{logDone ? <IconCheck /> : <IconPen />}</span>
          <span className={styles.recordText}>
            <b>오늘의 기록</b>
            <small>마음 {filled}/{total} · 한 일 {didCount}개</small>
            <span className={styles.recordBar} aria-hidden="true"><i style={{ width: `${total ? Math.round((filled / total) * 100) : 0}%` }} /></span>
          </span>
          <span className={styles.recordCta}>{logDone ? "돌아보기" : filled || didCount ? "이어 쓰기" : "기록하기"}<IconChevronR /></span>
          {!filled && !didCount && <span className={styles.careDot} aria-hidden="true" />}
        </Link>

        {empty && <section aria-labelledby="home-start-title">
          <div className={styles.sectionHeading}><h3 id="home-start-title">나의 속도로 시작해요</h3></div>
          <div className={styles.quickLinks}>
            <Link href="/memo" className={`card ${styles.quickLink}`}><IconNote /><b>생각을 담는 메모</b><small>스쳐 가는 마음도<br />짧게 남겨두세요.</small></Link>
            <Link href="/shout" className={`card ${styles.quickLink}`}><IconBubble /><b>마음을 나누는 외침</b><small>혼자 담아두기 힘든<br />이야기를 나눠요.</small></Link>
          </div>
        </section>}

        {/* 나를 위한 시간: 기본 4칸 + 사용자가 추가한 칸 (lib/care.ts) */}
        {!empty && (
          <section aria-labelledby="home-care-title">
          <div className={styles.sectionHeading}>
            <h3 id="home-care-title">나를 위한 시간</h3>
            <button type="button" className={styles.sectionAdd} onClick={() => setAdding(true)} aria-label="나를 위한 시간 칸 추가"><IconPlus />추가</button>
          </div>
          <div className={styles.care}>
            <div className={styles.careGrid}>
              {care.map(({ action, label, done, on, busy, disabled, aria, onPress }) => {
                const fresh = !done && !busy; // 오늘 아직 안 눌렀으면 빨간 점
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={`${styles.careTile} ${TONE_CLASS[action.tone]} ${done ? styles.careDone : ""} ${on ? styles.careOn : ""} ${busy ? styles.careBusy : ""}`}
                    disabled={disabled}
                    onClick={onPress}
                    aria-pressed={action.kind === "ai" && action.id !== "briefing" ? on : undefined}
                    aria-busy={busy}
                    aria-label={fresh ? `${aria} · 오늘 아직 안 했어요` : aria}
                    title={action.id === "briefing" && done ? "오늘 정리 완료 · 하루 한 번" : undefined}
                  >
                    <span className={styles.careIcon}><CareIcon name={action.icon} /></span>
                    <span className={styles.careLabel}>{label}</span>
                    {fresh && <span className={styles.careDot} aria-hidden="true" />}
                    {done && !busy && <span className={styles.careCheck} aria-hidden="true"><IconCheck /></span>}
                  </button>
                );
              })}
            </div>
          </div>
          <CareAddSheet
            open={adding}
            selected={careExtras}
            onClose={() => setAdding(false)}
            onToggle={(id) => {
              // 저장된 목록을 그때그때 읽어 연타해도 앞 선택이 덮이지 않게
              const cur = loadCareExtras();
              saveCareExtras(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
              refreshCare();
            }}
          />
          <BreathSheet open={breathing} onClose={() => setBreathing(false)} onDone={() => { markCareDone("breath", today); refreshCare(); }} />
          </section>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
        {(briefing || openMoment || review) && <SafetyReport kind="ai" />}
        {crisis && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}

        {/* 칭찬 / 사랑 */}
        {(loading === "praise" || loading === "love") && <Skeleton />}
        {open && openMoment && !loading && (
          <section className="card moment" style={{ marginTop: 12 }}>
            <div className="head">
              <span className="label">{open === "praise" ? <IconStar /> : <IconHeart />} {MOMENTS[open].heading}</span>
              <span className="tiny muted">{fmtRelative(openMoment.generatedAt)}</span>
            </div>
            <h3>{openMoment.data.title}</h3>
            <ul className="brief-list">
              {openMoment.data.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {openMoment.data.closing && <p className="closing">{openMoment.data.closing}</p>}
            <SourceBadge source={openMoment.source} />
          </section>
        )}

        {/* 점검 */}
        {loading === "review" && <Skeleton />}
        {reviewOpen && review && !loading && (
          <section className="card review" style={{ marginTop: 12 }}>
            <div className="head">
              <span className="label">그때의 나 → 오늘의 나</span>
              <span className="tiny muted">{fmtRelative(review.generatedAt)}</span>
            </div>
            <h3>{review.data.headline}</h3>
            {review.data.cautions.length > 0 && (
              <>
                <div className="sub-title">주의할 점</div>
                <div className="stack" style={{ gap: 8 }}>
                  {review.data.cautions.map((c, i) => (
                    <div key={i} className="caution">
                      <div className="then"><span className="tag">그때</span>{c.past}</div>
                      <div className="now"><span className="tag">오늘</span>{c.now}</div>
                      <p className="note">{c.note}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {review.data.changes.length > 0 && (
              <>
                <div className="sub-title">그때와 다른 점</div>
                <ul className="brief-list">
                  {review.data.changes.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </>
            )}
            {review.data.growth && (
              <>
                <div className="sub-title">움직인 거리</div>
                <p className="brief-text">{review.data.growth}</p>
              </>
            )}
            {review.data.question && <p className="closing">{review.data.question}</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <SourceBadge source={review.source} />
              <Link href="/memo" className="text-btn" style={{ marginLeft: "auto" }}>되돌아보기 <IconChevronR /></Link>
            </div>
          </section>
        )}

        {/* 정리하기: 결과는 모두 타일 아래로 (불러오는 동안도) */}
        {loading === "briefing" && (
          <section className={`hero ${styles.homeHero}`} aria-busy="true" aria-label="오늘의 기록을 정리하고 있어요">
            <div className="skeleton" style={{ height: 22, width: "70%", margin: "4px 0 12px" }} />
            <div className="skeleton" style={{ height: 14, width: "100%" }} />
            <div className="skeleton" style={{ height: 14, width: "60%", marginTop: 8 }} />
          </section>
        )}
        {d && !open && !reviewOpen && (
          <>
            <section className={`hero ${styles.homeHero}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">{dirLabel[d.momentum.direction]}</span>
                <span className="label">{fmtRelative(briefing!.generatedAt)}</span>
              </div>
              <h2>{d.headline}</h2>
              <p>{d.momentum.text}</p>
            </section>
            <section className="card" style={{ marginTop: 12 }}>
              <ul className="brief-list">
                {d.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </section>
            {d.nextStep && (
              <section className="card next-step" style={{ marginTop: 10 }}>
                <div className="label">지금 한 걸음</div>
                <p>{d.nextStep}</p>
              </section>
            )}
            <section className="card stack" style={{ gap: 10, marginTop: 10 }}>
              <p className="brief-text"><span className="tiny muted" style={{ fontWeight: 700 }}>일정 · </span>{d.today.schedule}</p>
              <p className="brief-text"><span className="tiny muted" style={{ fontWeight: 700 }}>목표 · </span>{d.today.goals}</p>
              {d.question && <p className="question muted" style={{ fontSize: 14 }}>{d.question}</p>}
            </section>
            <div style={{ marginTop: 10 }}><SourceBadge source={briefing!.source} /></div>
          </>
        )}

        {/* AI 안내는 결과(정리·칭찬·사랑·분석)가 화면에 보일 때만 그 아래에 */}
        {!loading && ((d && !open && !reviewOpen) || (open && openMoment) || (reviewOpen && review)) && (
          <p className={styles.aiNote}>AI 응답은 의료 진단·치료가 아니에요. <Link href="/info/ai">AI 이용 안내</Link></p>
        )}
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <section className="card" style={{ marginTop: 12 }} aria-busy="true">
      <div className="skeleton" style={{ height: 20, width: "70%", marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 14, width: "100%" }} />
      <div className="skeleton" style={{ height: 14, width: "88%", marginTop: 8 }} />
      <div className="skeleton" style={{ height: 14, width: "55%", marginTop: 8 }} />
    </section>
  );
}

function SourceBadge({ source }: { source: "ai" | "local" }) {
  return <span className={`badge ${source === "ai" ? "" : "gray"}`}>{source === "ai" ? "AI" : "간단 버전"}</span>;
}
