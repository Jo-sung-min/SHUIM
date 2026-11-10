"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IS_AIT } from "@/lib/ait";
import { appPath } from "@/lib/routes";
import { Sheet } from "./ui";
import { IconChevronR, IconMessage, IconPlus } from "./Icons";
import { DEFAULT_SPONSOR_CONTACT, SPONSOR_BANNER_SLOTS, bannerImageHref, fetchSponsorBanners, recordBannerClick, sponsorInquiryMailto,
  type SponsorBanner, type SponsorBannersResponse, type SponsorContact } from "@/lib/sponsors";
import styles from "./SponsorRails.module.css";

const WIDE = "(min-width: 1024px)";
const REFRESH_MS = 5 * 60_000;
/** 외침 탭 계열에서만 보인다. 앱 전체로 넓히려면 이 조건만 바꾼다. */
const shownOn = (path: string) => path === "/c" || path.startsWith("/c/") || path === "/shout" || path.startsWith("/shout/") || path === "/ranking" || path === "/fund";

/**
 * PC 폭에서 앱 기둥 양옆에 고정되는 기업 홍보 액자 열. 한쪽 4칸, 노출 순서가 홀수면 왼쪽·짝수면 오른쪽.
 * 첫 빈 칸에는 빈 액자("+")가 있어 30일 30만원 안내와 문의 메일로 이어진다. 모바일·미니앱에서는 렌더하지 않는다.
 * 액자가 많아 화면 높이를 넘으면 그림 창이 낮아지며(가로로 잘림) 한 화면에 모두 들어간다. 빈 액자가 먼저 줄어든다.
 */
export default function SponsorRails() {
  const path = appPath(usePathname());
  const shown = !IS_AIT && shownOn(path);
  const [wide, setWide] = useState(false);
  const [data, setData] = useState<(SponsorBannersResponse & { at: number }) | null>(null);
  const [inquiry, setInquiry] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(WIDE);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!shown || !wide || (data && Date.now() - data.at < REFRESH_MS)) return;
    let alive = true;
    fetchSponsorBanners()
      .then((result) => { if (alive) setData({ ...result, at: Date.now() }); })
      .catch(() => { if (alive) setData({ banners: [], contact: DEFAULT_SPONSOR_CONTACT, slotsPerSide: SPONSOR_BANNER_SLOTS, at: Date.now() }); });
    return () => { alive = false; };
  }, [shown, wide, data, path]);

  if (!shown || !wide || !data) return null;
  // 관리자가 정한 노출 순서의 홀수는 왼쪽, 짝수(0 포함)는 오른쪽 열. 한쪽에 slots 개까지.
  const slots = data.slotsPerSide;
  const left = data.banners.filter((banner) => banner.position % 2 === 1).slice(0, slots);
  const right = data.banners.filter((banner) => banner.position % 2 === 0).slice(0, slots);
  const rail = (side: "left" | "right", banners: SponsorBanner[]) => <aside className={styles.rail} data-side={side} aria-label={`후원 기업 소개 ${side === "left" ? "왼쪽" : "오른쪽"}`}>
    {banners.map((banner) => <BannerCard key={banner.id} banner={banner} />)}
    {banners.length < slots && <PlusCard contact={data.contact} onClick={() => setInquiry(true)} />}
  </aside>;
  return <>
    {rail("left", left)}
    {rail("right", right)}
    <InquirySheet open={inquiry} contact={data.contact} onClose={() => setInquiry(false)} />
  </>;
}

/** 대체 그림 색조 수. CSS 의 .art[data-tone="0..5"] 과 맞춘다. */
const TONES = 6;
const toneOf = (key: string) => Array.from(key).reduce((sum, char) => (sum * 31 + (char.codePointAt(0) ?? 0)) % 9973, 7) % TONES;
const initialOf = (title: string) => (Array.from(title.trim())[0] ?? "·").toUpperCase();

/** 바깥으로 나가는 링크 표시 (↗) */
const IconOut = () => <svg className={styles.out} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M8 16 16 8M9.5 8H16v6.5" />
</svg>;

/** 소장품 액자: 얇은 글라스 테 안에 그림이 꽉 차고, 아래 명패에 기업명과 한 줄 소개. 그림이 없으면 이름 첫 글자로 그린 추상화를 건다. */
function BannerCard({ banner }: { banner: SponsorBanner }) {
  const href = bannerImageHref(banner);
  const [brokenHref, setBrokenHref] = useState<string | null>(null);
  const image = href && href !== brokenHref ? href : null;
  // 그림이 있어도 같은 색조를 깔아 두어, 불러오는 동안 회색 빈칸 대신 은은한 바탕이 보인다
  return <a className={styles.card} href={banner.linkUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={() => recordBannerClick(banner.id)}
    aria-label={`후원 · ${banner.title}${banner.tagline ? ` · ${banner.tagline}` : ""} (새 창)`}>
    <span className={image ? styles.art : `${styles.art} ${styles.tone}`} data-tone={toneOf(banner.id + banner.title)} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image} alt="" loading="lazy" decoding="async" onError={() => setBrokenHref(image)} /> : <span className={styles.initial}>{initialOf(banner.title)}</span>}
      <span className={styles.badge}>후원</span>
    </span>
    <span className={styles.label} aria-hidden="true">
      <span className={styles.title}><span className={styles.name}>{banner.title}</span><IconOut /></span>
      {banner.tagline && <span className={styles.tagline}>{banner.tagline}</span>}
    </span>
  </a>;
}

/** 빈 액자: 같은 테에 그림 자리만 비워 두고, 누르면 게시 안내 시트를 연다. */
function PlusCard({ contact, onClick }: { contact: SponsorContact; onClick: () => void }) {
  return <button type="button" className={`${styles.card} ${styles.plus}`} onClick={onClick} aria-haspopup="dialog" aria-label={`이 자리에 기업을 소개하기, ${contact.priceLabel}`}>
    <span className={`${styles.art} ${styles.vacant}`} aria-hidden="true">
      <span className={styles.plusMark}><IconPlus /></span>
      <span className={styles.vacantNote}>비어 있는 액자</span>
    </span>
    <span className={styles.label} aria-hidden="true">
      <span className={styles.title}><span className={styles.name}>이 자리에 소개하기</span></span>
      <span className={styles.tagline}>{contact.priceLabel}</span>
    </span>
  </button>;
}

/** "+" 카드 안내: 자리·기간·가격과 메일 문의 템플릿 */
export function InquirySheet({ open, contact, onClose }: { open: boolean; contact: SponsorContact; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="기업 홍보 자리 안내">
    <p className="sheet-text">메인 양옆의 액자 한 칸에 기업의 대표 그림을 꽉 차게 걸고, 아래 명패에 기업명과 한 줄 소개를 적어요. PC 화면으로 소로우를 찾는 분들에게 보여요.</p>
    <dl className={styles.terms}>
      <div><dt>기간 · 비용</dt><dd><b>{contact.priceLabel}</b></dd></div>
      <div><dt>실리는 내용</dt><dd>대표 그림(정사각형 사진·로고), 기업명(40자), 한 줄 소개(80자), 링크</dd></div>
      <div><dt>진행</dt><dd>메일로 문의 → 안내와 입금 확인 → 소로우가 등록하고 기간 동안 게시해요</dd></div>
    </dl>
    <div className="sheet-actions">
      <a className="btn" href={sponsorInquiryMailto(contact)}><IconMessage />메일로 문의하기</a>
    </div>
    <Link href="/sponsors" className={styles.more} onClick={onClose}>후원 기업 순위 보기<IconChevronR /></Link>
  </Sheet>;
}
