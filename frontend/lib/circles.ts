"use client";
import { requireCommunityConsent } from "./consent";
import type { ShoutCat } from "./community";

/**
 * 커뮤니티 소로우 클라이언트. 회사원·자영업·취준생·쉬는 중처럼 처지별로 모인 곳에 익명 사연을 보내고,
 * 소로우지기가 정리해 '#번호'로 올린다. 회사·학교 같은 소속 이름은 쓰지 않는다 (누군가에게는 박탈감이 되어서).
 * 게시된 사연의 읽기·힘내요·댓글은 외침과 같은 /api/community 를 쓴다 (Post.communityId 가 있는 글).
 */

export type CircleKind = "work" | "study" | "rest" | "care";
export type JoinMode = "open" | "approve" | "invite" | "domain";
export type Visibility = "public" | "members";

/** 처지 묶음 (서버 CircleLogic.KINDS 와 같은 순서) */
export const CIRCLE_KINDS: { id: CircleKind; label: string; hint: string }[] = [
  { id: "work", label: "일하는 중", hint: "회사원, 자영업, 프리랜서, 현장·교대, 공무원" },
  { id: "study", label: "준비하는 중", hint: "대학생, 수험생, 취준생" },
  { id: "rest", label: "쉬는 중", hint: "일을 쉬거나 멈춘 사람들" },
  { id: "care", label: "돌보는 중", hint: "육아, 가족 돌봄" },
];
export const kindLabel = (k: string) => CIRCLE_KINDS.find((x) => x.id === k)?.label ?? "소로우";
export const JOIN_MODE_LABEL: Record<JoinMode, string> = {
  open: "누구나 가입",
  approve: "소로우지기 승인 후 가입",
  invite: "초대 코드로 가입",
  domain: "소속 메일 인증",
};

export interface Circle {
  id: string;
  slug: string;
  name: string;
  kind: CircleKind;
  domain?: string;
  verified: boolean;
  joinMode: JoinMode;
  visibility: Visibility;
  intro: string;
  notice: string;
  memberCount: number;
  listenerCount: number;
  postCount: number;
  /** 예시 데이터로 넣은 소로우 ("샘플" 표시) */
  sample?: boolean;
  createdAt: number;
  /** 이번 주 가장 따뜻한 소로우 순위 */
  rank?: number;
}
export interface MyCircle extends Circle {
  role: "owner" | "keeper" | "member";
  status: "active" | "pending";
  primary: boolean;
}
export interface CircleDetail extends Circle {
  me: {
    role: MyCircle["role"] | null;
    status: MyCircle["status"] | null;
    primary: boolean;
    verified: boolean;
    keeper: boolean;
    listening: boolean;
    canRead: boolean;
  };
  inviteCode?: string;
  pendingCount?: number;
  waitingMembers?: number;
}
export interface CircleMember { userId: string; nick: string; role: MyCircle["role"]; status: MyCircle["status"]; verified: boolean; joinedAt: number }
export type SubmissionStatus = "pending" | "held" | "published" | "rejected";
export interface Submission {
  id: string;
  /** 내 사연함에서만 */
  circle?: string;
  circleSlug?: string;
  cat: ShoutCat;
  text: string;
  status: SubmissionStatus;
  crisis: boolean;
  aiDraft?: string;
  reason?: string;
  reply?: string;
  createdAt: number;
  decidedAt?: number;
  postNo?: number;
  postId?: string;
  /** 게시 시각 (보낸 시각과 떨어뜨리려 10~90분 늦춘다) */
  publishAt?: number;
}
export interface Draft { text: string; masked: string[]; source: "ai" | "local" }

async function j<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
  return json;
}
const opts = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  body: body !== undefined ? JSON.stringify(body) : undefined,
  credentials: "same-origin",
  cache: "no-store",
});
const at = (slug: string, rest = "") => `/api/circles/${encodeURIComponent(slug)}${rest}`;
const get = <T,>(url: string) => fetch(url, opts("GET")).then((r) => j<T>(r));
const post = <T,>(url: string, body: unknown = {}) => fetch(url, opts("POST", body)).then((r) => j<T>(r));

export const browseCircles = (kind?: CircleKind | "", q?: string) => {
  const p = new URLSearchParams();
  if (kind) p.set("kind", kind);
  if (q) p.set("q", q);
  return get<{ circles: Circle[] }>(`/api/circles?${p}`).then((r) => r.circles);
};
export const fetchWarmCircles = () => get<{ circles: Circle[] }>("/api/circles/warm").then((r) => r.circles);
export const fetchMyCircles = () => get<{ member: MyCircle[]; listening: Circle[] }>("/api/circles/mine");
export const fetchCircle = (slug: string) => get<CircleDetail>(at(slug));

