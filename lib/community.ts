"use client";

/**
 * 외침(커뮤니티) 데이터 계층.
 * 지금은 localStorage 프로토타입이지만, 함수 시그니처는 서버 API로 바꿔 끼울 수 있게 맞춰 두었다.
 * - 글/댓글에는 "좋아요"가 없고 "힘내요"만 있다.
 * - 위로가 아닌 내용은 신고할 수 있고, 신고가 REPORT_THRESHOLD(5)번 쌓이면 관리자 검토 대기열에 올라간다.
 * - 관리자는 검토 대기열에서 글을 숨기거나 작성자를 차단할 수 있다. 차단된 유저의 글·댓글은 숨겨지고 글을 쓸 수 없다.
 */

import { COMMUNITY_KEY, read, uid, write } from "./storage";

export type ShoutCat = "misfortune" | "anxiety" | "money" | "work" | "relation" | "body" | "small-win" | "free";

export interface ShoutCategory {
  id: ShoutCat;
  label: string;
  emoji: string;
  desc: string;
  placeholder: string;
}

export const SHOUT_CATEGORIES: ShoutCategory[] = [
  { id: "misfortune", label: "불행 털어내기", emoji: "🌧️", desc: "오늘 내 불행을 글로 털어내면, 사람들이 위로를 남겨요", placeholder: "오늘 무슨 일이 있었나요. 그냥 털어놔도 돼요." },
  { id: "anxiety", label: "불안 내려놓기", emoji: "🫧", desc: "막연한 불안을 적어두면 조금 작아져요", placeholder: "지금 무엇이 불안한가요." },
  { id: "money", label: "돈 걱정", emoji: "💸", desc: "주식, 전세, 지출… 숫자 때문에 흔들린 마음", placeholder: "돈 때문에 흔들린 이야기." },
  { id: "work", label: "일·커리어", emoji: "💼", desc: "회사, 이직, 사이드 프로젝트", placeholder: "일 이야기, 편하게." },
  { id: "relation", label: "관계", emoji: "🤝", desc: "연인, 가족, 친구와의 일", placeholder: "누구와 어떤 일이 있었나요." },
  { id: "body", label: "몸·잠", emoji: "🌙", desc: "잠, 떨림, 식사, 몸의 신호", placeholder: "몸이 보내는 신호를 적어요." },
  { id: "small-win", label: "작은 승리", emoji: "🌱", desc: "오늘 해낸 아주 작은 것. 서로 힘내요를 보내요", placeholder: "오늘 해낸 작은 것 하나." },
  { id: "free", label: "자유", emoji: "💬", desc: "무엇이든", placeholder: "아무 말이나 외쳐도 돼요." },
];

export const shoutCatById = (id: ShoutCat) => SHOUT_CATEGORIES.find((c) => c.id === id) ?? SHOUT_CATEGORIES[SHOUT_CATEGORIES.length - 1];

export type ReportReason = "not_comfort" | "abuse" | "spam" | "other";
export const REPORT_REASONS: { id: ReportReason; label: string; desc: string }[] = [
  { id: "not_comfort", label: "위로가 아니에요", desc: "비난, 훈계, 조롱 등 위로와 거리가 먼 내용" },
  { id: "abuse", label: "욕설·혐오", desc: "욕설, 혐오 표현, 괴롭힘" },
  { id: "spam", label: "광고·도배", desc: "홍보, 반복 게시" },
  { id: "other", label: "기타", desc: "그 밖의 이유" },
];

export const REPORT_THRESHOLD = 5;

export interface Report {
  by: string; // userId
  reason: ReportReason;
  at: number;
}

export interface User {
  id: string;
  nick: string;
  blockedAt?: number;
  blockedReason?: string;
}

interface Base {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  cheers: string[]; // 힘내요 보낸 userId 목록
  reports: Report[];
  hidden?: boolean; // 관리자가 숨김
  reviewedAt?: number; // 관리자가 "문제 없음" 처리한 시각 (이후 신고는 다시 셈)
}

export interface Post extends Base {
  cat: ShoutCat;
}

export interface Comment extends Base {
  postId: string;
}

export interface CommunityStore {
  me: User;
  users: User[];
  posts: Post[];
  comments: Comment[];
}

