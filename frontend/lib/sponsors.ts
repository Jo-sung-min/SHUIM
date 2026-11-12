"use client";

/**
 * 기업 후원: PC 양옆 홍보 배너와 후원 기업(순위 · 멋져요 → 무료 폭죽 이용권 · 꾸미기 액자).
 * 공개 조회는 로그인 없이, 멋져요는 가입 회원만, 액자 꾸미기는 꾸미기 링크의 키로. 관리자 CRUD 는 lib/admin-sponsors.ts.
 */

import { parseFrame, type SponsorFrame } from "./sponsor-frames";

export interface SponsorContact { email: string; priceLabel: string }
export interface SponsorBanner { id: string; title: string; tagline: string; linkUrl: string; imageAt: number | null; position: number }
export interface SponsorBannersResponse { banners: SponsorBanner[]; contact: SponsorContact; slotsPerSide: number }
export interface Sponsor {
  id: string; name: string; tagline: string; linkUrl: string | null; logoAt: number | null;
  amountWon: number; fireworksTotal: number; fireworksGiven: number; remaining: number; cheers: number; rank: number;
  /** 기업이 고른 꾸미기 액자 */
  frame: SponsorFrame;
}
/** 꾸미기 링크로 연 내 기업 카드. rank 0 = 아직 공개 전 */
export interface StudioSponsor { id: string; name: string; tagline: string; logoAt: number | null; amountWon: number; rank: number; frame: SponsorFrame }
export interface SponsorsResponse { sponsors: Sponsor[]; contact: SponsorContact }
export interface SponsorCheerResult { tickets: number; sponsor: Sponsor; cheersLeftToday: number }

export const DEFAULT_SPONSOR_CONTACT: SponsorContact = { email: "hello@sorow.co.kr", priceLabel: "30일 30만원" };
/** 한쪽 액자 칸 수의 기본값 (서버 SponsorPolicy.SLOTS_PER_SIDE 와 맞춘다) */
export const SPONSOR_BANNER_SLOTS = 5;
/** 후원 1,000원 = 폭죽 1개 */
export const WON_PER_FIREWORK = 1000;

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string";
const timeOrNull = (value: unknown): value is number | null => value === null || value === undefined || (count(value) && value > 0);
const safeLink = (value: unknown): value is string => typeof value === "string" && /^https?:\/\/[^\s]+$/i.test(value) && value.length <= 500;

export function parseSponsorContact(value: unknown): SponsorContact {
  if (!object(value)) return DEFAULT_SPONSOR_CONTACT;
  return {
    email: text(value.email) && value.email.includes("@") ? value.email : DEFAULT_SPONSOR_CONTACT.email,
    priceLabel: text(value.priceLabel) && value.priceLabel.trim() ? value.priceLabel : DEFAULT_SPONSOR_CONTACT.priceLabel,
  };
}

export function parseSponsorBanner(value: unknown): SponsorBanner | null {
  if (!object(value) || !text(value.id) || !text(value.title) || !safeLink(value.linkUrl) || !timeOrNull(value.imageAt)) return null;
  return { id: value.id, title: value.title.slice(0, 40), tagline: text(value.tagline) ? value.tagline.slice(0, 80) : "",
    linkUrl: value.linkUrl, imageAt: value.imageAt ?? null, position: count(value.position) ? value.position : 0 };
}

export function parseSponsor(value: unknown): Sponsor | null {
  if (!object(value) || !text(value.id) || !text(value.name) || !count(value.amountWon) || !count(value.fireworksTotal)
    || !count(value.fireworksGiven) || !count(value.remaining) || !count(value.cheers) || !timeOrNull(value.logoAt)) return null;
  return { id: value.id, name: value.name.slice(0, 40), tagline: text(value.tagline) ? value.tagline.slice(0, 80) : "",
    linkUrl: safeLink(value.linkUrl) ? value.linkUrl : null, logoAt: value.logoAt ?? null,
    amountWon: value.amountWon, fireworksTotal: value.fireworksTotal, fireworksGiven: value.fireworksGiven,
    remaining: value.remaining, cheers: value.cheers, rank: count(value.rank) && value.rank > 0 ? value.rank : 0, frame: parseFrame(value.frame) };
}

function parseStudioSponsor(value: unknown): StudioSponsor | null {
  if (!object(value) || !text(value.id) || !text(value.name) || !count(value.amountWon) || !timeOrNull(value.logoAt)) return null;
  return { id: value.id, name: value.name.slice(0, 40), tagline: text(value.tagline) ? value.tagline.slice(0, 80) : "", logoAt: value.logoAt ?? null,
    amountWon: value.amountWon, rank: count(value.rank) ? value.rank : 0, frame: parseFrame(value.frame) };
}