export async function createCircle(input: { name: string; slug: string; kind: CircleKind; intro: string; joinMode: JoinMode; visibility: Visibility; domain?: string }) {
  await requireCommunityConsent();
  return post<CircleDetail>("/api/circles", input);
}
export const updateCircle = (slug: string, input: { notice?: string; intro?: string; visibility?: Visibility; joinMode?: JoinMode; regenerateInvite?: boolean }) =>
  fetch(at(slug), opts("PUT", input)).then((r) => j<CircleDetail>(r));
export async function joinCircle(slug: string, code?: string) {
  await requireCommunityConsent();
  return post<CircleDetail>(at(slug, "/join"), code ? { code } : {});
}
export const leaveCircle = (slug: string) => post<CircleDetail>(at(slug, "/leave"));
export const setPrimaryCircle = (slug: string) => post<CircleDetail>(at(slug, "/primary"));
export const toggleCircleFollow = (slug: string) => post<CircleDetail>(at(slug, "/follow"));
export async function startVerify(slug: string, email: string) {
  await requireCommunityConsent();
  return post<{ sent: boolean; devCode?: string }>(at(slug, "/verify/start"), { email });
}
export const confirmVerify = (slug: string, code: string) => post<CircleDetail>(at(slug, "/verify/confirm"), { code });

export const fetchMembers = (slug: string) => get<{ members: CircleMember[] }>(at(slug, "/members")).then((r) => r.members);
export const memberAction = (slug: string, userId: string, action: "approve" | "remove" | "keeper" | "unkeeper") =>
  post<{ members: CircleMember[] }>(at(slug, `/members/${encodeURIComponent(userId)}`), { action }).then((r) => r.members);

export const previewSubmission = (slug: string, text: string) => post<Draft>(at(slug, "/preview"), { text });
export async function sendSubmission(slug: string, cat: string, text: string) {
  await requireCommunityConsent();
  return post<{ id: string; crisis: boolean }>(at(slug, "/submissions"), { cat, text });
}
export const fetchQueue = (slug: string, status: "pending" | "held" | "done") =>
  get<{ submissions: Submission[] }>(at(slug, `/submissions?status=${status}`)).then((r) => r.submissions);
export const draftSubmission = (slug: string, id: string) => post<Draft>(at(slug, `/submissions/${encodeURIComponent(id)}/draft`));
export const decideSubmission = (slug: string, id: string, input: { action: "publish" | "hold" | "reject"; text?: string; reason?: string; reply?: string }) =>
  post<{ submissions: Submission[] }>(at(slug, `/submissions/${encodeURIComponent(id)}/decide`), input).then((r) => r.submissions);
export const toggleCirclePostHidden = (slug: string, postId: string) => post<{ hidden: boolean }>(at(slug, `/posts/${encodeURIComponent(postId)}/hide`));
export const fetchMySubmissions = () => get<{ submissions: Submission[] }>("/api/submissions/mine").then((r) => r.submissions);

/** 보내기 전에 바로 보여 줄 경고: 실명·연락처·학번처럼 보이는 것 (서버의 CircleLogic.mask 와 같은 규칙) */
export function personalInfoHints(text: string): string[] {
  const out: string[] = [];
  if (/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/.test(text)) out.push("전화번호");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) out.push("메일 주소");
  if (/(?<!\d)\d{7,10}(?!\d)/.test(text)) out.push("학번·사번 같은 번호");
  if (/(?<![가-힣])[가-힣]{2,3}\s?(교수님|교수|팀장님|팀장|부장님|부장|과장님|과장|차장님|차장|대리님|대리|사장님|사장|선생님|매니저님|매니저|선배|후배|조교)/.test(text) || /(?<![가-힣])[가-힣]{2,3} 씨/.test(text)) {
    out.push("실명으로 보이는 이름");
  }
  return out;
}

export const SUBMISSION_STATUS: Record<SubmissionStatus, string> = {
  pending: "검토 기다리는 중",
  held: "보류",
  published: "게시됨",
  rejected: "반려",
};

/** 사연 표시 이름: "회사원 소로우 #128" */
export const circleTag = (p: { circle?: string; postNo?: number }) => `${p.circle ?? "소로우"}${p.postNo ? ` #${p.postNo}` : ""}`;
