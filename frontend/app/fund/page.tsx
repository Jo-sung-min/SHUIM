"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CommunityStore, canGiveLight, currentWeekKey, fetchCommunity, fmtLight, lightOf, userById, weekLabel, weeklyOf } from "@/lib/community";
import { lightReason } from "@/lib/light";
import { useLight, type Light } from "@/lib/use-light";
import ShoutTabs from "@/components/ShoutTabs";
import { Empty, Hero, LoadError, SkeletonCard, SkeletonHero, SkeletonList, fmtRelative } from "@/components/ui";
import { IconLight } from "@/components/Icons";
import LightGiveSheet, { LightTarget } from "@/components/LightGiveSheet";
import { useScrollMemory } from "@/lib/scroll-memory";
import styles from "@/components/Light.module.css";

/**
 * 불행 모금: 돈이 아니라 별을 모으고 건네는 곳.
 * 하루 한 번 오늘의 별을 받고, 이번 주 불행광장 글에 건넨다. 건넨 별은 바로 글쓴이의 별이 된다.
 */
export default function FundPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<LightTarget | null>(null);
  const light = useLight();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setS(await fetchCommunity());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useScrollMemory(s !== null);

  if (loadError) return <div className="screen"><ShoutTabs /><LoadError message={loadError} onRetry={load} /></div>;
  if (!s) return <div className="screen" role="status" aria-label="별을 불러오고 있어요"><ShoutTabs /><SkeletonHero /><div style={{ height: 16 }} /><SkeletonList count={2} lines={3} head={false} /></div>;

  const cur = currentWeekKey();
  const batch = weeklyOf(s, cur);
  const rows = batch?.rows.slice(0, 10) ?? [];
  const receivers = (batch?.rows ?? []).filter((r) => lightOf(r) > 0).length;
  const gifts = (s.gifts ?? []).slice(0, 8);
  const name = (id: string) => (id === s.me.id ? "나" : userById(s, id).nick);
  const wallet = light.state.kind === "ready" ? light.state.wallet : null;

  return (
    <>
      <div className="screen">
        <ShoutTabs />
        <div style={{ height: 12 }} />
        <Hero label={`${weekLabel(cur)} · 이번 주 모인 별`} title={fmtLight(batch?.light?.total ?? 0)} stats={[`준 사람 ${batch?.light?.givers ?? 0}명`, `받은 사람 ${receivers}명`]} />

        <MyLight light={light} />

        <div className="section-title"><span>별을 기다리는 글</span><Link href="/ranking" className="link">랭킹 보기</Link></div>
        {rows.length === 0 ? (
          <Empty icon={<IconLight />} title="이번 주 불행광장 글이 아직 없어요" action={<Link href="/shout" className="btn ghost">외침 보러 가기</Link>}>
            글이 올라오면 여기서 별을 건넬 수 있어요.
          </Empty>
        ) : (
          <section className="card" style={{ padding: "4px 16px" }}>
            {rows.map((r) => {
              const giving = canGiveLight(s, s.posts.find((p) => p.id === r.topPostId));
              return (
                <div key={r.userId} className="share-row">
                  <span className="rank-no sm">{r.rank}</span>
                  <span className="grow"><b className={styles.rowName}>{r.nick}{r.userId === s.me.id ? " (나)" : ""}<small> · 힘내요 {r.cheers}</small></b></span>
                  <span className={styles.rowLight}>{fmtLight(lightOf(r))}</span>
                  {giving && <button type="button" className={`btn soft sm ${styles.give}`} aria-label={`${r.nick} 님에게 별 주기`} onClick={() => setTarget({ postId: r.topPostId, nick: r.nick })}><IconLight />주기</button>}
                </div>
              );
            })}
          </section>
        )}

        <div className="section-title"><span>최근 오간 별</span></div>
        {gifts.length === 0 ? (
          <p className={styles.quiet}>아직 오간 별이 없어요. 첫 별을 건네 볼까요.</p>
        ) : (
          <ul className={styles.list}>
            {gifts.map((g) => (
              <li key={g.id}>
                <div className={styles.listMain}>
                  <strong>{name(g.by)}<span className={styles.arrow} aria-label="님이">→</span>{name(g.to)}</strong>
                  <time dateTime={new Date(g.at).toISOString()}>{fmtRelative(g.at)}</time>
                </div>
                <span className={styles.listAmount}>{fmtLight(g.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        {wallet && wallet.history.length > 0 && (
          <>
            <div className="section-title"><span>내 별 내역</span><span className="tiny muted">최근 {wallet.history.length}건</span></div>
            <ul className={styles.list}>
              {wallet.history.map((entry) => (
                <li key={entry.id}>
                  <div className={styles.listMain}>
                    <strong>{lightReason(entry)}</strong>
                    <time dateTime={new Date(entry.createdAt).toISOString()}>{fmtRelative(entry.createdAt)}</time>
                  </div>
                  <span className={styles.listAmount} data-out={entry.amount < 0 || undefined}>{entry.amount > 0 ? "+" : "−"}{Math.abs(entry.amount).toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="section-title"><span>별은 이렇게 써요</span></div>
        <section className="card tint">
          <ul className={styles.guide}>
            <li>하루 한 번 오늘의 별(+{wallet?.dailyLight ?? 10})을 받아요.</li>
            <li>광장 글에 한 번에 {fmtLight(wallet?.maxGift ?? 10)}까지, 같은 분께는 하루 {fmtLight(wallet?.perPersonDaily ?? 10)}까지 건네요.</li>
            <li>받은 별은 다시 건넬 수 있어요. 돈으로 바꿀 수는 없어요.</li>
          </ul>
        </section>
      </div>

      <LightGiveSheet target={target} light={light} onClose={() => setTarget(null)} onGiven={setS} />
    </>
  );
}

/** 내 별: 잔액, 받은·건넨 합계, 오늘의 별 받기 */
function MyLight({ light }: { light: Light }) {
  const { state } = light;
  if (state.kind === "guest") {
    return (
      <section className={styles.mine} aria-label="내 별">
        <p className={styles.mineLabel}><IconLight />내 별</p>
        <p className={styles.mineText}>로그인하면 별을 모으고 건넬 수 있어요.</p>
        <Link href="/auth?next=fund" className="btn block">로그인하기</Link>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className={styles.mine} aria-label="내 별" role="alert">
        <p className={styles.mineLabel}><IconLight />내 별</p>
        <p className={styles.mineText}>{state.message}</p>
        <button type="button" className="btn ghost block" onClick={() => void light.refresh()}>다시 확인</button>
      </section>
    );
  }
  if (state.kind !== "ready") return <div style={{ marginTop: 16 }} role="status" aria-label="내 별을 불러오고 있어요"><SkeletonCard lines={2} /></div>;
  const { wallet } = state;
  return (
    <section className={styles.mine} aria-label="내 별">
      <p className={styles.mineLabel}><IconLight />내 별</p>
      <p className={styles.mineAmount}>{wallet.balance.toLocaleString("ko-KR")}<span>별</span></p>
      <p className={styles.mineMeta}>받은 별 {wallet.totalReceived.toLocaleString("ko-KR")} · 건넨 별 {wallet.totalGiven.toLocaleString("ko-KR")}</p>
      {wallet.dailyClaimed ? (
        <p className={styles.mineDone}>오늘의 별을 받았어요. 내일 또 받을 수 있어요.</p>
      ) : (
        <button type="button" className="btn block" disabled={light.claiming} aria-busy={light.claiming} onClick={() => void light.claim()}>
          오늘의 별 받기 +{wallet.dailyLight}
        </button>
      )}
    </section>
  );
}
