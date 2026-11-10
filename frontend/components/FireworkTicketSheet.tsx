"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Sheet } from "./ui";
import { IconChevronR, IconCoin, IconLock, IconSparkle } from "./Icons";
import { buyFireworkTicket, fetchFireworkTickets, FireworkTicketError, type FireworkTicketAccount } from "@/lib/firework-tickets";
import { cheerSponsor, fetchSponsors, fmtSponsorWon, sponsorLogoHref, type Sponsor } from "@/lib/sponsors";
import { showToast, toastSuccess } from "@/lib/toast";
import { fetchMe } from "@/lib/auth";
import styles from "./FireworkTicketSheet.module.css";

type Busy = "buy" | string | null;

/**
 * "포인트를 사용할까요?" — 폭죽 이용권을 온기 포인트로 바꾸거나(위) 후원 기업 멋져요로 받는다(아래, "나를 위한 폭죽 받기").
 * 3D 공간에서는 portal 로 띄워 HUD 의 inert 와 무관하게 쓴다. 잔액은 서버 응답으로만 바꾼다.
 */
export default function FireworkTicketSheet({ open, onClose, onTickets, portal = false, loginNext = "me" }: {
  open: boolean; onClose: () => void; onTickets?: (tickets: number) => void; portal?: boolean; loginNext?: string;
}) {
  const [account, setAccount] = useState<FireworkTicketAccount | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(false);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false);
  const purchaseRef = useRef<string | null>(null);
  const request = useRef(0);
  const ticketsRef = useRef(onTickets);
  ticketsRef.current = onTickets;

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setError(null); setGuest(false);
    try {
      const [mine, list] = await Promise.all([
        fetchFireworkTickets().catch((cause: unknown) => { if (cause instanceof FireworkTicketError && cause.status === 401) return null; throw cause; }),
        fetchSponsors().then((result) => result.sponsors).catch(() => [] as Sponsor[]),
      ]);
      if (current !== request.current) return;
      setSponsors(list);
      if (!mine) { setGuest(true); setAccount(null); return; }
      setAccount(mine);
      ticketsRef.current?.(mine.tickets);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : "연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) { ++request.current; return; }
    void load();
  }, [open, load]);

  const buy = async () => {
    if (!account || busyRef.current || account.points < account.ticketPrice) return;
    busyRef.current = true; setBusy("buy"); setError(null);
    const requestId = purchaseRef.current ?? crypto.randomUUID();
    purchaseRef.current = requestId;
    try {
      const result = await buyFireworkTicket(requestId);
      purchaseRef.current = null;
      setAccount((current) => current ? { ...current, tickets: result.tickets, points: result.points } : current);
      ticketsRef.current?.(result.tickets);
      toastSuccess(`이용권 1장을 받았어요 · 폭죽 이용권 ${result.tickets}장`);
    } catch (cause) {
      // Only a definite server answer retires the request id; a dropped connection is retried with the same one.
      if (cause instanceof FireworkTicketError) purchaseRef.current = null;
      setError(cause instanceof Error ? cause.message : "구매하지 못했어요. 잠시 후 다시 시도해 주세요.");
      if (cause instanceof FireworkTicketError && cause.status === 401) setGuest(true);
    } finally {
      busyRef.current = false; setBusy(null);
    }
  };

  const cheer = async (sponsor: Sponsor) => {
    if (!account || busyRef.current) return;
    busyRef.current = true; setBusy(sponsor.id); setError(null);
    try {
      const result = await cheerSponsor(sponsor.id);
      setSponsors((list) => list.map((item) => item.id === result.sponsor.id ? result.sponsor : item));
      setAccount((current) => current ? { ...current, tickets: result.tickets, cheersLeftToday: result.cheersLeftToday, cheeredToday: [...current.cheeredToday, sponsor.id] } : current);
      ticketsRef.current?.(result.tickets);
      toastSuccess(`${sponsor.name}의 폭죽을 받았어요 · 폭죽 이용권 ${result.tickets}장`);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "멋져요를 보내지 못했어요. 잠시 후 다시 시도해 주세요.", { kind: "info" });
      void load();
    } finally {
      busyRef.current = false; setBusy(null);
    }
  };

  const sheet = <Sheet open={open} onClose={() => { if (!busyRef.current) onClose(); }} title="포인트를 사용할까요?">
    <div className={styles.body}>
      {loading && !account ? <div role="status" aria-label="폭죽 이용권을 확인하고 있어요"><div className="sk-card"><div className="sk sk-line lg w60" /><div className="sk w80" /></div></div>
        : guest ? <p className={styles.hint}>로그인하면 온기 포인트로 폭죽 이용권을 받을 수 있어요. <Link href={`/auth?next=${loginNext}`}>로그인하기</Link></p>
        : error && !account ? <><p className={styles.error} role="alert">{error}</p><button type="button" className="btn ghost sm" onClick={() => void load()}>다시 시도</button></>
        : account && <>
          <section className={styles.exchange} aria-label="온기 포인트로 바꾸기">
            <div className={styles.rate}><IconSparkle /><div><strong>폭죽 이용권 1장</strong><small>= 온기 포인트 {account.ticketPrice.toLocaleString("ko-KR")} P · 한 번 쏠 수 있어요</small></div></div>
            <dl className={styles.balances}>
              <div><dt>보유 포인트</dt><dd>{account.points.toLocaleString("ko-KR")} P</dd></div>
              <div><dt>내 이용권</dt><dd data-empty={account.tickets === 0 || undefined}>{account.tickets}장</dd></div>
            </dl>
            <button type="button" className="btn block" disabled={busy !== null || account.points < account.ticketPrice} aria-busy={busy === "buy"} onClick={() => void buy()}>
              <IconCoin />{busy === "buy" ? "바꾸는 중…" : `${account.ticketPrice.toLocaleString("ko-KR")} P로 이용권 받기`}
            </button>
            {account.points < account.ticketPrice && <p className={styles.hint}>포인트가 {(account.ticketPrice - account.points).toLocaleString("ko-KR")} P 더 필요해요. <Link href="/points">포인트 모으는 방법</Link></p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </section>

          <section className={styles.sponsors} aria-label="나를 위한 폭죽 받기">
            <h4><IconSparkle />나를 위한 폭죽 받기</h4>
            <p>후원 기업의 멋져요를 누르면 그 기업이 준비한 폭죽에서 이용권 1장을 받아요. 기업당 하루 1번, 하루 최대 {account.dailyCheers}장이에요.</p>
            <span className={styles.left}>오늘 남은 멋져요 {account.cheersLeftToday}번</span>
            {sponsors.length === 0 ? <p className={styles.empty}>아직 폭죽을 준비한 후원 기업이 없어요.</p>
              : <ul className={styles.list}>{sponsors.map((sponsor) => {
                const logo = sponsorLogoHref(sponsor);
                const cheered = account.cheeredToday.includes(sponsor.id);
                const label = cheered ? "오늘 보냄" : sponsor.remaining === 0 ? "모두 전해졌어요" : busy === sponsor.id ? "보내는 중…" : "멋져요";
                const disabled = busy !== null || cheered || sponsor.remaining === 0 || account.cheersLeftToday === 0;
                return <li key={sponsor.id} className={styles.row}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span className={styles.logo} aria-hidden="true">{logo ? <img src={logo} alt="" width={44} height={44} /> : sponsor.name.slice(0, 1)}</span>
                  <div><strong><span>{sponsor.rank}.</span>{sponsor.name}</strong><small>{sponsor.tagline || `${fmtSponsorWon(sponsor.amountWon)} 후원`} · 남은 폭죽 <b>{sponsor.remaining.toLocaleString("ko-KR")}</b>개</small></div>
                  <button type="button" className={styles.cheer} disabled={disabled} aria-busy={busy === sponsor.id} aria-label={`${sponsor.name}에게 멋져요 보내고 이용권 받기`} onClick={() => void cheer(sponsor)}>{label}</button>
                </li>;
              })}</ul>}
            <Link href="/sponsors" className={styles.more} onClick={onClose}>후원 기업 순위 보기<IconChevronR /></Link>
          </section>
        </>}
    </div>
  </Sheet>;
  if (!portal) return sheet;
  if (typeof document === "undefined" || !open) return null;
  return createPortal(<div className={styles.roomScope}>{sheet}</div>, document.body);
}

