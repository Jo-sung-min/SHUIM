"use client";
import { confirmAiProcessing } from "@/lib/safety";
import SafetyReport from "@/components/SafetyReport";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  streak,
  syncRecords,
  todayKey,
} from "@/lib/storage";
import { Account, completeKakaoLogin, fetchMe } from "@/lib/auth";
import { allCategories, orderCategories } from "@/lib/categories";
import HelpBanner from "@/components/HelpBanner";
import { TopBar, fmtDate, fmtRelative } from "@/components/ui";
import { IconChevronR, IconCheck, IconNote, IconSparkle, IconUser } from "@/components/Icons";

interface Data {
  journal: Journal;
  log: LogBook;
  memos: Memo[];
  goals: Goal[];
  schedule: ScheduleItem[];
}

type Mode = "briefing" | MomentMode | "review";

const MOMENTS: Record<MomentMode, { emoji: string; label: string; heading: string }> = {
  praise: { emoji: "🌟", label: "칭찬받기", heading: "오늘의 칭찬" },
  love: { emoji: "💗", label: "사랑받기", heading: "나를 사랑하는 법" },
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
  const today = todayKey();
  const [data, setData] = useState<Data | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [moments, setMoments] = useState<Partial<Record<MomentMode, Moment>>>({});
  const [open, setOpen] = useState<MomentMode | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [me, setMe] = useState<Account | null>(null);
  const [loading, setLoading] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
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
    };
    // 익명이면 이 기기의 데이터를 바로. 로그인 계정이면 서버에서 받은 뒤에 (빈 화면이 잠깐 비치지 않게)
    const guest = !sessionUserId();
    if (guest) apply();
    // 카카오 로그인 콜백은 /?kakao=1 로 돌아온다: 세션 쿠키는 이미 있으니 가입 때처럼 게스트 기록을 계정으로 옮긴 뒤 진행
    const fromKakao = new URLSearchParams(window.location.search).get("kakao") === "1";
    if (fromKakao) window.history.replaceState(null, "", "/");
    (fromKakao ? completeKakaoLogin() : fetchMe())
      .then((m) => setMe(m.user))
      .catch(() => setMe(null))
      .then(() => syncRecords())
      .then((pulled) => { if (!guest || pulled) apply(); });
  }, [today]);

  useEffect(reload, [reload]);

  const empty = useMemo(
    () => Boolean(data) && Object.keys(data!.journal).length === 0 && data!.memos.length === 0 && data!.goals.length === 0 && data!.schedule.length === 0,
    [data]
  );

  const call = async (mode: Mode) => {
    if (!data) return;
    if (!confirmAiProcessing()) return;
    setLoading(mode);
    setError(null);
    try {
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

  if (!data) return <TopBar title="오늘의 나" eyebrow={fmtDate(today)} />;

  const d = briefing?.data;
  /** 오늘 기록 현황: 다 채우면 버튼 대신 문구 */
  const total = orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder()).length;
  const filled = Object.keys(data.journal[today] ?? {}).length;
  const didCount = data.log[today]?.did.length ?? 0;
  const days = streak(data.journal);
  const logDone = filled >= total && total > 0;
  const dirLabel = { up: "▲ 올라오는 중", flat: "→ 유지 중", down: "▼ 내려간 날" } as const;
  const crisis = briefing?.crisis || moments.praise?.crisis || moments.love?.crisis || review?.crisis;
  const openMoment = open ? moments[open] : undefined;

  return (
    <>
      <TopBar
        title="오늘의 나"
        eyebrow={fmtDate(today)}
        right={
          <Link href="/me" className={`account-btn ${me ? "on" : ""}`} aria-label={me ? me.nick : "나"}>
            {me ? me.nick.slice(0, 1) : <IconUser style={{ width: 18, height: 18 }} />}
          </Link>
        }
      />
      <div className="screen home">
        <div className="ambient" aria-hidden="true" />

        {/* 히어로 */}
        {empty ? (
          <section className="hero">
            <div className="label">시작</div>
            <h2>위치가 아니라, 변화를 기록해요</h2>
          </section>
        ) : loading === "briefing" ? (
          <section className="hero" aria-busy="true">
            <div className="skeleton" style={{ height: 22, width: "70%", margin: "4px 0 12px", background: "rgba(255,255,255,0.25)" }} />
            <div className="skeleton" style={{ height: 14, width: "100%", background: "rgba(255,255,255,0.2)" }} />
            <div className="skeleton" style={{ height: 14, width: "60%", marginTop: 8, background: "rgba(255,255,255,0.2)" }} />
          </section>
        ) : d ? (
          <section className="hero">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">{dirLabel[d.momentum.direction]}</span>
              <span className="label">{fmtRelative(briefing!.generatedAt)}</span>
            </div>
            <h2>{d.headline}</h2>
            <p>{d.momentum.text}</p>
          </section>
        ) : (
          <section className="hero">
            <div className="label">오늘</div>
            <h2>어제보다 어디로 움직였을까요</h2>
          </section>
        )}

        {/* 오늘 기록 현황: 채우기 전엔 버튼, 다 채우면 문구만 */}
        {logDone ? (
          <p className="log-done">
            <b>고생했어요, 오늘도 화이팅</b>
            <small>연속 {days}일째 · 기분 {filled}/{total}{didCount ? ` · 행동 ${didCount}개` : ""}</small>
          </p>
        ) : (
          <Link href="/log" className="card log-cta">
            <span>
              <b>오늘 기록을 채워주세요</b>
              <small>{days > 0 ? `연속 ${days}일째 · ` : ""}기분 {filled}/{total}{didCount ? ` · 행동 ${didCount}개` : ""}</small>
            </span>
            <IconChevronR />
          </Link>
        )}

        {/* 액션 4개 */}
        {!empty && (
          <div className="actions-row">
            <button className={`action ${briefing ? "done" : ""} ${loading === "briefing" ? "busy" : ""}`} disabled={loading !== null || Boolean(briefing)} onClick={() => press("briefing")} aria-label="오늘의 나 정리" title={briefing ? "오늘 정리 완료 · 하루 한 번" : undefined}>
              <span className="ring">{briefing ? <IconCheck /> : <IconSparkle />}</span>
              <span className="lbl">{briefing ? "정리됨" : "정리하기"}</span>
            </button>
            {(Object.keys(MOMENTS) as MomentMode[]).map((mode) => (
              <button
                key={mode}
                className={`action ${open === mode ? "on" : ""} ${moments[mode] ? "done" : ""} ${loading === mode ? "busy" : ""}`}
                disabled={loading !== null}
                onClick={() => press(mode)}
                aria-pressed={open === mode}
                aria-label={MOMENTS[mode].heading}
              >
                <span className="ring">{MOMENTS[mode].emoji}</span>
                <span className="lbl">{MOMENTS[mode].label}</span>
              </button>
            ))}
            <button className={`action ${reviewOpen ? "on" : ""} ${review ? "done" : ""} ${loading === "review" ? "busy" : ""}`} disabled={loading !== null} onClick={() => press("review")} aria-pressed={reviewOpen} aria-label="메모로 나를 분석">
              <span className="ring"><IconNote /></span>
              <span className="lbl">분석하기</span>
            </button>
          </div>
        )}

        {error && <p className="tiny" style={{ color: "var(--down)", margin: "10px 2px 0", textAlign: "center" }}>{error}</p>}
        {!empty && <p className="tiny muted" style={{ textAlign: "center" }}>AI 응답은 의료 진단·치료가 아닙니다. <Link href="/privacy">개인정보 안내</Link></p>}
        {(briefing || openMoment || review) && <SafetyReport kind="ai" />}
        {crisis && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}

        {/* 칭찬 / 사랑 */}
        {(loading === "praise" || loading === "love") && <Skeleton />}
        {open && openMoment && !loading && (
          <section className="card moment" style={{ marginTop: 12 }}>
            <div className="head">
              <span className="label">{MOMENTS[open].emoji} {MOMENTS[open].heading}</span>
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
              <Link href="/memo" className="text-btn" style={{ marginLeft: "auto" }}>되돌아보기 →</Link>
            </div>
          </section>
        )}

        {/* 브리핑 본문 */}
        {d && !open && !reviewOpen && (
          <>
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
