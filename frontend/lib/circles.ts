"use client";
import { requireCommunityConsent } from "./consent";
import type { ShoutCat } from "./community";

/**
 * 커뮤니티 소로우 클라이언트. 미식·자취·싱글·자영업처럼 즐기는 일, 살아가는 일, 마음의 고민으로 모인 곳에 익명 사연을 보내고,
 * 소로우지기가 정리해 '#번호'로 올린다. 회사·학교 같은 소속 이름은 쓰지 않는다 (누군가에게는 박탈감이 되어서).
 * 게시된 사연의 읽기·힘내요·댓글은 외침과 같은 /api/community 를 쓴다 (Post.communityId 가 있는 글).
 */

/** 기본 묶음 id. 새 묶음은 소로우를 여는 사람이 만들고 id 가 "g-…" 다 (CircleGroup) */
export type CircleKind = "enjoy" | "live" | "love" | "work" | "study" | "rest" | "care";
export type JoinMode = "open" | "approve" | "invite" | "domain";
export type Visibility = "public" | "members";

/** 기본 소로우 묶음 (서버 circle_groups 의 builtin 과 같은 순서). 묶음 목록을 못 받았을 때도 이것으로 그린다 */
export const CIRCLE_KINDS: { id: CircleKind; label: string; hint: string }[] = [
  { id: "enjoy", label: "즐기는 중", hint: "미식, 여행, 운동, 덕질, 책, 게임" },
  { id: "live", label: "살아가는 중", hint: "자취, 출퇴근, 반려생활, 새벽" },
  { id: "love", label: "사랑·혼자", hint: "싱글, 모솔, 이별, 이혼, 돌싱, 외로움" },
  { id: "work", label: "일하는 중", hint: "회사원, 자영업, 프리랜서, 현장·교대, 공무원" },
  { id: "study", label: "준비하는 중", hint: "대학생, 수험생, 취준생" },
  { id: "rest", label: "쉬는 중", hint: "일을 쉬거나 멈춘 사람들" },
  { id: "care", label: "돌보는 중", hint: "육아, 가족 돌봄" },
];
/** 묶음 이름: 서버가 내려 준 kindLabel → 기본 묶음 → "소로우" */
export const kindLabel = (c: { kind: string; kindLabel?: string } | string) => {
  const k = typeof c === "string" ? c : c.kind;
  return (typeof c === "string" ? undefined : c.kindLabel) ?? CIRCLE_KINDS.find((x) => x.id === k)?.label ?? "소로우";
};

/** 소로우 묶음: 기본 묶음 + 소로우를 열며 새로 만든 묶음 (디시 마이너 갤러리처럼) */
export interface CircleGroup { id: string; label: string; hint?: string; builtin: boolean; circleCount: number }
export const BUILTIN_GROUPS: CircleGroup[] = CIRCLE_KINDS.map((k) => ({ id: k.id, label: k.label, hint: k.hint, builtin: true, circleCount: 0 }));
/** 새 묶음 이름 규칙 (서버 CircleLogic.normalizeGroupLabel 과 같다): 2~10자 한글·영문·숫자·공백·가운뎃점·하이픈 */
export function normalizeGroupLabel(raw: string): string | null {
  const n = raw.trim().replace(/\s+/g, " ").replace(/[ㆍ•]/g, "·").replace(/\s*·\s*/g, "·").replace(/\s*소로우$/, "").trim();
  if (!/^[가-힣A-Za-z0-9 ·-]{2,10}$/.test(n) || !/[가-힣A-Za-z]/.test(n) || /^[·-]|[·-]$/.test(n)) return null;
  return n;
}
/** 같은 묶음 막기용 키: 공백·가운뎃점·하이픈 없애고 소문자 */
export const groupKey = (label: string) => label.replace(/[\s·-]+/g, "").toLowerCase();
export const JOIN_MODE_LABEL: Record<JoinMode, string> = {
  open: "누구나 가입",
  approve: "소로우지기 승인 후 가입",
  invite: "초대 코드로 가입",
  domain: "소속 메일 인증",
};

export interface Circle {
  privateTest?: boolean;
  pinned?: boolean;
  spaceCapacity?: number;
  id: string;
  slug: string;
  name: string;
  /** 묶음 id (기본 묶음 또는 "g-…") */
  kind: string;
  /** 묶음 이름 (서버가 circle_groups 에서 찾아 준다) */
  kindLabel?: string;
  domain?: string;
  verified: boolean;
  joinMode: JoinMode;
  visibility: Visibility;
  intro: string;
  notice: string;
  /** 아이콘 id: 예전 기본 아이콘(components/CircleMark CIRCLE_ICONS) 또는 "fl:<Fluent 이름>" */
  icon?: string | null;
  /** 올린 아이콘 사진 주소 (서버가 내려 준다) */
  iconUrl?: string | null;
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

export const fetchCircleGroups = (q?: string) =>
  get<{ groups: CircleGroup[] }>(`/api/circles/groups${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => r.groups);
export const browseCircles = (kind?: string, q?: string) => {
  const p = new URLSearchParams();
  if (kind) p.set("kind", kind);
  if (q) p.set("q", q);
  return get<{ circles: Circle[] }>(`/api/circles?${p}`).then((r) => r.circles);
};
export const fetchWarmCircles = () => get<{ circles: Circle[] }>("/api/circles/warm").then((r) => r.circles);
export const fetchMyCircles = () => get<{ member: MyCircle[]; listening: Circle[] }>("/api/circles/mine");
export const fetchCircle = (slug: string) => get<CircleDetail>(at(slug));

export const createPrivateTestCircle = (peerId: string) => post<CircleDetail>("/api/circles/private-test", { peerId });
export const fetchPrivateTestStatus = async (signal?: AbortSignal): Promise<{ enabled: boolean }> => {
  const result = await fetch("/api/circles/private-test/status", { ...opts("GET"), signal }).then((response) => j<{ enabled?: unknown }>(response));
  if (typeof result.enabled !== "boolean") throw new Error("테스트 소로우 만들기 상태를 확인하지 못했어요.");
  return { enabled: result.enabled };
};

/** kind: 고른 묶음 id, group: 새로 만들 묶음 이름 (있으면 서버가 kind 대신 쓴다) */
export async function createCircle(input: { name: string; slug: string; kind?: string; group?: string; intro: string; joinMode: JoinMode; visibility: Visibility; domain?: string; icon?: string | null }) {
  await requireCommunityConsent();
  return post<CircleDetail>("/api/circles", input);
}
/** iconImage: 새 사진은 data URL, "" 는 사진 지우기, 없으면 그대로 */
export const updateCircle = (slug: string, input: { notice?: string; intro?: string; name?: string; icon?: string | null; iconImage?: string; visibility?: Visibility; joinMode?: JoinMode; regenerateInvite?: boolean }) =>
  fetch(at(slug), opts("PUT", input)).then((r) => j<CircleDetail>(r));
export async function joinCircle(slug: string, code?: string) {
  await requireCommunityConsent();
  return post<CircleDetail>(at(slug, "/join"), code ? { code } : {});
}
export const leaveCircle = (slug: string) => post<CircleDetail>(at(slug, "/leave"));
/** 소로우 닫기 (연 사람만): 둘러보기·내 소로우·바닷가에서 사라지고 사연은 남는다 */
export const closeCircle = (slug: string) => fetch(at(slug), opts("DELETE")).then((r) => j<{ closed: boolean }>(r));
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
