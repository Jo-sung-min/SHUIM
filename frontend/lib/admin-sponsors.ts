"use client";

/** 관리자 › 후원: 배너·후원 기업·안내 설정 API (관리자 세션만). 공개 조회는 lib/sponsors.ts. */
import { DEFAULT_SPONSOR_CONTACT, SponsorContact, WON_PER_FIREWORK, parseSponsorContact } from "./sponsors";
import { imageToDataUrl } from "./siteImage";
import { parseFrame, type SponsorFrame } from "./sponsor-frames";

export type BannerStatus = "live" | "scheduled" | "ended" | "hidden";
export interface AdminBanner {
  id: string; title: string; tagline: string; linkUrl: string; imageAt: number | null; position: number;
  startsAt: number; endsAt: number; published: boolean; sponsorId: string | null; clicks: number; status: BannerStatus;
  createdAt: number; updatedAt: number;
}
export interface AdminBannerInput {
  title: string; tagline: string; linkUrl: string; position: number; startsAt: number; endsAt: number; published: boolean;
  sponsorId: string | null;
  /** data URL 이면 새 이미지, null 이면 삭제, 생략하면 유지 */
  image?: string | null;
}
export interface AdminContribution { id: string; amountWon: number; fireworks: number; note: string | null; createdAt: number }
export interface AdminSponsor {
  id: string; name: string; tagline: string; linkUrl: string | null; logoAt: number | null;
  amountWon: number; fireworksTotal: number; fireworksGiven: number; remaining: number; cheers: number;
  published: boolean; position: number; createdAt: number; updatedAt: number; contributions: AdminContribution[];
  frame: SponsorFrame;
  /** 꾸미기 링크를 발급한 시각. null 이면 열려 있는 링크가 없다 */
  studioKeyAt: number | null;
}
/** frame 을 생략하면 액자는 그대로 둔다 */
export interface AdminSponsorInput { name: string; tagline: string; linkUrl: string | null; published: boolean; position: number; logo?: string | null; frame?: SponsorFrame }

export const BANNER_STATUS_LABELS: Record<BannerStatus, string> = { live: "게시 중", scheduled: "예정", ended: "종료", hidden: "비공개" };
export const TITLE_MAX = 40;
export const TAGLINE_MAX = 80;
export const NOTE_MAX = 200;
export const LINK_MAX = 500;
export const AMOUNT_MAX_WON = 100_000_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === "string";
const timeOrNull = (value: unknown): value is number | null => value === null || value === undefined || (count(value) && value > 0);
const GENERIC = "후원 정보를 확인하지 못했어요. 목록을 다시 불러와 주세요.";

