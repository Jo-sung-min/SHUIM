"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { LoadError, Sheet, TopBar } from "@/components/ui";
import { IconChevronL, IconSparkle } from "@/components/Icons";
import { SponsorFrameView, VacantFrame } from "@/components/SponsorFrame";
import { fetchMe } from "@/lib/auth";
import { Sponsor, SponsorContact, cheerSponsor, fetchSponsors, fmtSponsorWon, sponsorInquiryMailto, sponsorLogoHref } from "@/lib/sponsors";
import { fetchFireworkTickets } from "@/lib/firework-tickets";
import { showToast, toastSuccess } from "@/lib/toast";
import { useBackLayer } from "@/lib/use-back-layer";
import styles from "./sponsors.module.css";

type Mine = { cheeredToday: string[]; cheersLeftToday: number };
const PODIUM = [1, 2, 3] as const;
const rankOf = (sponsor: Sponsor, index: number) => sponsor.rank || index + 1;
const count = (value: number) => value.toLocaleString("ko-KR");

/**
 * 후원 기업 순위 (누적 후원액 → 멋져요 → 먼저 등록, 서버가 매긴다).
 * 위는 1~3위 시상대(받침대 위의 액자), 아래는 4위부터 한 줄씩 — 360×740 에서 10위까지 첫 화면에 들어온다.
 * 화면의 글자는 이름과 금액뿐이고, 줄을 누르면 그 기업의 시트(큰 액자·소개·멋져요·홈페이지)가 열린다.
 * 액자는 기업이 꾸미기 링크(/sponsors/studio)로 고른 것이고, 금·은·동과 왕관은 순위가 붙인다.
 */
export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [contact, setContact] = useState<SponsorContact | null>(null);
  const [mine, setMine] = useState<Mine | null>(null); // null = 비로그인
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cheering, setCheering] = useState(false);
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
        const account = await fetchFireworkTickets();
        if (mounted.current) setMine({ cheeredToday: account.cheeredToday, cheersLeftToday: account.cheersLeftToday });
      } catch { if (mounted.current) setMine(null); } // 401(비회원)·일시 오류는 비로그인처럼 보여 준다
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "연결 실패"); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const close = () => { if (!lock.current) setOpenId(null); };
  useBackLayer(openId !== null, () => { if (lock.current) return true; setOpenId(null); return false; });

  const cheer = async (sponsor: Sponsor) => {
    if (lock.current || !mine) return;
    lock.current = true; setCheering(true);
    try {
      const result = await cheerSponsor(sponsor.id);
      if (!mounted.current) return;
      setSponsors((current) => (current ?? []).map((item) => item.id === result.sponsor.id ? { ...result.sponsor, rank: item.rank } : item));
      setMine((current) => current && { cheersLeftToday: result.cheersLeftToday, cheeredToday: [...current.cheeredToday, sponsor.id] });
      toastSuccess(`이용권 1장을 받았어요 · 폭죽 이용권 ${result.tickets}장`);
    } catch (cause) {
      if (mounted.current) showToast(cause instanceof Error ? cause.message : "멋져요를 보내지 못했어요. 잠시 후 다시 시도해 주세요.", { kind: "info" });
    } finally { lock.current = false; if (mounted.current) setCheering(false); }
  };

  const bar = <TopBar title="후원 기업" right={<Link href="/c/home" className="icon-btn" aria-label="외침으로"><IconChevronL /></Link>} />;
  if (error && !sponsors) return <>{bar}<div className="screen"><LoadError message={error} onRetry={() => void load()} /></div></>;
  if (!sponsors || !contact) return <>{bar}<Loading /></>;

  const inquiry = sponsorInquiryMailto(contact);
  const rest = sponsors.slice(3);
  const opened = sponsors.find((sponsor) => sponsor.id === openId) ?? null;
  return <>
    {bar}
    <div className={`screen ${styles.screen}`}>
      <ol className={styles.stage} aria-label="후원 순위 1위부터 3위">
        {PODIUM.map((rank) => {
          const sponsor = sponsors[rank - 1];
          return <li key={rank} className={styles.seat} data-rank={rank}>
            {sponsor ? <button type="button" className={styles.pillar} aria-haspopup="dialog" onClick={() => setOpenId(sponsor.id)}
              aria-label={`${rank}위 ${sponsor.name}, 누적 후원 ${fmtSponsorWon(sponsor.amountWon)}`}>
              <span className={styles.piece}>
                {rank === 1 && <Crown />}
                <SponsorFrameView frame={sponsor.frame} name={sponsor.name} logo={sponsorLogoHref(sponsor)} live />
              </span>
              <span className={styles.plinth}>
                <span className={styles.medal}>{rank}</span>
                <b className={styles.pname}>{sponsor.name}</b>
                <span className={styles.pamount}>{fmtSponsorWon(sponsor.amountWon)}</span>
              </span>
            </button> : <a className={styles.pillar} href={inquiry} aria-label={`${rank}위 자리 후원 문의`}>
              <span className={styles.piece}><VacantFrame /></span>
              <span className={styles.plinth}><span className={styles.medal}>{rank}</span></span>
            </a>}
          </li>;
        })}
      </ol>

      <div className={styles.board}>
        {rest.length > 0 && <ol className={styles.rows} start={4} aria-label="후원 순위 4위부터">
          {rest.map((sponsor, index) => {
            const rank = rankOf(sponsor, index + 3);
            return <li key={sponsor.id} style={{ "--i": Math.min(index, 14) } as CSSProperties}>
              <button type="button" className={styles.row} aria-haspopup="dialog" onClick={() => setOpenId(sponsor.id)}
                aria-label={`${rank}위 ${sponsor.name}, 누적 후원 ${fmtSponsorWon(sponsor.amountWon)}`}>
                <span className={styles.rank}>{rank}</span>
                <SponsorFrameView frame={sponsor.frame} name={sponsor.name} logo={sponsorLogoHref(sponsor)} />
                <span className={styles.name}>{sponsor.name}</span>
                <span className={styles.amount}>{fmtSponsorWon(sponsor.amountWon)}</span>
              </button>
            </li>;
          })}
        </ol>}
        <a className={`${styles.row} ${styles.join}`} href={inquiry}>
          <span className={styles.rank} aria-hidden="true" />
          <VacantFrame />
          <span className={styles.name}>후원 문의</span>
        </a>
      </div>
    </div>

    <Sheet open={opened !== null} onClose={close} title={opened?.name ?? "후원 기업"}>
      {opened && <SponsorCard sponsor={opened} rank={rankOf(opened, sponsors.indexOf(opened))} mine={mine} cheering={cheering} onCheer={() => void cheer(opened)} />}
    </Sheet>
  </>;
}

