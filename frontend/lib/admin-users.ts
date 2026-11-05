export type MemberType = "member" | "partner" | "keeper";
export type SignupMethod = "email" | "kakao" | "toss";
export interface AdminUser {
  id: string;
  nick: string;
  createdAt: number;
  registeredAt: number | null;
  signupMethods: SignupMethod[];
  status: "active" | "blocked";
  memberType: MemberType;
  admin: boolean;
}
export interface AdminUsersPage { users: AdminUser[]; total: number; page: number; pageSize: number }
export const MEMBER_TYPE_LABELS: Record<MemberType, string> = { member: "일반 회원", partner: "파트너", keeper: "소로우지기" };
export const SIGNUP_METHOD_LABELS: Record<SignupMethod, string> = { email: "이메일", kakao: "카카오", toss: "토스" };
const finiteTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function parseUser(value: unknown): AdminUser {
  const user = value as Partial<AdminUser> | null;
  if (!user || !user.id || typeof user.id !== "string" || typeof user.nick !== "string"
    || !finiteTime(user.createdAt) || !(user.registeredAt === null || finiteTime(user.registeredAt))
    || !Array.isArray(user.signupMethods) || user.signupMethods.length === 0 || !user.signupMethods.every((method) => Object.hasOwn(SIGNUP_METHOD_LABELS, method))
    || !["active", "blocked"].includes(user.status ?? "") || !Object.hasOwn(MEMBER_TYPE_LABELS, user.memberType ?? "")
    || typeof user.admin !== "boolean") throw new Error("가입 사용자 정보를 확인하지 못했어요. 다시 불러와 주세요.");
  // Keep the client model limited to the deliberately public administrator projection.
  return { id: user.id, nick: user.nick, createdAt: user.createdAt, registeredAt: user.registeredAt,
    signupMethods: user.signupMethods, status: user.status!, memberType: user.memberType!, admin: user.admin };
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/admin/users${path}`, { ...options, credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "가입 사용자 정보를 불러오거나 저장하지 못했어요.");
  return result;
}

export async function fetchAdminUsers(search = "", page = 0, signal?: AbortSignal): Promise<AdminUsersPage> {
  if (!Number.isInteger(page) || page < 0) throw new Error("목록의 페이지를 다시 확인해 주세요.");
  const params = new URLSearchParams({ q: search.trim(), page: String(page) });
  const result = await request(`?${params}`, { method: "GET", signal });
  if (!Array.isArray(result?.users) || !Number.isSafeInteger(result.total) || result.total < 0
    || result.page !== page || !Number.isSafeInteger(result.pageSize) || result.pageSize < 1 || result.pageSize > 100
    || result.users.length > result.pageSize) throw new Error("가입 사용자 목록을 확인하지 못했어요. 다시 불러와 주세요.");
  return { users: result.users.map(parseUser), total: result.total, page: result.page, pageSize: result.pageSize };
}

export async function setAdminMemberType(id: string, memberType: MemberType): Promise<AdminUser> {
  if (!Object.hasOwn(MEMBER_TYPE_LABELS, memberType)) throw new Error("회원 유형을 다시 선택해 주세요.");
  const result = await request(`/${encodeURIComponent(id)}/member-type`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberType }),
  });
  const user = parseUser(result?.user);
  if (user.id !== id) throw new Error("변경한 회원을 확인하지 못했어요. 목록을 다시 불러와 주세요.");
  return user;
}

export function adminUserDate(user: AdminUser) {
  const timestamp = user.registeredAt ?? user.createdAt;
  return { label: user.registeredAt === null ? "계정 생성일" : "가입일", timestamp,
    text: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp) };
}
