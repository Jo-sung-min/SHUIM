"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchMe } from "@/lib/auth";
import { SESSION_KEY } from "@/lib/storage";
import { fetchPoints, pointReason, pointsSessionChanged, type PointsWallet as Wallet } from "@/lib/points";
import { IconChevronL, IconChevronR, IconCoin, IconHeart, IconMessage, IconSparkle, IconRefresh, IconCheck } from "./Icons";
import { Empty, LoadError, SkeletonCard, TopBar } from "./ui";
import FireworkTicketSheet from "./FireworkTicketSheet";
import styles from "./PointsWallet.module.css";

function useWallet(expectedUserId?: string) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [guest, setGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setWallet(null);
    setError(null);
    setGuest(false);
    setLoading(true);
    try {
      const me = await fetchMe(true);
      if (current !== request.current) return;
      if (!me.configured) throw new Error("연결을 확인한 뒤 다시 시도해 주세요.");
      if (!me.user) { setGuest(true); return; }
      if (expectedUserId && me.user.id !== expectedUserId) throw new Error("계정이 변경되었어요. 내 공간을 다시 열어 주세요.");
      const next = await fetchPoints(me.user.id, abort.signal);
      if (current === request.current) setWallet(next);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : "연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [expectedUserId]);
  useEffect(() => {
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const storage = (event: StorageEvent) => {
      if (event.key === null || (event.key === SESSION_KEY && pointsSessionChanged(event.oldValue, event.newValue))) void refresh();
    };
    window.addEventListener("focus", visible);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => {
      ++request.current;
      controller.current?.abort();
      window.removeEventListener("focus", visible);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return { wallet, guest, loading, error, refresh };
}

export function PointsCard({ userId }: { userId: string }) {
  const { wallet, guest, loading, error, refresh } = useWallet(userId);
  return <section className={styles.card} aria-label="내 온기 포인트">
    <Link href="/points" className={styles.cardLink}>
      <IconCoin className={styles.cardIcon} />
      <span className={styles.cardText}><small>온기 포인트</small><span className={styles.cardBalance}>{loading ? "확인 중…" : wallet ? `${wallet.balance.toLocaleString("ko-KR")} P` : "내역 보기"}</span></span>
    </Link>
    {(error || guest) && <div className={styles.cardError}><p>{guest ? "로그인 후 포인트를 확인해요." : "포인트를 불러오지 못했어요."}</p><button type="button" className="text-btn muted" onClick={() => void refresh()}>다시 확인</button></div>}
  </section>;
}

const date = (timestamp: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);

export default function PointsWallet() {
  const { wallet, guest, loading, error, refresh } = useWallet();
  const [ticketOpen, setTicketOpen] = useState(false);
  return <>
    <TopBar title="온기 포인트" right={<>
      <button type="button" className="icon-btn" aria-label="포인트 새로고침" title="새로고침" disabled={loading} aria-busy={loading} onClick={() => void refresh()}><IconRefresh /></button>
      <Link href="/me" className="icon-btn" aria-label="내 공간으로"><IconChevronL /></Link>
    </>} />
    <main className={`screen ${styles.page}`}>
      {loading ? <div role="status" aria-label="온기 포인트를 불러오고 있어요"><SkeletonCard lines={4} /></div>
        : error ? <LoadError message={error} onRetry={() => void refresh()} />
        : guest ? <Empty title="나눈 온기를 모아 보세요" action={<Link href="/auth?next=points" className="btn">로그인하기</Link>}>로그인하면 위로 활동으로 포인트를 쌓을 수 있어요.</Empty>
        : wallet && <>
          <section className={styles.balance} aria-label="포인트 잔액">
            <p className={styles.balanceLabel}>보유 포인트</p>
            <p className={styles.amount}>{wallet.balance.toLocaleString("ko-KR")}<span>P</span></p>
            <p className={styles.description}>따뜻한 위로로 모은 포인트예요.</p>
            <dl className={styles.today}>
              <div><dt>오늘 적립</dt><dd>{wallet.todayEarned.toLocaleString("ko-KR")} <span>/ {wallet.dailyLimit} P</span></dd></div>
              <div><dt>위로 작성 적립</dt><dd>{wallet.writingEarnedToday} <span>/ {wallet.writingDailyLimit}회</span></dd></div>
            </dl>
            <progress aria-label="오늘 포인트 적립량" value={wallet.todayEarned} max={wallet.dailyLimit} />
            <p className={styles.reset}>적립 한도는 매일 한국 시간 0시에 새로 시작해요.</p>
          </section>

          <section className={styles.section} aria-labelledby="points-ways">
            <h2 id="points-ways">포인트 모으는 방법</h2>
            <ul className={styles.ways}>
              <li><div className={styles.wayHeading}><IconMessage /><h3>위로 남기기</h3><b>+10 P</b></div><p>다른 사람의 글에 공백 제외 20자 이상의 위로를 남겨요. 글마다 한 번, 하루 최대 3회 적립해요.</p></li>
              <li><div className={styles.wayHeading}><IconCheck /><h3>위로 채택받기</h3><b>+50 P</b></div><p>외침 글쓴이가 내 위로 댓글을 채택하면 적립해요.</p></li>
              <li><div className={styles.wayHeading}><IconHeart /><h3>힘내요 받기</h3></div><p>내 위로 댓글·위로글에 모인 힘내요 수에 따라 단계마다 한 번씩 적립해요.</p><dl className={styles.milestones}>{[[5, 10], [15, 20], [30, 30]].map(([count, points]) => <div key={count}><dt>{count}개</dt><dd>+{points} P</dd></div>)}</dl></li>
            </ul>
            <details className={styles.rules}><summary>자세한 적립 기준<IconChevronR /></summary><ul>{wallet.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ul></details>
          </section>

          <aside className={styles.future}><IconSparkle /><div><h2>폭죽 이용권으로 바꿀 수 있어요</h2><p>1,000 P 로 폭죽 이용권 1장. 바닷가·유우니·대나무숲·봄물 정원에서 불꽃놀이를 한 번 쏠 수 있어요.</p>
            <button type="button" className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setTicketOpen(true)}>이용권으로 바꾸기</button></div></aside>
          <FireworkTicketSheet open={ticketOpen} loginNext="points" onClose={() => setTicketOpen(false)} onTickets={() => { if (ticketOpen) void refresh(); }} />

          <section className={styles.section} aria-labelledby="points-history">
            <div className={styles.sectionHead}><h2 id="points-history">적립 내역</h2><span>최근 30건</span></div>
            {wallet.history.length === 0 ? <p className={styles.empty}>아직 모인 온기가 없어요.<br />누군가에게 따뜻한 한마디를 건네 볼까요?</p>
              : <ul className={styles.history}>{wallet.history.map((entry) => <li key={entry.id}>
                <div><strong>{pointReason(entry.reason)}</strong>{entry.amount === 0 && <small>일일 적립 한도 · 미적립</small>}<time dateTime={new Date(entry.createdAt).toISOString()}>{date(entry.createdAt)}</time></div>
                <div className={styles.entryAmount} data-zero={entry.amount === 0 || undefined}><b>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString("ko-KR")} P</b><small>잔액 {entry.balanceAfter.toLocaleString("ko-KR")} P</small></div>
              </li>)}</ul>}
          </section>
        </>}
    </main>
  </>;
}
