"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Empty, Hero, LoadError, SkeletonList, TopBar } from "@/components/ui";
import { IconChevronL, IconSparkle, IconTrophy } from "@/components/Icons";
import { fetchMe } from "@/lib/auth";
import { Sponsor, SponsorContact, cheerSponsor, fetchSponsors, fmtSponsorWon, sponsorInquiryMailto, sponsorLogoHref } from "@/lib/sponsors";
import { FireworkTicketAccount, fetchFireworkTickets } from "@/lib/firework-tickets";
import { toastSuccess } from "@/lib/toast";
import styles from "./sponsors.module.css";

type Mine = { tickets: number; cheeredToday: string[]; cheersLeftToday: number; dailyCheers: number };
const initial = (name: string) => (name.trim().charAt(0) || "·").toUpperCase();

/**
 * 후원 기업 순위: 누적 후원액·멋져요 수로 정렬. 로그인한 회원은 멋져요를 눌러
 * 그 기업이 준비한 폭죽에서 무료 이용권 1장을 받는다 (기업당 하루 1번, 하루 최대 n장은 서버가 확정).
 */
export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [contact, setContact] = useState<SponsorContact | null>(null);
  const [mine, setMine] = useState<Mine | null>(null); // null = 비로그인
  const [error, setError] = useState<string | null>(null);
  const [cheering, setCheering] = useState<string | null>(null);
  const mounted = useRef(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, me] = await Promise.all([fetchSponsors(), fetchMe(true)]);
      if (!mounted.current) return;
      setSponsors(list.sponsors); setContact(list.contact);
      if (!me.user) { setMine(null); return; }
      try {
        const account: FireworkTicketAccount = await fetchFireworkTickets();
        if (mounted.current) setMine({ tickets: account.tickets, cheeredToday: account.cheeredToday, cheersLeftToday: account.cheersLeftToday, dailyCheers: account.dailyCheers });
      } catch { if (mounted.current) setMine(null); } // 401(비회원)·일시 오류는 비로그인처럼 보여 준다
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "연결 실패"); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const cheer = async (sponsor: Sponsor) => {
    if (lock.current || !mine) return;
    lock.current = true; setCheering(sponsor.id); setError(null);
    try {
      const result = await cheerSponsor(sponsor.id);
      if (!mounted.current) return;
      setSponsors((current) => (current ?? []).map((item) => item.id === result.sponsor.id ? { ...result.sponsor, rank: item.rank } : item));
      setMine((current) => current && { ...current, tickets: result.tickets, cheersLeftToday: result.cheersLeftToday, cheeredToday: [...current.cheeredToday, sponsor.id] });
      toastSuccess(`이용권 1장을 받았어요 · 폭죽 이용권 ${result.tickets}장`);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "멋져요를 보내지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { lock.current = false; if (mounted.current) setCheering(null); }
  };

  const back = <Link href="/c/home" className="icon-btn" aria-label="외침으로"><IconChevronL /></Link>;
  if (error && !sponsors) return <><TopBar title="후원 기업" right={back} /><div className="screen"><LoadError message={error} onRetry={() => void load()} /></div></>;
  if (!sponsors || !contact) return <><TopBar title="후원 기업" right={back} /><div className="screen" role="status" aria-label="후원 기업을 불러오고 있어요"><SkeletonList count={3} lines={2} /></div></>;

  const total = sponsors.reduce((sum, sponsor) => sum + sponsor.amountWon, 0);
  const dailyCheers = mine?.dailyCheers ?? 3;
  const exhausted = mine !== null && mine.cheersLeftToday === 0;
  return <>
    <TopBar title="후원 기업" right={back} />
    <div className="screen">
      <Hero label="기업 후원" title="소로우 사람들에게 폭죽이 전해져요" sub={`후원 기업의 멋져요를 누르면 그 기업이 준비한 폭죽에서 이용권 1장을 받아요. 기업당 하루 1번, 하루 최대 ${dailyCheers}장.`} stats={[`후원 기업 ${sponsors.length}`, `누적 후원 ${fmtSponsorWon(total)}`]} />
      {mine && <p className={styles.mine}><IconSparkle aria-hidden="true" /><span>내 폭죽 이용권 <b>{mine.tickets.toLocaleString("ko-KR")}장</b> · 오늘 멋져요 남은 횟수 <b>{mine.cheersLeftToday}</b></span><Link href="/me">내 공간</Link></p>}
      {exhausted && <p className="notice" role="status">오늘 받을 수 있는 이용권을 모두 받았어요. 내일 다시 멋져요를 보낼 수 있어요.</p>}
      {error && <p className="notice warn" role="alert">{error}</p>}

      <div className="section-title" style={{ marginTop: 16 }}><span>후원 순위</span><span className="tiny muted">누적 후원 · 멋져요</span></div>
      {sponsors.length === 0 ? <Empty icon={<IconTrophy />} title="아직 후원 기업이 없어요">첫 후원 기업이 되어 소로우 사람들에게 폭죽을 전해 보세요.</Empty>
        : <ol className={styles.list} aria-label="후원 기업 순위">
          {sponsors.map((sponsor, index) => {
            const rank = sponsor.rank || index + 1;
            const logo = sponsorLogoHref(sponsor);
            const cheered = mine?.cheeredToday.includes(sponsor.id) ?? false;
            const soldOut = sponsor.remaining === 0;
            const busy = cheering !== null;
            return <li key={sponsor.id} className={`card ${styles.row}`} data-top={rank <= 3 ? rank : undefined}>
              <span className={styles.rank} aria-label={`${rank}위`}>{rank}</span>
              <span className={styles.logo} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" /> : initial(sponsor.name)}
              </span>
              <span className={styles.body}>
                <b className={styles.name}>{sponsor.linkUrl ? <a href={sponsor.linkUrl} target="_blank" rel="noopener noreferrer sponsored">{sponsor.name}</a> : sponsor.name}</b>
                {sponsor.tagline && <span className={styles.tagline}>{sponsor.tagline}</span>}
                <span className={styles.meta}>누적 후원 {fmtSponsorWon(sponsor.amountWon)} · 멋져요 {sponsor.cheers.toLocaleString("ko-KR")} · 남은 폭죽 {sponsor.remaining.toLocaleString("ko-KR")}개</span>
              </span>
              {mine === null
                ? <Link href="/auth?next=sponsors" className="btn ghost sm">로그인하고 멋져요</Link>
                : <button type="button" className={`btn sm ${cheered || soldOut || exhausted ? "ghost" : ""}`} disabled={busy || cheered || soldOut || exhausted} aria-busy={cheering === sponsor.id} onClick={() => void cheer(sponsor)}>
                  {cheering === sponsor.id ? "보내는 중…" : cheered ? "오늘 보냄" : soldOut ? "모두 전해졌어요" : "멋져요"}
                </button>}
            </li>;
          })}
        </ol>}

      <div className={styles.inquiry}>
        <p className="tiny muted">기업 홍보 배너는 {contact.priceLabel} · 후원액 1,000원마다 폭죽 1개가 회원에게 전해져요.</p>
        <a className="btn ghost" href={sponsorInquiryMailto(contact)}>후원 문의</a>
      </div>
    </div>
  </>;
}