export type Target = { kind: "post"; id: string } | { kind: "comment"; id: string };

/* ---------- 닉네임 ---------- */

const NICK_A = ["조용한", "느린", "따뜻한", "고요한", "작은", "흐린", "맑은", "푸른", "낮은", "깊은"];
const NICK_B = ["바람", "구름", "파도", "숲", "달", "강", "안개", "돌", "눈", "빛"];
function randomNick() {
  return `${NICK_A[Math.floor(Math.random() * NICK_A.length)]} ${NICK_B[Math.floor(Math.random() * NICK_B.length)]} ${Math.floor(Math.random() * 90) + 10}`;
}

/* ---------- 로드/세이브 ---------- */

export function loadCommunity(): CommunityStore {
  const s = read<CommunityStore | null>(COMMUNITY_KEY, null);
  if (s) return s;
  const fresh = seedCommunity();
  write(COMMUNITY_KEY, fresh);
  return fresh;
}

export const saveCommunity = (s: CommunityStore) => write(COMMUNITY_KEY, s);

export function userById(s: CommunityStore, id: string): User {
  if (s.me.id === id) return s.me;
  return s.users.find((u) => u.id === id) ?? { id, nick: "익명" };
}

export const isBlocked = (u: User) => Boolean(u.blockedAt);

/** 활성 신고 수 (관리자가 "문제 없음" 처리한 이후의 신고만) */
export function activeReports(item: Base): Report[] {
  return item.reports.filter((r) => !item.reviewedAt || r.at > item.reviewedAt);
}

/** 신고 누적으로 관리자 검토 대기 중인가 */
export const isFlagged = (item: Base) => !item.hidden && activeReports(item).length >= REPORT_THRESHOLD;

/** 피드에 보여도 되는가 (숨김·차단 유저 제외) */
export function isVisible(s: CommunityStore, item: Base): boolean {
  if (item.hidden) return false;
  return !isBlocked(userById(s, item.authorId));
}

/* ---------- 글 ---------- */

export function createPost(s: CommunityStore, cat: ShoutCat, text: string): CommunityStore {
  if (isBlocked(s.me)) return s;
  const t = text.trim();
  if (!t) return s;
  const post: Post = { id: uid(), cat, text: t, authorId: s.me.id, createdAt: Date.now(), cheers: [], reports: [] };
  const next = { ...s, posts: [post, ...s.posts] };
  saveCommunity(next);
  return next;
}

export function deletePost(s: CommunityStore, id: string): CommunityStore {
  const next = { ...s, posts: s.posts.filter((p) => p.id !== id), comments: s.comments.filter((c) => c.postId !== id) };
  saveCommunity(next);
  return next;
}

/* ---------- 댓글 ---------- */

export function addComment(s: CommunityStore, postId: string, text: string): CommunityStore {
  if (isBlocked(s.me)) return s;
  const t = text.trim();
  if (!t) return s;
  const c: Comment = { id: uid(), postId, text: t, authorId: s.me.id, createdAt: Date.now(), cheers: [], reports: [] };
  const next = { ...s, comments: [...s.comments, c] };
  saveCommunity(next);
  return next;
}

export function deleteComment(s: CommunityStore, id: string): CommunityStore {
  const next = { ...s, comments: s.comments.filter((c) => c.id !== id) };
  saveCommunity(next);
  return next;
}

export const commentsOf = (s: CommunityStore, postId: string) =>
  s.comments.filter((c) => c.postId === postId && isVisible(s, c)).sort((a, b) => a.createdAt - b.createdAt);

/* ---------- 힘내요 ---------- */

function patch<T extends Base>(list: T[], id: string, fn: (x: T) => T): T[] {
  return list.map((x) => (x.id === id ? fn(x) : x));
}

export function toggleCheer(s: CommunityStore, target: Target): CommunityStore {
  const me = s.me.id;
  const fn = <T extends Base>(x: T): T => ({
    ...x,
    cheers: x.cheers.includes(me) ? x.cheers.filter((u) => u !== me) : [...x.cheers, me],
  });
  const next =
    target.kind === "post"
      ? { ...s, posts: patch(s.posts, target.id, fn) }
      : { ...s, comments: patch(s.comments, target.id, fn) };
  saveCommunity(next);
  return next;
}

