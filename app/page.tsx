"use client";

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
  clearAll,
  clearBriefing,
  loadBriefing,
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
  seedSampleData,
  streak,
  todayKey,
} from "@/lib/storage";
import { Account, currentUser } from "@/lib/auth";
import HelpBanner from "@/components/HelpBanner";
import { TopBar, fmtDate, fmtRelative } from "@/components/ui";
import { IconChevronR, IconNote, IconRefresh, IconSparkle } from "@/components/Icons";

interface Data {
  journal: Journal;
  log: LogBook;
  memos: Memo[];
  goals: Goal[];
  schedule: ScheduleItem[];
}

const MOMENTS: Record<MomentMode, { emoji: string; label: string; sub: string; heading: string }> = {
  praise: { emoji: "🌟", label: "나를 칭찬하기", sub: "기록에서 잘한 걸 찾아줘요", heading: "오늘의 칭찬" },
  love: { emoji: "💗", label: "나를 사랑하기", sub: "오늘 나를 아끼는 방법", heading: "오늘 나를 사랑하는 법" },
};

/** API로 보낼 재료: 최근 기록, 오늘 한 일, 메모, 목표, 일정 */
function buildPayload(data: Data, today: string) {
  const recentKeys = Object.keys(data.journal)
    .filter((k) => k < today && k >= addDays(today, -7))
    .sort();
  return {
    date: today,
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
  const [loading, setLoading] = useState<"briefing" | MomentMode | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setMe(currentUser());
    setData({ journal: loadJournal(), log: loadLog(), memos: loadMemos(), goals: loadGoals(), schedule: loadSchedule() });
    const b = loadBriefing();
    setBriefing(b && b.date === today ? b : null);
    const m = loadMoments();
    setMoments({ praise: m.praise?.date === today ? m.praise : undefined, love: m.love?.date === today ? m.love : undefined });
    const r = loadReview();
    setReview(r && r.date === today ? r : null);
    setReviewOpen(Boolean(r && r.date === today));
  }, [today]);

  useEffect(reload, [reload]);

  const stats = useMemo(() => {
    if (!data) return null;
    const todaySched = data.schedule.filter((s) => s.date === today);
    return {
      streak: streak(data.journal),
      recordedToday: Boolean(data.journal[today]),
      schedToday: todaySched.length,
      schedLeft: todaySched.filter((s) => !s.done).length,
      goals: data.goals.filter((g) => !g.doneAt).length,
      empty:
        Object.keys(data.journal).length === 0 && data.memos.length === 0 && data.goals.length === 0 && data.schedule.length === 0,
    };
  }, [data, today]);

  const call = async (mode: "briefing" | MomentMode | "review") => {
    if (!data) return;
    setLoading(mode);
    setError(null);
    try {
      const payload = buildPayload(data, today);
      // 점검 모드: 메모 전체를 날짜와 함께 (오래된 순)
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
      if (mode === "briefing") {
        const b: Briefing = { date: today, generatedAt: Date.now(), source: json.source, crisis: json.crisis, data: json.briefing };
        saveBriefing(b);
        setBriefing(b);
      } else if (mode === "review") {
        const r: Review = { date: today, generatedAt: Date.now(), source: json.source, crisis: json.crisis, data: json.review };
        saveReview(r);
        setReview(r);
        setReviewOpen(true);
      } else {
        const m: Moment = { date: today, mode, generatedAt: Date.now(), source: json.source, crisis: json.crisis, data: json.moment };
        saveMoment(m);
        setMoments((cur) => ({ ...cur, [mode]: m }));
        setOpen(mode);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "정리하지 못했어요");
    } finally {
      setLoading(null);
    }
  };

  const pressMoment = (mode: MomentMode) => {
    if (loading) return;
    if (moments[mode]) setOpen((cur) => (cur === mode ? null : mode));
    else call(mode);
  };

  const fillSample = () => {
    seedSampleData();
    reload();
  };
  const wipe = () => {
    if (!window.confirm("모든 기록·메모·목표·일정을 지울까요? 되돌릴 수 없어요.")) return;
    clearAll();
    reload();
  };

  if (!data || !stats) return <TopBar title="오늘의 나" eyebrow={fmtDate(today)} />;

  const d = briefing?.data;
  const dirLabel = { up: "▲ 올라오는 중", flat: "→ 유지 중", down: "▼ 내려간 날" } as const;
  const crisis = briefing?.crisis || moments.praise?.crisis || moments.love?.crisis;
  const openMoment = open ? moments[open] : undefined;

  return (
    <>
      <TopBar
        title="오늘의 나"
        eyebrow={fmtDate(today)}
        right={
          <>
            {briefing && !loading && (
              <button className="icon-btn" aria-label="다시 정리" title="다시 정리" onClick={() => { clearBriefing(); call("briefing"); }}>
                <IconRefresh />
              </button>
            )}
            <Link href="/auth" className={`account-btn ${me ? "on" : ""}`} aria-label={me ? "내 계정" : "로그인"}>
              {me ? me.nick.slice(0, 1) : "로그인"}
            </Link>
          </>
        }
      />
      <div className="screen home">
        <div className="ambient" aria-hidden="true" />
        {stats.empty ? (
          <section className="hero">
            <div className="label">시작하기</div>
            <h2>위치가 아니라, 변화를 기록해요</h2>
            <p>
              기록 탭에서 오늘 한 일과 기분을 남기고, 메모·목표·일정을 채워두면 이 화면이 매일 아침 그걸 모아 오늘의 방향을 정리해 줘요.
            </p>
            <button className="btn" onClick={fillSample}>샘플 데이터로 둘러보기</button>
          </section>
        ) : loading === "briefing" ? (
          <section className="hero" aria-busy="true">
            <div className="label">정리하는 중…</div>
            <div className="skeleton" style={{ height: 24, width: "80%", margin: "10px 0 12px", background: "rgba(255,255,255,0.25)" }} />
            <div className="skeleton" style={{ height: 14, width: "100%", background: "rgba(255,255,255,0.2)" }} />
            <div className="skeleton" style={{ height: 14, width: "70%", marginTop: 8, background: "rgba(255,255,255,0.2)" }} />
          </section>
        ) : d ? (
          <section className="hero">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">{dirLabel[d.momentum.direction]}</span>
              <span className="label">{fmtRelative(briefing!.generatedAt)} 정리</span>
            </div>
            <h2>{d.headline}</h2>
            <p>{d.momentum.text}</p>
          </section>
        ) : (
          <section className="hero">
            <div className="label">하루 한 번</div>
            <h2>오늘의 나를 정리해 볼까요</h2>
            <p>최근 기록과 메모, 목표, 오늘 일정을 모아서 어제보다 어디로 움직였는지, 오늘 어디로 한 걸음 갈 수 있는지 정리해 드려요.</p>
            <button className="btn" onClick={() => call("briefing")} disabled={loading !== null}>
              <IconSparkle style={{ width: 18, height: 18 }} /> 오늘의 나 정리하기
            </button>
          </section>
        )}

        {!stats.empty && (
          <div className="moment-btns">
            {(Object.keys(MOMENTS) as MomentMode[]).map((mode) => {
              const m = MOMENTS[mode];
              const busy = loading === mode;
              return (
                <button
                  key={mode}
                  className={`moment-btn ${open === mode ? "on" : ""}`}
                  onClick={() => pressMoment(mode)}
                  disabled={loading !== null}
                  aria-pressed={open === mode}
                >
                  <span className="emoji">{m.emoji}</span>
                  <b>{m.label}</b>
                  <small>{busy ? "기록을 읽는 중…" : moments[mode] ? (open === mode ? "접기" : "다시 보기") : m.sub}</small>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="tiny" style={{ color: "var(--down)", margin: "10px 2px 0" }}>{error}</p>}

        {crisis && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}

        {(loading === "praise" || loading === "love") && (
          <section className="card moment" style={{ marginTop: 10 }} aria-busy="true">
            <div className="head"><span className="label">{MOMENTS[loading].heading}</span></div>
            <div className="skeleton" style={{ height: 20, width: "75%", marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 14, width: "100%" }} />
            <div className="skeleton" style={{ height: 14, width: "92%", marginTop: 8 }} />
            <div className="skeleton" style={{ height: 14, width: "60%", marginTop: 8 }} />
          </section>
        )}

        {open && openMoment && !loading && (
          <section className="card moment" style={{ marginTop: 10 }}>
            <div className="head">
              <span className="label">{MOMENTS[open].emoji} {MOMENTS[open].heading}</span>
              <span className="row" style={{ gap: 6 }}>
                <span className="tiny muted">{fmtRelative(openMoment.generatedAt)}</span>
                <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="다시 받기" title="다시 받기" onClick={() => call(open)}>
                  <IconRefresh style={{ width: 16, height: 16 }} />
                </button>
              </span>
            </div>
            <h3>{openMoment.data.title}</h3>
            <ul className="brief-list">
              {openMoment.data.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {openMoment.data.closing && <p className="closing">{openMoment.data.closing}</p>}
            <div style={{ marginTop: 10 }}>
              <span className={`badge ${openMoment.source === "ai" ? "" : "gray"}`}>{openMoment.source === "ai" ? "AI" : "간단 버전 · API 키 없음"}</span>
            </div>
          </section>
        )}

        {/* 메모로 나를 점검하기 */}
        {!stats.empty && (
          <>
            <button
              className={`card review-btn ${reviewOpen && review ? "on" : ""}`}
              style={{ marginTop: 10 }}
              disabled={loading !== null}
              onClick={() => {
                if (loading) return;
                if (review) setReviewOpen((v) => !v);
                else call("review");
              }}
            >
              <span className="ico"><IconNote /></span>
              <span className="grow" style={{ textAlign: "left" }}>
                <b>메모로 나를 점검하기</b>
                <small>
                  {loading === "review"
                    ? `메모 ${data.memos.length}개를 읽는 중…`
                    : review
                    ? reviewOpen
                      ? "접기"
                      : "다시 보기"
                    : `메모 ${data.memos.length}개 전체를 읽고, 예전 다짐과 오늘을 대조해요`}
                </small>
              </span>
              <IconChevronR style={{ width: 18, height: 18, color: "var(--text-3)", transform: reviewOpen && review ? "rotate(90deg)" : "none" }} />
            </button>

            {loading === "review" && (
              <section className="card" style={{ marginTop: 10 }} aria-busy="true">
                <div className="skeleton" style={{ height: 20, width: "70%", marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 14, width: "100%" }} />
                <div className="skeleton" style={{ height: 14, width: "88%", marginTop: 8 }} />
                <div className="skeleton" style={{ height: 14, width: "55%", marginTop: 8 }} />
              </section>
            )}

            {reviewOpen && review && loading !== "review" && (
              <section className="card review" style={{ marginTop: 10 }}>
                <div className="head">
                  <span className="label">그때의 나 → 오늘의 나</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="tiny muted">{fmtRelative(review.generatedAt)}</span>
                    <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="다시 점검" title="다시 점검" onClick={() => call("review")}>
                      <IconRefresh style={{ width: 16, height: 16 }} />
                    </button>
                  </span>
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

                {review.data.question && (
                  <p className="closing">{review.data.question}</p>
                )}
                <div style={{ marginTop: 10 }} className="row">
                  <span className={`badge ${review.source === "ai" ? "" : "gray"}`}>{review.source === "ai" ? "AI" : "간단 버전 · API 키 없음"}</span>
                  <Link href="/memo" className="text-btn" style={{ marginLeft: "auto" }}>메모 되돌아보기 →</Link>
                </div>
              </section>
            )}
          </>
        )}

        {!stats.empty && (
          <div className="tiles" style={{ marginTop: 12 }}>
            <div className="tile">
              <b>{stats.streak}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2 }}>일</span></b>
              <small>연속 기록</small>
            </div>
            <div className="tile">
              <b>{stats.schedLeft}<span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>/{stats.schedToday}</span></b>
              <small>오늘 남은 일정</small>
            </div>
            <div className="tile">
              <b>{stats.goals}</b>
              <small>진행 중 목표</small>
            </div>
          </div>
        )}

        {d && (
          <>
            <div className="section-title"><span>오늘의 포인트</span></div>
            <section className="card">
              <ul className="brief-list">
                {d.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </section>

            <div className="section-title"><span>오늘</span></div>
            <section className="card stack" style={{ gap: 12 }}>
              <div>
                <div className="tiny muted" style={{ fontWeight: 700, marginBottom: 2 }}>일정</div>
                <p className="brief-text">{d.today.schedule}</p>
              </div>
              <div>
                <div className="tiny muted" style={{ fontWeight: 700, marginBottom: 2 }}>목표</div>
                <p className="brief-text">{d.today.goals}</p>
              </div>
            </section>

            {d.nextStep && (
              <section className="card next-step" style={{ marginTop: 10 }}>
                <div className="label">지금 할 수 있는 한 걸음</div>
                <p>{d.nextStep}</p>
              </section>
            )}

            {d.question && (
              <>
                <div className="section-title"><span>저녁에 나에게 물어볼 것</span></div>
                <section className="card tint">
                  <p className="question">{d.question}</p>
                </section>
              </>
            )}

            <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
              <span className={`badge ${briefing!.source === "ai" ? "" : "gray"}`}>{briefing!.source === "ai" ? "AI 정리" : "간단 정리 · API 키 없음"}</span>
              <span className="tiny muted">하루 한 번이면 충분해요</span>
            </div>
          </>
        )}

        {!stats.empty && (
          <>
            <div className="section-title"><span>바로가기</span></div>
            <div className="stack">
              <Link href="/log" className="card row" style={{ padding: "14px 16px" }}>
                <span className="grow">
                  <b style={{ fontSize: 15 }}>{stats.recordedToday ? "오늘 기록 이어쓰기" : "오늘 기분 기록하기"}</b>
                  <div className="tiny muted">{stats.recordedToday ? "저녁에 한 줄 더 보태도 좋아요" : "점수 하나, 한 줄이면 충분해요"}</div>
                </span>
                <IconChevronR style={{ width: 18, height: 18, color: "var(--text-3)" }} />
              </Link>
              {stats.schedLeft > 0 && (
                <Link href="/schedule" className="card row" style={{ padding: "14px 16px" }}>
                  <span className="grow">
                    <b style={{ fontSize: 15 }}>오늘 남은 일정 {stats.schedLeft}개</b>
                    <div className="tiny muted">하나 끝내면 체크해요</div>
                  </span>
                  <IconChevronR style={{ width: 18, height: 18, color: "var(--text-3)" }} />
                </Link>
              )}
            </div>
          </>
        )}

        <HelpBanner />

        <div className="row" style={{ justifyContent: "center", gap: 14, marginTop: 20 }}>
          <button className="text-btn muted" onClick={fillSample}>샘플 데이터 채우기</button>
          <span className="tiny" style={{ color: "var(--border)" }}>|</span>
          <button className="text-btn muted" onClick={wipe}>전체 삭제</button>
        </div>
      </div>
    </>
  );
}
