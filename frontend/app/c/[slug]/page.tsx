"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CommunityStore, Target, api, fetchCommunity } from "@/lib/community";
import {
  CircleDetail, JOIN_MODE_LABEL, confirmVerify, fetchCircle, joinCircle, kindLabel, leaveCircle, setPrimaryCircle, startVerify, toggleCircleFollow,
} from "@/lib/circles";
import CirclePosts, { circlePostsOf } from "@/components/CirclePosts";
import { SampleTag, Verified, circleInitial } from "@/components/CircleRow";
import { LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import { ConfirmSheet, Empty, Sheet, SkeletonList, TopBar } from "@/components/ui";
import { IconChevronL, IconLeaf, IconLock, IconMegaphone, IconMore, IconPen, IconShare, IconShield } from "@/components/Icons";
import { showToast } from "@/lib/toast";
import styles from "../circle.module.css";

/** 소로우 하나: 소개·공지, 가입(누구나/승인/초대 코드/소속 메일 인증), 리스닝, 사연 보내기, '#번호' 사연 목록 */
export default function CirclePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [c, setC] = useState<CircleDetail | null>(null);
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const locked = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [detail, store] = await Promise.all([fetchCircle(slug), fetchCommunity(true)]);
      setC(detail);
      setS(store);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<CircleDetail>, done?: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const next = await fn();
      setC(next);
      if (done) showToast(done);
      setS(await fetchCommunity(true));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "잠시 후 다시 시도해요");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const posts = useMemo(() => (s && c ? circlePostsOf(s, new Set([c.id])) : []), [s, c]);
  const back = <button className="icon-btn" onClick={() => (history.length > 1 ? router.back() : router.push("/c/home"))} aria-label="뒤로"><IconChevronL /></button>;

  if (loadError) return <><TopBar title="소로우" right={back} /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!c || !s) return <><TopBar title="소로우" right={back} /><div className="screen" role="status" aria-label="소로우를 불러오고 있어요"><SkeletonList count={3} lines={2} /></div></>;

  const member = c.me.status === "active";
  const waiting = c.me.status === "pending";
  const share = async () => {
    const url = `${location.origin}/c/${c.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: c.name, url });
      else { await navigator.clipboard.writeText(url); showToast("주소를 복사했어요"); }
    } catch { /* 공유 취소 */ }
  };

  return (
    <>
      <TopBar
        title={c.name}
        right={
          <div style={{ display: "flex" }}>
            <button className="icon-btn" onClick={share} aria-label="소로우 주소 공유"><IconShare /></button>
            {c.me.role && <button className="icon-btn" onClick={() => setMore(true)} aria-label="더보기"><IconMore /></button>}
            {back}
          </div>
        }
      />
      <div className={`screen ${styles.list}`}>
        <section className={styles.hero} aria-label="소로우 소개">
          <div className={styles.heroTop}>
            <span className={styles.mark} aria-hidden="true">{circleInitial(c.name)}</span>
            <div style={{ minWidth: 0 }}>
              <h2>{c.name}{c.verified && <Verified />}{c.sample && <SampleTag />}</h2>
              <p className={styles.meta}>
                {kindLabel(c.kind)} · 멤버 {c.memberCount}명 · 리스너 {c.listenerCount}명 · 사연 {c.postCount}개
              </p>
            </div>
          </div>
          {c.intro && <p className={styles.intro}>{c.intro}</p>}
          {c.notice && <p className={styles.notice}><IconMegaphone aria-hidden="true" />{c.notice}</p>}

          <div className={styles.actions}>
            {member ? (
              <Link href={`/c/${c.slug}/submit`} className="btn"><IconPen />사연 보내기</Link>
            ) : waiting ? (
              <button className="btn ghost" disabled>승인 기다리는 중</button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => (c.joinMode === "open" ? act(() => joinCircle(c.slug), "멤버가 됐어요") : setJoinOpen(true))}>
                {c.joinMode === "domain" ? "소속 인증하고 가입" : c.joinMode === "approve" ? "가입 신청" : c.joinMode === "invite" ? "초대 코드로 가입" : "가입하기"}
              </button>
            )}
            {!member && (
              <button className={`btn ${c.me.listening ? "ghost" : "soft"}`} disabled={busy} aria-pressed={c.me.listening}
                onClick={() => act(() => toggleCircleFollow(c.slug), c.me.listening ? "리스닝을 그만했어요" : "이제 이 소로우의 사연이 내 소로우에 보여요")}>
                {c.me.listening ? "리스닝 중" : "리스닝"}
              </button>
            )}
            {c.me.keeper && (
              <Link href={`/c/${c.slug}/admin`} className="btn ghost">
                <IconShield />소로우지기{(c.pendingCount ?? 0) + (c.waitingMembers ?? 0) > 0 ? ` · ${(c.pendingCount ?? 0) + (c.waitingMembers ?? 0)}` : ""}
              </Link>
            )}
          </div>
        </section>

        <div className={styles.band} aria-hidden="true" />

        {!c.me.canRead ? (
          <div className={styles.locked}>
            <IconLock aria-hidden="true" />
            <b>멤버에게만 사연이 보이는 소로우예요</b>
            {JOIN_MODE_LABEL[c.joinMode]}으로 멤버가 되면 읽을 수 있어요.
          </div>
        ) : posts.length === 0 ? (
          <Empty icon={<IconLeaf />} title="아직 올라온 사연이 없어요">
            {member ? "첫 사연을 보내 보세요. 소로우지기가 다듬어 #1로 올려 줘요." : "멤버들이 보낸 사연이 소로우지기의 검토를 거쳐 여기에 올라와요."}
          </Empty>
        ) : (
          <div className={styles.edge}>
            <CirclePosts s={s} posts={posts} onChange={setS} onMenu={(id) => setMenu({ kind: "post", id })} showCircle={false} />
          </div>
        )}
      </div>

      <JoinSheet open={joinOpen} c={c} onClose={() => setJoinOpen(false)} onJoined={(next) => { setC(next); setJoinOpen(false); fetchCommunity(true).then(setS).catch(() => {}); }} />

      <Sheet open={more} onClose={() => setMore(false)} title={c.name}>
        <div className="stack">
          {member && !c.me.primary && (
            <button className="btn ghost" disabled={busy} onClick={() => { setMore(false); act(() => setPrimaryCircle(c.slug), "대표 소로우로 정했어요"); }}>대표 소로우로 정하기</button>
          )}
          {member && <button className={`btn ghost`} disabled={busy} onClick={() => { setMore(false); act(() => toggleCircleFollow(c.slug)); }}>{c.me.listening ? "리스닝 그만하기" : "리스닝하기"}</button>}
          {c.me.role !== "owner" && <button className="btn ghost danger" onClick={() => { setMore(false); setLeaving(true); }}>{waiting ? "가입 신청 취소" : "소로우 나가기"}</button>}
          <button className="btn ghost" onClick={() => setMore(false)}>닫기</button>
        </div>
      </Sheet>
      <ConfirmSheet
        open={leaving}
        title={waiting ? "가입 신청을 취소할까요?" : `${c.name}에서 나갈까요?`}
        confirmLabel={waiting ? "신청 취소" : "나가기"}
        danger
        onClose={() => setLeaving(false)}
        onConfirm={() => { setLeaving(false); act(() => leaveCircle(c.slug), waiting ? "신청을 취소했어요" : "소로우에서 나왔어요"); }}
        message="이미 올라간 사연은 그대로 남아요. 보낸 사람은 여전히 드러나지 않아요."
      />

      <TargetMenuSheet s={s} target={menu} onClose={() => setMenu(null)} onChange={setS} onReport={(t) => setReporting(t)} />
      <ReportSheet
        key={reporting ? `report-${reporting.id}` : "report-closed"}
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        onSubmit={async (reason) => {
          const t = reporting;
          setReporting(null);
          if (t) await run(setS, () => api.report(t, reason));
        }}
      />
    </>
  );
}

/** 가입: 승인 신청 / 초대 코드 / 소속 메일 인증 (메일 → 6자리 코드) */
function JoinSheet({ open, c, onClose, onJoined }: { open: boolean; c: CircleDetail; onClose: () => void; onJoined: (c: CircleDetail) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "잠시 후 다시 시도해요"); } finally { setBusy(false); }
  };
  const title = c.joinMode === "domain" ? "소속 메일로 인증" : c.joinMode === "invite" ? "초대 코드로 가입" : "가입 신청";
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="stack">
        {c.joinMode === "domain" ? (
          !sent ? (
            <>
              <p className={styles.sub} style={{ margin: 0 }}>@{c.domain} 메일로 6자리 코드를 보내요. 메일 주소는 저장하지 않고, 소속 확인에만 써요. 소로우지기도 내가 누구인지 알 수 없어요.</p>
              <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`이름@${c.domain}`} aria-label="소속 메일" />
              <button className="btn block" disabled={busy || !email.includes("@")} onClick={() => go(async () => { setSent(await startVerify(c.slug, email)); })}>{busy ? "보내는 중…" : "인증 코드 받기"}</button>
            </>
          ) : (
            <>
              <p className={styles.sub} style={{ margin: 0 }}>{email} 로 보낸 6자리 코드를 10분 안에 입력해 주세요.</p>
              {sent.devCode && <p className={styles.devCode}>개발 환경이라 메일 대신 여기 보여요 · <b>{sent.devCode}</b></p>}
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label="인증 코드" />
              <button className="btn block" disabled={busy || code.length !== 6} onClick={() => go(async () => { onJoined(await confirmVerify(c.slug, code)); showToast("인증을 마쳤어요. 이제 멤버예요"); })}>{busy ? "확인하는 중…" : "인증하기"}</button>
              <button className="btn ghost block" disabled={busy} onClick={() => { setSent(null); setCode(""); }}>메일 다시 입력</button>
            </>
          )
        ) : c.joinMode === "invite" ? (
          <>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={16} placeholder="초대 코드" aria-label="초대 코드" autoCapitalize="characters" />
            <button className="btn block" disabled={busy || !code.trim()} onClick={() => go(async () => { onJoined(await joinCircle(c.slug, code)); showToast("멤버가 됐어요"); })}>가입하기</button>
          </>
        ) : (
          <>
            <p className={styles.sub} style={{ margin: 0 }}>소로우지기가 승인하면 멤버가 돼요.</p>
            <button className="btn block" disabled={busy} onClick={() => go(async () => { onJoined(await joinCircle(c.slug)); showToast("가입을 신청했어요"); })}>가입 신청하기</button>
          </>
        )}
        {error && <div className="notice warn" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