/* ---------- 신고 ---------- */

export function hasReported(s: CommunityStore, item: Base) {
  return activeReports(item).some((r) => r.by === s.me.id);
}

export function report(s: CommunityStore, target: Target, reason: ReportReason): CommunityStore {
  const me = s.me.id;
  const fn = <T extends Base>(x: T): T =>
    activeReports(x).some((r) => r.by === me) ? x : { ...x, reports: [...x.reports, { by: me, reason, at: Date.now() }] };
  const next =
    target.kind === "post"
      ? { ...s, posts: patch(s.posts, target.id, fn) }
      : { ...s, comments: patch(s.comments, target.id, fn) };
  saveCommunity(next);
  return next;
}

/* ---------- 관리자 ---------- */

export interface FlaggedItem {
  target: Target;
  item: Post | Comment;
  author: User;
  reports: Report[];
  postText?: string; // 댓글이면 원글 요약
}

export function listFlagged(s: CommunityStore): FlaggedItem[] {
  const out: FlaggedItem[] = [];
  const authorOk = (item: Base) => !isBlocked(userById(s, item.authorId));
  for (const p of s.posts) if (isFlagged(p) && authorOk(p)) out.push({ target: { kind: "post", id: p.id }, item: p, author: userById(s, p.authorId), reports: activeReports(p) });
  for (const c of s.comments)
    if (isFlagged(c) && authorOk(c))
      out.push({
        target: { kind: "comment", id: c.id },
        item: c,
        author: userById(s, c.authorId),
        reports: activeReports(c),
        postText: s.posts.find((p) => p.id === c.postId)?.text,
      });
  return out.sort((a, b) => b.reports.length - a.reports.length || b.item.createdAt - a.item.createdAt);
}

export function adminHide(s: CommunityStore, target: Target): CommunityStore {
  const fn = <T extends Base>(x: T): T => ({ ...x, hidden: true });
  const next = target.kind === "post" ? { ...s, posts: patch(s.posts, target.id, fn) } : { ...s, comments: patch(s.comments, target.id, fn) };
  saveCommunity(next);
  return next;
}

/** "문제 없음": 지금까지의 신고를 검토 완료로 처리 (피드에 계속 보임) */
export function adminDismiss(s: CommunityStore, target: Target): CommunityStore {
  const fn = <T extends Base>(x: T): T => ({ ...x, reviewedAt: Date.now() });
  const next = target.kind === "post" ? { ...s, posts: patch(s.posts, target.id, fn) } : { ...s, comments: patch(s.comments, target.id, fn) };
  saveCommunity(next);
  return next;
}

export function adminBlockUser(s: CommunityStore, userId: string, reason: string): CommunityStore {
  const mark = (u: User): User => (u.id === userId ? { ...u, blockedAt: Date.now(), blockedReason: reason } : u);
  const next = { ...s, me: mark(s.me), users: s.users.map(mark) };
  saveCommunity(next);
  return next;
}

export function adminUnblockUser(s: CommunityStore, userId: string): CommunityStore {
  const clear = (u: User): User => {
    if (u.id !== userId) return u;
    const { blockedAt: _b, blockedReason: _r, ...rest } = u;
    void _b;
    void _r;
    return rest;
  };
  const next = { ...s, me: clear(s.me), users: s.users.map(clear) };
  saveCommunity(next);
  return next;
}

export const blockedUsers = (s: CommunityStore) => [s.me, ...s.users].filter(isBlocked);

/* ---------- 샘플 (프로토타입용, 첫 진입 시 자동 생성) ---------- */

