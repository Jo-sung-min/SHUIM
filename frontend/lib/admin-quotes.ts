export type QuoteKind = "paraphrase" | "translation";
export type QuoteStatus = "pending" | "enabled" | "disabled";
export interface QuoteDraft {
  text: string;
  author: string;
  source: string;
  sourceUrl: string;
  theme: string;
  kind: QuoteKind;
}
export interface AdminQuote extends QuoteDraft {
  id: string;
  enabled: boolean;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export const QUOTE_LIMITS = { text: 600, author: 100, source: 300, sourceUrl: 2048, theme: 60 } as const;
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = { pending: "검수 대기", enabled: "사용 중", disabled: "미사용" };
export const QUOTE_KIND_LABELS: Record<QuoteKind, string> = { paraphrase: "의역", translation: "번역" };

export class AdminQuoteError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function quoteStatus(quote: AdminQuote): QuoteStatus {
  return quote.reviewedAt === null ? "pending" : quote.enabled ? "enabled" : "disabled";
}

export function quoteDraft(quote?: QuoteDraft): QuoteDraft {
  return { text: quote?.text ?? "", author: quote?.author ?? "", source: quote?.source ?? "", sourceUrl: quote?.sourceUrl ?? "", theme: quote?.theme ?? "", kind: quote?.kind ?? "paraphrase" };
}

export function quoteSourceLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function filterQuotes(quotes: AdminQuote[], search: string, theme: string, status: QuoteStatus | "all") {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return quotes.filter((quote) => (theme === "" || quote.theme === theme) && (status === "all" || quoteStatus(quote) === status)
    && words.every((word) => [quote.text, quote.author, quote.source, quote.theme, QUOTE_KIND_LABELS[quote.kind]]
      .join(" ").toLocaleLowerCase().includes(word)));
}

export function validateQuoteDraft(draft: QuoteDraft): QuoteDraft {
  const cleaned = quoteDraft(draft);
  const labels = { text: "명언", author: "저자", source: "출처 문헌", sourceUrl: "출처 링크", theme: "테마" };
  for (const key of Object.keys(QUOTE_LIMITS) as (keyof typeof QUOTE_LIMITS)[]) {
    cleaned[key] = draft[key].trim();
    if (!cleaned[key] || cleaned[key].length > QUOTE_LIMITS[key]) throw new Error(`${labels[key]}을(를) ${QUOTE_LIMITS[key]}자 이내로 입력해 주세요.`);
  }
  if (!quoteSourceLink(cleaned.sourceUrl)) throw new Error("출처 링크는 계정 정보가 없는 http 또는 https 전체 주소를 입력해 주세요.");
  if (cleaned.kind !== "paraphrase" && cleaned.kind !== "translation") throw new Error("의역 또는 번역을 선택해 주세요.");
  return cleaned;
}

function parseQuote(value: unknown): AdminQuote {
  const quote = value as Partial<AdminQuote> | null;
  if (!quote || typeof quote !== "object" || typeof quote.id !== "string" || !quote.id
    || ![quote.text, quote.author, quote.source, quote.sourceUrl, quote.theme].every((field) => typeof field === "string")
    || !["paraphrase", "translation"].includes(quote.kind ?? "") || typeof quote.enabled !== "boolean"
    || !(quote.reviewedAt === null || (typeof quote.reviewedAt === "number" && Number.isFinite(quote.reviewedAt)))
    || ![quote.createdAt, quote.updatedAt].every((time) => typeof time === "number" && Number.isFinite(time))
    || (quote.enabled && quote.reviewedAt === null)) throw new Error("명언 정보를 확인하지 못했어요. 목록을 새로고침해 주세요.");
  return quote as AdminQuote;
}

async function request(path = "", method = "GET", body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api/admin/quotes${path}`, {
    method, credentials: "same-origin", cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new AdminQuoteError(typeof result?.error === "string" ? result.error : "명언 정보를 저장하거나 불러오지 못했어요. 다시 시도해 주세요.", response.status);
  return result;
}

export async function fetchAdminQuotes(signal?: AbortSignal): Promise<AdminQuote[]> {
  const body = await request("", "GET", undefined, signal);
  if (!Array.isArray(body?.quotes)) throw new Error("명언 목록을 확인하지 못했어요. 다시 시도해 주세요.");
  return body.quotes.map(parseQuote);
}

/** Editing content never sends approval; review is a separate, explicit action. */
export async function saveAdminQuote(draft: QuoteDraft, id?: string): Promise<AdminQuote> {
  const content = validateQuoteDraft(draft);
  const body = await request(id ? `/${encodeURIComponent(id)}` : "", id ? "PUT" : "POST", content);
  return parseQuote(body?.quote);
}

export async function setAdminQuoteUsage(id: string, enabled: boolean, expectedUpdatedAt: number): Promise<AdminQuote> {
  const body = await request(`/${encodeURIComponent(id)}/usage`, "PATCH", { enabled, expectedUpdatedAt });
  return parseQuote(body?.quote);
}