/** 마이페이지 카드: 이용권 수를 보여 주고 0장이면 자물쇠 표시. 누르면 같은 시트가 열린다. */
export function FireworkTicketCard({ userId }: { userId: string }) {
  const [tickets, setTickets] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        const me = await fetchMe();
        if (!alive || !me.user || me.user.id !== userId) return;
        const account = await fetchFireworkTickets(controller.signal);
        if (alive) setTickets(account.tickets);
      } catch (cause) {
        if (alive && !(cause instanceof DOMException && cause.name === "AbortError")) setFailed(true);
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [userId]);
  const locked = tickets === 0;
  let balance: ReactNode = "확인 중…";
  if (failed) balance = "열어 보기";
  else if (tickets !== null) balance = locked ? "잠김" : `${tickets}장`;
  return <section className={styles.card} aria-label="내 폭죽 이용권">
    <button type="button" className={styles.cardButton} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      <span className={styles.cardIcon}><IconSparkle />{locked && <span className={styles.cardLock} aria-hidden="true"><IconLock /></span>}</span>
      <span className={styles.cardText}><small>폭죽 이용권</small><span className={styles.cardBalance} data-empty={locked || undefined}>{balance}</span></span>
    </button>
    <FireworkTicketSheet open={open} onClose={() => setOpen(false)} onTickets={(next) => { setTickets(next); setFailed(false); }} />
  </section>;
}