function parseBanner(value: unknown): AdminBanner {
  if (!object(value) || !text(value.id) || !text(value.title) || !text(value.linkUrl) || !timeOrNull(value.imageAt)
    || !integer(value.position) || !count(value.startsAt) || !count(value.endsAt) || typeof value.published !== "boolean"
    || !(value.sponsorId === null || value.sponsorId === undefined || text(value.sponsorId))
    || !Object.hasOwn(BANNER_STATUS_LABELS, String(value.status)) || !count(value.createdAt) || !count(value.updatedAt)) throw new Error(GENERIC);
  return { id: value.id, title: value.title, tagline: text(value.tagline) ? value.tagline : "", linkUrl: value.linkUrl, imageAt: value.imageAt ?? null,
    position: value.position, startsAt: value.startsAt, endsAt: value.endsAt, published: value.published, sponsorId: value.sponsorId ?? null,
    clicks: count(value.clicks) ? value.clicks : 0, status: value.status as BannerStatus, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

function parseSponsor(value: unknown): AdminSponsor {
  if (!object(value) || !text(value.id) || !text(value.name) || !timeOrNull(value.logoAt) || !count(value.amountWon)
    || !count(value.fireworksTotal) || !count(value.fireworksGiven) || !count(value.remaining) || !count(value.cheers)
    || typeof value.published !== "boolean" || !integer(value.position) || !count(value.createdAt) || !count(value.updatedAt)) throw new Error(GENERIC);
  const contributions = Array.isArray(value.contributions) ? value.contributions : [];
  if (!contributions.every((item) => object(item) && text(item.id) && count(item.amountWon) && count(item.fireworks) && count(item.createdAt)
    && (item.note === null || item.note === undefined || text(item.note)))) throw new Error(GENERIC);
  return { id: value.id, name: value.name, tagline: text(value.tagline) ? value.tagline : "", linkUrl: text(value.linkUrl) ? value.linkUrl : null,
    logoAt: value.logoAt ?? null, amountWon: value.amountWon, fireworksTotal: value.fireworksTotal, fireworksGiven: value.fireworksGiven,
    remaining: value.remaining, cheers: value.cheers, published: value.published, position: value.position, createdAt: value.createdAt, updatedAt: value.updatedAt,
    contributions: (contributions as Record<string, unknown>[]).map((item) => ({ id: item.id as string, amountWon: item.amountWon as number, fireworks: item.fireworks as number,
      note: text(item.note) ? item.note : null, createdAt: item.createdAt as number })),
    frame: parseFrame(value.frame), studioKeyAt: count(value.studioKeyAt) && value.studioKeyAt > 0 ? value.studioKeyAt : null };
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`/api/admin/sponsors${path}`, { ...options, credentials: "same-origin", cache: "no-store" });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(object(result) && typeof result.error === "string" ? result.error : "후원 정보를 불러오거나 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return result;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ---------- 입력 검증 (서버와 같은 기준) ---------- */
export const validLink = (value: string) => /^https?:\/\/[^\s]+$/i.test(value) && value.length <= LINK_MAX;
export function validateBanner(input: AdminBannerInput): string | null {
  if (!input.title.trim()) return "제목을 적어 주세요.";
  if (input.title.length > TITLE_MAX) return `제목은 ${TITLE_MAX}자까지예요.`;
  if (input.tagline.length > TAGLINE_MAX) return `한 줄 소개는 ${TAGLINE_MAX}자까지예요.`;
  if (!validLink(input.linkUrl.trim())) return "링크는 http:// 또는 https:// 로 시작하는 주소여야 해요.";
  if (!Number.isSafeInteger(input.position) || input.position < 0 || input.position > 1000) return "노출 순서는 0 이상 1000 이하의 정수로 적어 주세요.";
  if (!count(input.startsAt) || !count(input.endsAt)) return "게시 시작과 종료 시각을 확인해 주세요.";
  if (input.endsAt <= input.startsAt) return "게시 종료는 시작보다 뒤여야 해요.";
  return null;
}
export function validateSponsor(input: AdminSponsorInput): string | null {
  if (!input.name.trim()) return "기업명을 적어 주세요.";
  if (input.name.length > TITLE_MAX) return `기업명은 ${TITLE_MAX}자까지예요.`;
  if (input.tagline.length > TAGLINE_MAX) return `한 줄 소개는 ${TAGLINE_MAX}자까지예요.`;
  if (input.linkUrl && !validLink(input.linkUrl.trim())) return "링크는 http:// 또는 https:// 로 시작하는 주소여야 해요.";
  if (!Number.isSafeInteger(input.position) || input.position < 0 || input.position > 1000) return "노출 순서는 0 이상 1000 이하의 정수로 적어 주세요.";
  return null;
}
export function validateAmount(amountWon: number): string | null {
  if (!Number.isSafeInteger(amountWon) || amountWon <= 0) return "후원액을 원 단위 숫자로 적어 주세요.";
  if (amountWon % WON_PER_FIREWORK !== 0) return `후원액은 ${WON_PER_FIREWORK.toLocaleString("ko-KR")}원 단위로 적어 주세요.`;
  if (amountWon > AMOUNT_MAX_WON) return "후원액은 1억원까지 적을 수 있어요.";
  return null;
}
/** 1,000원 = 폭죽 1개 */
export const fireworksFor = (amountWon: number) => Number.isSafeInteger(amountWon) && amountWon > 0 ? Math.floor(amountWon / WON_PER_FIREWORK) : 0;

/* ---------- 날짜: datetime-local(로컬 시각) ↔ epoch ms ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
export function toLocalInput(timestamp: number): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
export const fmtAdminDate = (timestamp: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);

/** 로고·배너 이미지: 384×384 PNG, 너무 크면 JPEG 로 (서버 한도 400 KB) */
export async function prepareSponsorImage(file: File): Promise<string> {
  const png = await imageToDataUrl(file, 384, 384, "image/png");
  if (png.length <= 520_000) return png;
  return imageToDataUrl(file, 384, 384, "image/jpeg", 0.85);
}

/* ---------- 배너 ---------- */
export async function fetchAdminBanners(signal?: AbortSignal): Promise<AdminBanner[]> {
  const result = await request("/banners", { method: "GET", signal });
  if (!object(result) || !Array.isArray(result.banners)) throw new Error(GENERIC);
  return result.banners.map(parseBanner);
}
export async function createAdminBanner(input: AdminBannerInput): Promise<AdminBanner> {
  const result = await request("/banners", json("POST", input));
  return parseBanner(object(result) ? result.banner : null);
}
export async function updateAdminBanner(id: string, input: AdminBannerInput): Promise<AdminBanner> {
  const result = await request(`/banners/${encodeURIComponent(id)}`, json("PUT", input));
  const banner = parseBanner(object(result) ? result.banner : null);
  if (banner.id !== id) throw new Error(GENERIC);
  return banner;
}
export async function deleteAdminBanner(id: string): Promise<void> {
  await request(`/banners/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ---------- 후원 기업 ---------- */
export async function fetchAdminSponsors(signal?: AbortSignal): Promise<AdminSponsor[]> {
  const result = await request("", { method: "GET", signal });
  if (!object(result) || !Array.isArray(result.sponsors)) throw new Error(GENERIC);
  return result.sponsors.map(parseSponsor);
}
export async function createAdminSponsor(input: AdminSponsorInput & { amountWon?: number; note?: string }): Promise<AdminSponsor> {
  const result = await request("", json("POST", input));
  return parseSponsor(object(result) ? result.sponsor : null);
}
export async function updateAdminSponsor(id: string, input: AdminSponsorInput): Promise<AdminSponsor> {
  const result = await request(`/${encodeURIComponent(id)}`, json("PUT", input));
  const sponsor = parseSponsor(object(result) ? result.sponsor : null);
  if (sponsor.id !== id) throw new Error(GENERIC);
  return sponsor;
}
export async function deleteAdminSponsor(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function addAdminContribution(id: string, amountWon: number, note: string): Promise<AdminSponsor> {
  const result = await request(`/${encodeURIComponent(id)}/contributions`, json("POST", { amountWon, note: note.trim() || undefined }));
  const sponsor = parseSponsor(object(result) ? result.sponsor : null);
  if (sponsor.id !== id) throw new Error(GENERIC);
  return sponsor;
}

/** 꾸미기 링크 발급. 키 원문은 이 응답에만 있고, 다시 발급하면 옛 링크는 닫힌다. */
export async function issueSponsorStudioKey(id: string): Promise<{ key: string; sponsor: AdminSponsor }> {
  const result = await request(`/${encodeURIComponent(id)}/studio-key`, { method: "POST" });
  if (!object(result) || !text(result.key) || !/^[A-Za-z0-9_-]{43}$/.test(result.key)) throw new Error(GENERIC);
  const sponsor = parseSponsor(result.sponsor);
  if (sponsor.id !== id) throw new Error(GENERIC);
  return { key: result.key, sponsor };
}
export async function revokeSponsorStudioKey(id: string): Promise<AdminSponsor> {
  const result = await request(`/${encodeURIComponent(id)}/studio-key`, { method: "DELETE" });
  const sponsor = parseSponsor(object(result) ? result.sponsor : null);
  if (sponsor.id !== id) throw new Error(GENERIC);
  return sponsor;
}

/* ---------- 안내 설정 ---------- */
export async function fetchSponsorSettings(signal?: AbortSignal): Promise<SponsorContact> {
  const result = await request("/settings", { method: "GET", signal });
  return object(result) ? parseSponsorContact({ email: result.contactEmail, priceLabel: result.priceLabel }) : DEFAULT_SPONSOR_CONTACT;
}
export async function saveSponsorSettings(contactEmail: string, priceLabel: string): Promise<SponsorContact> {
  const result = await request("/settings", json("PUT", { contactEmail: contactEmail.trim(), priceLabel: priceLabel.trim() }));
  return object(result) ? parseSponsorContact({ email: result.contactEmail, priceLabel: result.priceLabel }) : DEFAULT_SPONSOR_CONTACT;
}