export function seedCommunity(): CommunityStore {
  const t = Date.now();
  const H = 3600000;
  const me: User = { id: "me", nick: randomNick() };
  const users: User[] = [
    { id: "u1", nick: "느린 구름 27" },
    { id: "u2", nick: "따뜻한 강 58" },
    { id: "u3", nick: "고요한 숲 13" },
    { id: "u4", nick: "흐린 달 71" },
    { id: "u5", nick: "작은 바람 40" },
    { id: "u6", nick: "낮은 돌 09" },
    { id: "u7", nick: "푸른 파도 64" },
  ];
  const P = (id: string, cat: ShoutCat, authorId: string, text: string, ago: number, cheers: string[] = [], reports: Report[] = []): Post => ({
    id, cat, authorId, text, createdAt: t - ago, cheers, reports,
  });
  const C = (id: string, postId: string, authorId: string, text: string, ago: number, cheers: string[] = [], reports: Report[] = []): Comment => ({
    id, postId, authorId, text, createdAt: t - ago, cheers, reports,
  });
  const R = (by: string, reason: ReportReason, ago: number): Report => ({ by, reason, at: t - ago });

  const posts: Post[] = [
    P("p1", "misfortune", "u1", "오늘 면접 떨어졌어요. 3차까지 갔는데. 집에 오는 길에 비까지 와서 그냥 맞고 걸었어요.", 2 * H, ["u2", "u3", "u5", "u7"]),
    P("p2", "money", "u4", "주식 또 봤어요. 안 보기로 해놓고. 보고 나서 손이 떨려서 아무것도 못 했어요.", 5 * H, ["u1", "u3"]),
    P("p3", "small-win", "u2", "오늘 30분 걸었어요. 3주 만에 처음으로. 그게 다예요.", 7 * H, ["u1", "u3", "u4", "u5", "u6", "u7"]),
    P("p4", "anxiety", "u5", "내일이 두려운 이유를 못 찾겠어요. 그냥 내일이 온다는 게 무서워요.", 11 * H, ["u2", "u3"]),
    P("p5", "relation", "u3", "엄마한테 괜히 짜증냈어요. 전화 끊고 바로 후회했는데 다시 걸 용기가 안 나요.", 26 * H, ["u1", "u2", "u4"]),
    P("p6", "body", "u6", "4일째 잠을 제대로 못 잤어요. 자려고 누우면 심장이 빨라져요.", 30 * H, ["u2", "u5"]),
    P(
      "p7", "free", "u7",
      "이런 데서 징징대봤자 뭐가 바뀜? 그냥 다들 노력을 안 하는 거임. 핑계 그만.",
      14 * H, [],
      [R("u1", "not_comfort", 13 * H), R("u2", "abuse", 12 * H), R("u3", "not_comfort", 12 * H), R("u5", "not_comfort", 10 * H), R("u6", "not_comfort", 9 * H)]
    ),
  ];
  const comments: Comment[] = [
    C("c1", "p1", "u2", "3차까지 간 건 운이 아니에요. 그 회사가 못 알아본 거지, 당신이 모자란 게 아니에요.", 1.5 * H, ["u1", "u3"]),
    C("c2", "p1", "u3", "비 맞고 걸은 거, 저도 그런 날 있었어요. 오늘은 그냥 따뜻한 물로 씻고 일찍 자요.", 1 * H, ["u1"]),
    C("c3", "p1", "u7", "그러게 준비를 더 했어야죠. 요즘 취업 쉬운데.", 0.8 * H, [], [R("u1", "not_comfort", 0.7 * H), R("u2", "not_comfort", 0.6 * H), R("u3", "abuse", 0.5 * H), R("u4", "not_comfort", 0.4 * H), R("u5", "not_comfort", 0.3 * H)]),
    C("c4", "p2", "u3", "봤다는 걸 여기 적은 것만으로도 다음엔 안 볼 확률이 올라가요. 저도 그랬어요.", 4 * H, ["u4"]),
    C("c5", "p3", "u1", "3주 만에 30분이면 엄청난 거예요. 힘내요 말고 축하해요라고 하고 싶네요.", 6 * H, ["u2"]),
    C("c6", "p4", "u2", "이유가 없어도 무서울 수 있어요. 내일이 오면 내일의 당신이 알아서 할 거예요.", 10 * H, ["u5"]),
    C("c7", "p5", "u4", "지금 '미안'이라는 두 글자만 문자로 보내도 돼요. 통화는 그다음에.", 25 * H, ["u3", "u1"]),
    C("c8", "p6", "u5", "저는 누워서 숨을 4초 들이쉬고 6초 내쉬는 걸 10번 해요. 잠이 안 와도 심장은 좀 느려져요.", 29 * H, ["u6"]),
  ];
  return { me, users, posts, comments };
}

export function resetCommunity(): CommunityStore {
  const s = seedCommunity();
  saveCommunity(s);
  return s;
}
