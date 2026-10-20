"use client";

/**
 * 커뮤니티 클라이언트. 모든 데이터는 서버(/api/community, PostgreSQL)에서 오고,
 * 변경 함수는 서버에 반영한 뒤 최신 CommunityStore 를 돌려준다.
 * 타입·순수 계산은 community-core 에 있고 여기서 그대로 다시 내보낸다.
 */
export * from "./community-core";
import type { CommunityStore, ReportReason, ShoutCat, Target } from "./community-core";
import { listNotifications } from "./community-core";
import { loadNotifSeen } from "./storage";

async function call<T = CommunityStore>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `요청 실패 (${res.status})`);
  cached = method === "GET" || isStore(json) ? (json as CommunityStore) : cached;
  return json as T;
}
const isStore = (x: unknown): x is CommunityStore => Boolean(x && typeof x === "object" && "me" in (x as object) && "posts" in (x as object));

let cached: CommunityStore | null = null;
let cachedAt = 0;
let inflight: Promise<CommunityStore> | null = null;

/** 전체 상태 읽기 (30초 캐시, force=true 면 다시 받음). 동시에 여러 곳에서 불러도 요청은 하나만 나간다(첫 방문 익명 유저 중복 생성 방지). */
export async function fetchCommunity(force = false): Promise<CommunityStore> {
  if (!force && cached && Date.now() - cachedAt < 30_000) return cached;
  if (inflight) return inflight;
  inflight = call<CommunityStore>("/api/community", undefined, "GET")
    .then((s) => {
      cachedAt = Date.now();
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
export const cachedCommunity = () => cached;

export const api = {
  createPost: (cat: ShoutCat, text: string) => call("/api/community/post.create", { cat, text }),
  deletePost: (id: string) => call("/api/community/post.delete", { id }),
  addComment: (postId: string, text: string) => call("/api/community/comment.create", { postId, text }),
  deleteComment: (id: string) => call("/api/community/comment.delete", { id }),
  toggleCheer: (t: Target) => call("/api/community/cheer", t),
  report: (t: Target, reason: ReportReason) => call("/api/community/report", { ...t, reason }),
  createFeedPost: (text: string, bg: number, title?: string, images: string[] = []) => call("/api/community/feed.create", { text, bg, title, images }),
  deleteFeedPost: (id: string) => call("/api/community/feed.delete", { id }),
  updateBio: (bio: string) => call("/api/community/bio", { bio }),
  toggleFollow: (creatorId: string) => call("/api/community/follow", { creatorId }),
  toggleSave: (feedId: string) => call("/api/community/save", { feedId }),
  donate: (amount: number, message?: string) => call("/api/community/donate", { amount, message }),
  refreshCurrentWeek: () => call("/api/community/weekly.refresh", {}),
  adminHide: (t: Target) => call("/api/community/admin.hide", t),
  adminDismiss: (t: Target) => call("/api/community/admin.dismiss", t),
  adminBlock: (userId: string, reason: string) => call("/api/community/admin.block", { userId, reason }),
  adminUnblock: (userId: string) => call("/api/community/admin.unblock", { userId }),
};

export const unreadCount = (s: CommunityStore) => listNotifications(s, loadNotifSeen()).filter((n) => !n.read).length;