/** 1위의 왕관 */
function Crown() {
  return <svg className={styles.crown} viewBox="0 0 32 24" aria-hidden="true">
    <defs><linearGradient id="sponsor-crown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fdecb0" /><stop offset=".5" stopColor="#e9b63c" /><stop offset="1" stopColor="#b47612" /></linearGradient></defs>
    <path d="M3.4 18.6 1.8 6.6l7.5 5.2L16 2.6l6.7 9.2 7.5-5.2-1.6 12Z" fill="url(#sponsor-crown)" stroke="#a86f12" strokeWidth="1" strokeLinejoin="round" />
    <rect x="3.4" y="20" width="25.2" height="2.6" rx="1.3" fill="#c98f1f" />
  </svg>;
}

/** 기업 시트: 큰 액자, 소개, 숫자 셋, 홈페이지·멋져요 */
function SponsorCard({ sponsor, rank, mine, cheering, onCheer }: { sponsor: Sponsor; rank: number; mine: Mine | null; cheering: boolean; onCheer: () => void }) {
  const cheered = mine?.cheeredToday.includes(sponsor.id) ?? false;
  const soldOut = sponsor.remaining === 0;
  const exhausted = mine !== null && mine.cheersLeftToday === 0;
  let label = "멋져요";
  if (cheering) label = "보내는 중…";
  else if (cheered) label = "오늘 보냄";
  else if (soldOut) label = "모두 전해졌어요";
  else if (exhausted) label = "내일 다시";
  const ready = !cheered && !soldOut && !exhausted;
  return <>
    <div className={styles.showcase} data-rank={rank <= 3 ? rank : undefined}>
      <span className={styles.place}>{rank}위</span>
      <SponsorFrameView frame={sponsor.frame} name={sponsor.name} logo={sponsorLogoHref(sponsor)} live />
    </div>
    {sponsor.tagline && <p className={styles.tagline}>{sponsor.tagline}</p>}
    <dl className={styles.facts}>
      <div><dt>누적 후원</dt><dd>{fmtSponsorWon(sponsor.amountWon)}</dd></div>
      <div><dt>멋져요</dt><dd>{count(sponsor.cheers)}</dd></div>
      <div><dt>남은 폭죽</dt><dd>{count(sponsor.remaining)}</dd></div>
    </dl>
    {ready && <p className={styles.hint}>멋져요를 보내면 폭죽 이용권 1장을 받아요</p>}
    <div className="sheet-actions">
      {sponsor.linkUrl && <a className="btn ghost" href={sponsor.linkUrl} target="_blank" rel="noopener noreferrer sponsored">홈페이지</a>}
      {mine === null ? <Link href="/auth?next=sponsors" className="btn">로그인하고 멋져요</Link>
        : <button type="button" className={`btn ${ready ? "" : "ghost"}`} disabled={cheering || !ready} aria-busy={cheering} onClick={onCheer}>{ready && !cheering && <IconSparkle />}{label}</button>}
    </div>
  </>;
}

/** 불러오는 동안: 시상대와 줄 모양의 자리표시자 */
function Loading() {
  return <div className={`screen ${styles.screen}`} role="status" aria-label="후원 기업을 불러오고 있어요">
    <div className={`${styles.stage} ${styles.loading}`} aria-hidden="true">
      {PODIUM.map((rank) => <div key={rank} className={styles.seat} data-rank={rank}><div className={styles.pillar}><span className={`sk ${styles.skFrame}`} /><span className={styles.plinth} /></div></div>)}
    </div>
    <div className={styles.board} aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => <div key={index} className={`${styles.row} ${styles.skRow}`}><span /><span className={`sk ${styles.skThumb}`} /><span className="sk w60" /><span /></div>)}
    </div>
  </div>;
}
