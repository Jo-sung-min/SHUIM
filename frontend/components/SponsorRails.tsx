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
 * PC 폭에서 앱 기둥 양옆에 고정되는 기업 홍보 카드 열. 한쪽 4칸, 노출 순서가 홀수면 왼쪽·짝수면 오른쪽.
 * 첫 빈 칸에는 "+" 카드가 있어 30일 30만원 안내와 문의 메일로 이어진다. 모바일·미니앱에서는 렌더하지 않는다.
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

function BannerCard({ banner }: { banner: SponsorBanner }) {
  const image = bannerImageHref(banner);
  return <a className={styles.card} href={banner.linkUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={() => recordBannerClick(banner.id)}
    aria-label={`후원 · ${banner.title}${banner.tagline ? ` · ${banner.tagline}` : ""} (새 창)`}>
    <span className={styles.badge} aria-hidden="true">후원</span>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <span className={styles.logo} aria-hidden="true">{image ? <img src={image} alt="" width={56} height={56} loading="lazy" /> : banner.title.slice(0, 1)}</span>
    <strong className={styles.title}>{banner.title}</strong>
    {banner.tagline && <span className={styles.tagline}>{banner.tagline}</span>}
  </a>;
}

function PlusCard({ contact, onClick }: { contact: SponsorContact; onClick: () => void }) {
  return <button type="button" className={`${styles.card} ${styles.plus}`} onClick={onClick} aria-haspopup="dialog" aria-label={`이 자리에 기업을 소개하기, ${contact.priceLabel}`}>
    <span className={styles.plusMark} aria-hidden="true"><IconPlus /></span>
    <strong className={styles.title}>이 자리에 소개하기</strong>
    <span className={styles.tagline}>{contact.priceLabel}</span>
  </button>;
}

/** "+" 카드 안내: 자리·기간·가격과 메일 문의 템플릿 */
export function InquirySheet({ open, contact, onClose }: { open: boolean; contact: SponsorContact; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="기업 홍보 자리 안내">
    <p className="sheet-text">메인 양옆의 글라스 카드 한 칸에 로고, 기업명, 한 줄 소개, 링크를 실어요. PC 화면으로 소로우를 찾는 분들에게 보여요.</p>
    <dl className={styles.terms}>
      <div><dt>기간 · 비용</dt><dd><b>{contact.priceLabel}</b></dd></div>
      <div><dt>실리는 내용</dt><dd>로고, 기업명(40자), 한 줄 소개(80자), 링크</dd></div>
      <div><dt>진행</dt><dd>메일로 문의 → 안내와 입금 확인 → 소로우가 등록하고 기간 동안 게시해요</dd></div>
    </dl>
    <div className="sheet-actions">
      <a className="btn" href={sponsorInquiryMailto(contact)}><IconMessage />메일로 문의하기</a>
    </div>
    <Link href="/sponsors" className={styles.more} onClick={onClose}>후원 기업 순위 보기<IconChevronR /></Link>
  </Sheet>;
}