export const bannerImageHref = (banner: Pick<SponsorBanner, "id" | "imageAt">) => banner.imageAt ? `/api/sponsors/banners/${banner.id}/image?v=${banner.imageAt}` : null;
export const sponsorLogoHref = (sponsor: Pick<Sponsor, "id" | "logoAt">) => sponsor.logoAt ? `/api/sponsors/${sponsor.id}/logo?v=${sponsor.logoAt}` : null;
/** 500만원 · 1억 2,500만원. 만 단위로 떨어지지 않으면 원 단위 그대로(1,234,000원) */
export const fmtSponsorWon = (won: number) => {
  if (won < 10_000 || won % 10_000 !== 0) return `${won.toLocaleString("ko-KR")}원`;
  const eok = Math.floor(won / 100_000_000), man = (won % 100_000_000) / 10_000;
  return `${eok ? `${eok.toLocaleString("ko-KR")}억` : ""}${eok && man ? " " : ""}${man ? `${man.toLocaleString("ko-KR")}만` : ""}원`;
};

/** "+" 카드·후원 페이지의 문의 메일. 제목·본문 템플릿을 넣어 담당자가 바로 답할 수 있게 한다. */
export function sponsorInquiryMailto(contact: SponsorContact, company = ""): string {
  const subject = `[소로우 후원 배너 문의] ${company || "기업명"}`;
  const body = ["기업명: " + company, "담당자·연락처: ", "홈페이지 링크: ", "희망 게시 시작일: ", "한 줄 소개(40자 이내): ", "", `${contact.priceLabel} · 액자에 걸 대표 그림(정사각형 사진이나 로고)은 답장에 첨부해 주세요.`].join("\n");
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(object(body) && typeof body.error === "string" ? body.error : "후원 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    error.name = `HttpError${response.status}`;
    throw error;
  }
  return body as T;
}

export async function fetchSponsorBanners(signal?: AbortSignal): Promise<SponsorBannersResponse> {
  const body = await request<unknown>("/api/sponsors/banners", { signal });
  const list = object(body) && Array.isArray(body.banners) ? body.banners : [];
  const banners = list.map(parseSponsorBanner).filter((banner): banner is SponsorBanner => banner !== null).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const slots = object(body) && count(body.slotsPerSide) && body.slotsPerSide > 0 ? Math.min(body.slotsPerSide, 6) : SPONSOR_BANNER_SLOTS;
  return { banners: banners.slice(0, slots * 6), contact: parseSponsorContact(object(body) ? body.contact : null), slotsPerSide: slots };
}

export async function fetchSponsors(signal?: AbortSignal): Promise<SponsorsResponse> {
  const body = await request<unknown>("/api/sponsors", { signal });
  const list = object(body) && Array.isArray(body.sponsors) ? body.sponsors : [];
  const sponsors = list.map(parseSponsor).filter((sponsor): sponsor is Sponsor => sponsor !== null);
  return { sponsors, contact: parseSponsorContact(object(body) ? body.contact : null) };
}

/** 참고용 클릭 수. 새 탭이 열리는 동안에도 보내지도록 beacon 을 쓴다. */
export function recordBannerClick(id: string) {
  try {
    const path = `/api/sponsors/banners/${encodeURIComponent(id)}/click`;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") navigator.sendBeacon(path);
    else void fetch(path, { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => undefined);
  } catch { /* noop */ }
}

/** 멋져요: 그 기업의 남은 폭죽 1개가 내 이용권 1장이 된다. 기업당 하루 1번, 하루 최대 3장(서버가 확정). */
export async function cheerSponsor(id: string): Promise<SponsorCheerResult> {
  const body = await request<unknown>(`/api/sponsors/${encodeURIComponent(id)}/cheer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const sponsor = object(body) ? parseSponsor(body.sponsor) : null;
  if (!object(body) || !count(body.tickets) || !sponsor) throw new Error("멋져요 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.");
  return { tickets: body.tickets, sponsor, cheersLeftToday: count(body.cheersLeftToday) ? body.cheersLeftToday : 0 };
}

/* ---------- 꾸미기 링크 (로그인 없이, 키는 본문으로만 보낸다) ---------- */
const STUDIO_FAILED = "꾸미기 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.";
const studioRequest = async (path: string, method: "POST" | "PUT", body: Record<string, string>): Promise<StudioSponsor> => {
  const result = await request<unknown>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const sponsor = object(result) ? parseStudioSponsor(result.sponsor) : null;
  if (!sponsor) throw new Error(STUDIO_FAILED);
  return sponsor;
};
export const openSponsorStudio = (key: string) => studioRequest("/api/sponsors/studio/open", "POST", { key });
export const saveSponsorFrame = (key: string, frame: SponsorFrame) => studioRequest("/api/sponsors/studio", "PUT", { key, style: frame.style, color: frame.color, deco: frame.deco });
