"use client";
import { requireCommunityConsent } from "./consent";

/** 프로필·메시지 클라이언트 (서버 API 호출) */

/** 위로 배지: 이름과 한 줄 설명만 (얻는 조건의 횟수는 어디에도 보이지 않는다) */
export interface EarnedBadge { id: string; name: string; desc: string; earnedAt: number }
export interface BadgeDef { id: string; name: string; desc: string }

/**
 * 공개 프로필. 리스너 = 나를 듣는 사람(예전 팔로워), 리스닝 = 내가 듣는 사람(예전 팔로잉).
 * stats.followers = 리스너 수, stats.following = 리스닝 수 (서버 필드 이름은 그대로)
 */
export interface PublicProfile {
  id: string;
  nick: string;
  avatarUrl: string | null;
  bio: string;
  isCreator: boolean;
  creatorBio: string;
  blocked: boolean;
  createdAt: number;
  stats: { followers: number; following: number; feedPosts: number; shoutPosts: number };
  /** 보는 사람이 이 사람을 리스닝 중 */
  isFollowing: boolean;
  /** 이 사람이 보는 사람을 리스닝 중 (서로 리스닝 표시) */
  followsMe: boolean;
  /** 대표 칭호 (없으면 빠진다) */
  title?: string;
  badges: EarnedBadge[];
}
export interface MyProfile extends PublicProfile {
  name: string;
  phone: string;
  email: string | null;
  /** 칭호로 고른 배지 id */
  titleBadge?: string;
  /** 아직 축하 시트를 보지 않은 새 배지 */
  newBadges: EarnedBadge[];
  /** 배지 전체 (내 선반에 아직 못 얻은 배지를 흐리게) */
  badgeCatalog: BadgeDef[];
}
export interface ProfileFeedItem { id: string; title?: string; text: string; bg: number; image?: string; cheers: number; createdAt: number }
export interface ProfileComment { id: string; postKind: "post" | "feed"; postId: string; postSnippet: string; text: string; cheers: number; createdAt: number }
export interface ProfilePage {
  profile: PublicProfile;
  isMe: boolean;
  feed: ProfileFeedItem[];
  shout: { id: string; cat: string; text: string; cheers: number; createdAt: number }[];
  /** 내 위로: 이 사람이 남긴 위로 댓글 (원글은 앞부분만) */
  comments: ProfileComment[];
  /** 저장함: 본인일 때만 */
  saved?: ProfileFeedItem[];
}
export interface ListUser { id: string; nick: string; avatarUrl: string | null; title?: string; viewerListens: boolean; listensToViewer: boolean }
export interface PeoplePage { users: ListUser[]; hasMore: boolean; nextOffset: number }
export interface ServerNotification {
  id: string;
  kind: "comment_on_post" | "reply_on_thread" | "reply_to_comment";
  postKind: "post" | "feed";
  postId: string;
  postText: string;
  actorId: string;
  actorNick: string;
  text: string;
  at: number;
  read: boolean;
}
export interface ConversationSummary {
  id: string;
  other: { id: string; nick: string; avatarUrl: string | null; blocked: boolean };
  lastText: string | null;
  lastAt: number | null;
  lastFromMe: boolean;
  unread: number;
}
export interface Message {
  id: string;
  senderId: string;
  text: string;
  at: number;
  readAt: number | null;
}
export interface Thread {
  otherId: string;
  other: { id: string; nick: string; avatarUrl: string | null };
  messages: Message[];
}

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

export const fetchMyProfile = () => fetch("/api/profile", opts("GET")).then((r) => j<MyProfile>(r));
export const updateMyProfile = async (input: { nick?: string; bio?: string; avatarUrl?: string | null; name?: string; phone?: string; titleBadge?: string }) => {
  await requireCommunityConsent();
  return fetch("/api/profile", opts("PUT", input)).then((r) => j<MyProfile>(r));
};
export const fetchProfilePage = (id: string) => fetch(`/api/profile/${encodeURIComponent(id)}`, opts("GET")).then((r) => j<ProfilePage>(r));
/** 리스너(나를 듣는 사람) 또는 리스닝(내가 듣는 사람) 목록, 50명씩 */
export const fetchPeople = (id: string, kind: "listeners" | "listening", offset = 0) =>
  fetch(`/api/profile/${encodeURIComponent(id)}/${kind}?offset=${offset}`, opts("GET")).then((r) => j<PeoplePage>(r));
/** 새 배지 축하 시트를 봤다 (실패해도 다음에 다시 보일 뿐) */
export const markBadgesSeen = () => fetch("/api/profile/badges/seen", opts("POST", {})).then((r) => j<{ ok: boolean }>(r)).catch(() => ({ ok: false }));
/** 알림 (서버가 최근 50개만 계산해 준다). seenAt = 이 기기에서 마지막으로 알림을 본 시각 */
export const fetchNotifications = (seenAt: number) =>
  fetch(`/api/notifications?seenAt=${Math.max(0, Math.floor(seenAt))}`, opts("GET")).then((r) => j<{ items: ServerNotification[]; unread: number }>(r));

export const fetchConversations = () => fetch("/api/messages", opts("GET")).then((r) => j<{ conversations: ConversationSummary[]; unread: number }>(r));
export const fetchThread = (id: string, after?: number) =>
  fetch(`/api/messages/${encodeURIComponent(id)}${after ? `?after=${after}` : ""}`, opts("GET")).then((r) => j<Thread>(r));
export const sendMessage = async (toUserId: string, text: string) => {
  await requireCommunityConsent();
  return fetch("/api/messages", opts("POST", { toUserId, text })).then((r) => j<{ conversationId: string; message: Message }>(r));
};
export const markThreadRead = (id: string) => fetch(`/api/messages/${encodeURIComponent(id)}`, opts("POST", {})).then((r) => j<{ ok: boolean }>(r));

/** 읽지 않은 메시지 수 (탭바 배지용, 실패 시 0) */
export async function unreadMessages(): Promise<number> {
  try {
    return (await fetchConversations()).unread;
  } catch {
    return 0;
  }
}
