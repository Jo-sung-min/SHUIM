"use client";

/** 프로필·메시지 클라이언트 (서버 API 호출) */

export interface PublicProfile {
  id: string;
  nick: string;
  avatarUrl: string | null;
  bio: string;
  isCreator: boolean;
  creatorBio: string;
  blocked: boolean;
  createdAt: number;
  stats: { followers: number; following: number; feedPosts: number; shoutPosts: number; cheers: number };
  isFollowing: boolean;
}
export interface MyProfile extends PublicProfile {
  name: string;
  phone: string;
  email: string | null;
}
export interface ProfilePage {
  profile: PublicProfile;
  isMe: boolean;
  feed: { id: string; title?: string; text: string; bg: number; image?: string; cheers: number; createdAt: number }[];
  shout: { id: string; cat: string; text: string; cheers: number; createdAt: number }[];
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
export const updateMyProfile = (input: { nick?: string; bio?: string; avatarUrl?: string | null; name?: string; phone?: string }) =>
  fetch("/api/profile", opts("PUT", input)).then((r) => j<MyProfile>(r));
export const fetchProfilePage = (id: string) => fetch(`/api/profile/${encodeURIComponent(id)}`, opts("GET")).then((r) => j<ProfilePage>(r));

export const fetchConversations = () => fetch("/api/messages", opts("GET")).then((r) => j<{ conversations: ConversationSummary[]; unread: number }>(r));
export const fetchThread = (id: string, after?: number) =>
  fetch(`/api/messages/${encodeURIComponent(id)}${after ? `?after=${after}` : ""}`, opts("GET")).then((r) => j<Thread>(r));
export const sendMessage = (toUserId: string, text: string) =>
  fetch("/api/messages", opts("POST", { toUserId, text })).then((r) => j<{ conversationId: string; message: Message }>(r));
export const markThreadRead = (id: string) => fetch(`/api/messages/${encodeURIComponent(id)}`, opts("POST", {})).then((r) => j<{ ok: boolean }>(r));

/** 읽지 않은 메시지 수 (탭바 배지용, 실패 시 0) */
export async function unreadMessages(): Promise<number> {
  try {
    return (await fetchConversations()).unread;
  } catch {
    return 0;
  }
}
