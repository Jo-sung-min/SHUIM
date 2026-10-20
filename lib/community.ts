"use client";

/**
 * 외침(커뮤니티) + 위로 피드 데이터 계층.
 * 지금은 localStorage 프로토타입이지만, 함수 시그니처는 서버 API로 바꿔 끼울 수 있게 맞춰 두었다.
 * - 글/댓글/피드에는 "좋아요"가 없고 "힘내요"만 있다.
 * - 위로가 아닌 내용은 신고할 수 있고, 신고가 REPORT_THRESHOLD(5)번 쌓이면 관리자 검토 대기열에 올라간다.
 * - 관리자는 검토 대기열에서 내용을 숨기거나 작성자를 차단할 수 있다. 차단된 유저의 글·댓글·피드는 숨겨지고 글을 쓸 수 없다.
 * - 위로 피드: 크리에이터가 올리는 짧은 위로글을 쇼츠처럼 세로로 넘겨 본다. 글을 올리면 누구나 크리에이터가 된다.
 */

import { COMMUNITY_KEY, addDays, loadNotifSeen, readShared as read, todayKey, uid, writeShared as write } from "./storage";

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

/** 위로 피드 배경 스타일 수 (CSS .reel.bg-0 ~ bg-N) */
export const FEED_BG_COUNT = 6;
export const FEED_BG_LABELS = ["먹", "안개", "새벽", "밤하늘", "종이", "노을"];

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

export interface Creator {
  bio: string;
  followers: string[]; // userId 목록
  since: number;
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
  postId: string; // Post.id 또는 FeedPost.id
}

export interface FeedPost extends Base {
  title?: string;
  bg: number; // 0 ~ FEED_BG_COUNT-1
  image?: string; // 배경 그림 (public 경로 또는 URL). 있으면 bg 위에 덮음
  saves: string[]; // 저장한 userId 목록
}

/** 기본 제공 그림 (public/feed). 글을 올릴 때 고를 수 있다. */
export const FEED_IMAGES: { src: string; label: string; dark: boolean }[] = [
  { src: "/feed/moon-wave.svg", label: "달과 파도", dark: true },
  { src: "/feed/mountain-fog.svg", label: "안개 낀 산", dark: false },
  { src: "/feed/rain-window.svg", label: "비 오는 창", dark: true },
  { src: "/feed/dawn-stars.svg", label: "새벽 별", dark: true },
  { src: "/feed/one-tree.svg", label: "나무 한 그루", dark: false },
];

/* ---------- 불행 랭킹 · 주간 집계 테이블 · 불행 모금 ---------- */

export interface Donation {
  id: string;
  by: string; // userId
  amount: number; // 원 (프로토타입: 실제 결제 없음)
  message?: string;
  at: number;
}

export interface RankRow {
  rank: number;
  userId: string;
  nick: string;
  cheers: number; // 그 주 불행 털어내기 글에 받은 힘내요 합
  posts: number;
  topPostId: string;
  topPostText: string;
  share: number; // 분배 비율 % (1~10위만, 그 외 0)
  payout: number; // 분배 금액 (원)
}

/** 한 주의 집계 결과. 화면은 원본 글을 다시 훑지 않고 이 테이블만 읽는다. */
export interface WeeklyBatch {
  week: string; // 월요일 날짜 키 (YYYY-MM-DD)
  computedAt: number;
  finalized: boolean; // 지난 주 = 확정(다시 계산 안 함), 이번 주 = 잠정
  rows: RankRow[];
  fund: { total: number; count: number; donors: number };
}

export interface CommunityStore {
  me: User;
  users: User[];
  posts: Post[];
  comments: Comment[];
  feed: FeedPost[];
  creators: Record<string, Creator>;
  following: string[]; // 내가 팔로우한 크리에이터 userId
  donations: Donation[];
  weekly: Record<string, WeeklyBatch>; // 주간 집계 테이블 (week → batch)
}

export type TargetKind = "post" | "comment" | "feed";
export type Target = { kind: TargetKind; id: string };

/* ---------- 닉네임 ---------- */

const NICK_A = ["조용한", "느린", "따뜻한", "고요한", "작은", "흐린", "맑은", "푸른", "낮은", "깊은"];
const NICK_B = ["바람", "구름", "파도", "숲", "달", "강", "안개", "돌", "눈", "빛"];
function randomNick() {
  return `${NICK_A[Math.floor(Math.random() * NICK_A.length)]} ${NICK_B[Math.floor(Math.random() * NICK_B.length)]} ${Math.floor(Math.random() * 90) + 10}`;
}

/* ---------- 로드/세이브 ---------- */

export function loadCommunity(): CommunityStore {
  const s = read<Partial<CommunityStore> | null>(COMMUNITY_KEY, null);
  if (!s || !s.me) {
    const fresh = seedCommunity();
    write(COMMUNITY_KEY, fresh);
    return fresh;
  }
  let store: CommunityStore;
  // 이전 버전(피드 없음) 마이그레이션
  if (!s.feed) {
    const seeded = seedCommunity();
    store = {
      me: s.me,
      users: s.users ?? seeded.users,
      posts: s.posts ?? [],
      comments: [...(s.comments ?? []), ...seeded.comments.filter((c) => seeded.feed.some((f) => f.id === c.postId))],
      feed: seeded.feed,
      creators: seeded.creators,
      following: [],
      donations: seeded.donations,
      weekly: {},
    };
  } else {
    store = s as CommunityStore;
  }
  // 이전 버전(모금·주간 집계 없음) 마이그레이션: 샘플 모금과 지난주 불행 글을 보충
  if (!store.donations || !store.weekly) {
    const seeded = seedCommunity();
    store = {
      ...store,
      posts: [...store.posts, ...seeded.posts.filter((p) => !store.posts.some((x) => x.id === p.id))],
      donations: store.donations ?? seeded.donations,
      weekly: store.weekly ?? {},
    };
  }
  // 새로 추가된 샘플(피드 글·외침 글·댓글·크리에이터) 보충 (id 기준, 이미 있으면 건드리지 않음)
  {
    const seeded = seedCommunity();
    const missingFeed = seeded.feed.filter((f) => !store.feed.some((x) => x.id === f.id));
    const missingPosts = seeded.posts.filter((p) => !store.posts.some((x) => x.id === p.id));
    const missingComments = seeded.comments.filter((c) => !store.comments.some((x) => x.id === c.id));
    if (missingFeed.length || missingPosts.length || missingComments.length) {
      store = {
        ...store,
        feed: [...store.feed, ...missingFeed],
        posts: [...store.posts, ...missingPosts],
        comments: [...store.comments, ...missingComments],
        creators: { ...seeded.creators, ...store.creators },
      };
      write(COMMUNITY_KEY, store);
    }
  }
  store = simulateReplies(store);
  const ensured = ensureWeeklyBatches(store);
  if (ensured !== store || !s.feed || !s.donations || !s.weekly) write(COMMUNITY_KEY, ensured);
  return ensured;
}

/* ---------- 주간 집계 (배치) ---------- */

/** 1~10위 분배 비율(%). 합 100. */
export const RANK_SHARES = [25, 18, 14, 11, 9, 7, 6, 4, 3, 3];
const PROVISIONAL_TTL = 5 * 60 * 1000; // 이번 주 잠정 집계 갱신 주기

/** 그 시각이 속한 주의 월요일 날짜 키 */
export function weekKeyOf(ts: number): string {
  const d = new Date(ts);
  const dow = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - dow);
  return todayKey(d);
}
export const currentWeekKey = () => weekKeyOf(Date.now());
export const weekEndOf = (week: string) => addDays(week, 6);
export function weekLabel(week: string): string {
  const [, m1, d1] = week.split("-").map(Number);
  const [, m2, d2] = weekEndOf(week).split("-").map(Number);
  return `${m1}/${d1} ~ ${m2}/${d2}`;
}

/** 한 주의 불행 랭킹 + 모금 집계. 불행 털어내기 글에 받은 힘내요를 사람별로 합산. */
export function computeWeekly(s: CommunityStore, week: string, finalized: boolean): WeeklyBatch {
  const inWeek = (ts: number) => weekKeyOf(ts) === week;
  const posts = s.posts.filter((p) => p.cat === "misfortune" && inWeek(p.createdAt) && isVisible(s, p));
  const byUser = new Map<string, { cheers: number; posts: number; top: Post; first: number }>();
  for (const p of posts) {
    const cur = byUser.get(p.authorId);
    const n = p.cheers.length;
    if (!cur) byUser.set(p.authorId, { cheers: n, posts: 1, top: p, first: p.createdAt });
    else {
      cur.cheers += n;
      cur.posts += 1;
      if (n > cur.top.cheers.length) cur.top = p;
      cur.first = Math.min(cur.first, p.createdAt);
    }
  }
  const donations = (s.donations ?? []).filter((d) => inWeek(d.at));
  const total = donations.reduce((n, d) => n + d.amount, 0);
  const sorted = [...byUser.entries()].sort((a, b) => b[1].cheers - a[1].cheers || a[1].first - b[1].first).slice(0, 20);

  // 분배: 1~10위. 순위가 10명 미만이면 있는 사람끼리 비율을 다시 맞춤. 반올림 나머지는 1위에게.
  const top = sorted.slice(0, 10);
  const shareSum = RANK_SHARES.slice(0, top.length).reduce((a, b) => a + b, 0) || 1;
  let distributed = 0;
  const rows: RankRow[] = sorted.map(([userId, v], i) => {
    const share = i < 10 ? Math.round((RANK_SHARES[i] / shareSum) * 1000) / 10 : 0;
    const payout = i < 10 ? Math.floor((total * RANK_SHARES[i]) / shareSum) : 0;
    distributed += payout;
    return { rank: i + 1, userId, nick: userById(s, userId).nick, cheers: v.cheers, posts: v.posts, topPostId: v.top.id, topPostText: v.top.text.slice(0, 80), share, payout };
  });
  if (rows[0] && total > distributed) rows[0].payout += total - distributed;
  return { week, computedAt: Date.now(), finalized, rows, fund: { total, count: donations.length, donors: new Set(donations.map((d) => d.by)).size } };
}

/**
 * 배치: 지난 주는 한 번만 계산해 확정, 이번 주는 잠정 집계를 주기적으로 갱신.
 * (서버로 옮기면 월요일 0시 크론 + 캐시 테이블에 해당)
 */
export function ensureWeeklyBatches(s: CommunityStore): CommunityStore {
  const cur = currentWeekKey();
  const weeks = new Set<string>([cur]);
  for (const p of s.posts) if (p.cat === "misfortune") weeks.add(weekKeyOf(p.createdAt));
  for (const d of s.donations ?? []) weeks.add(weekKeyOf(d.at));
  const weekly = { ...(s.weekly ?? {}) };
  let changed = false;
  for (const w of weeks) {
    const b = weekly[w];
    if (w < cur) {
      if (!b || !b.finalized) {
        weekly[w] = computeWeekly(s, w, true);
        changed = true;
      }
    } else if (w === cur) {
      if (!b || b.finalized || Date.now() - b.computedAt > PROVISIONAL_TTL) {
        weekly[w] = computeWeekly(s, w, false);
        changed = true;
      }
    }
  }
  if (!changed) return s;
  const next = { ...s, weekly };
  saveCommunity(next);
  return next;
}

/** "지금 집계": 이번 주 잠정 집계를 강제로 다시 계산 */
export function refreshCurrentWeek(s: CommunityStore): CommunityStore {
  const cur = currentWeekKey();
  const next = { ...s, weekly: { ...s.weekly, [cur]: computeWeekly(s, cur, false) } };
  saveCommunity(next);
  return next;
}

export const weeklyOf = (s: CommunityStore, week: string): WeeklyBatch | undefined => s.weekly?.[week];
export const pastWeeks = (s: CommunityStore) =>
  Object.keys(s.weekly ?? {}).filter((w) => w < currentWeekKey()).sort().reverse();

/* ---------- 불행 모금 (프로토타입: 실제 결제 없음) ---------- */

export const DONATION_PRESETS = [1000, 3000, 5000, 10000];

export function donate(s: CommunityStore, amount: number, message?: string): CommunityStore {
  const amt = Math.floor(amount);
  if (!Number.isFinite(amt) || amt < 100 || amt > 1_000_000) return s;
  const d: Donation = { id: uid(), by: s.me.id, amount: amt, message: message?.trim() || undefined, at: Date.now() };
  const withDonation = { ...s, donations: [d, ...(s.donations ?? [])] };
  return refreshCurrentWeek(withDonation);
}

/** 확정된 주에서 내가 받은 분배 내역 */
export function myPayouts(s: CommunityStore): { week: string; rank: number; amount: number }[] {
  return Object.values(s.weekly ?? {})
    .filter((b) => b.finalized)
    .flatMap((b) => b.rows.filter((r) => r.userId === s.me.id && r.payout > 0).map((r) => ({ week: b.week, rank: r.rank, amount: r.payout })))
    .sort((a, b) => (a.week < b.week ? 1 : -1));
}

export const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

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

/* ---------- 공통: 대상별 패치 ---------- */

function patchTarget(s: CommunityStore, target: Target, fn: <T extends Base>(x: T) => T): CommunityStore {
  const map = <T extends Base>(list: T[]) => list.map((x) => (x.id === target.id ? fn(x) : x));
  const next =
    target.kind === "post"
      ? { ...s, posts: map(s.posts) }
      : target.kind === "comment"
      ? { ...s, comments: map(s.comments) }
      : { ...s, feed: map(s.feed) };
  saveCommunity(next);
  return next;
}

export function findTarget(s: CommunityStore, target: Target): Post | Comment | FeedPost | undefined {
  if (target.kind === "post") return s.posts.find((p) => p.id === target.id);
  if (target.kind === "comment") return s.comments.find((c) => c.id === target.id);
  return s.feed.find((f) => f.id === target.id);
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

/* ---------- 댓글 (외침 글과 피드 글 공용) ---------- */

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

/* ---------- 위로 피드 (크리에이터) ---------- */

export const isCreator = (s: CommunityStore, userId: string) => Boolean(s.creators[userId]);

export function creatorOf(s: CommunityStore, userId: string): Creator {
  return s.creators[userId] ?? { bio: "", followers: [], since: Date.now() };
}

/** 보이는 피드 글, 최신순. 팔로우한 크리에이터 글은 앞쪽에 섞이지 않고 순서 그대로 (쇼츠처럼 시간순) */
export const listFeed = (s: CommunityStore) => s.feed.filter((f) => isVisible(s, f)).sort((a, b) => b.createdAt - a.createdAt);

export function createFeedPost(s: CommunityStore, text: string, bg: number, title?: string, image?: string): CommunityStore {
  if (isBlocked(s.me)) return s;
  const t = text.trim();
  if (!t) return s;
  const img = image?.trim();
  const f: FeedPost = {
    id: uid(), authorId: s.me.id, text: t, title: title?.trim() || undefined,
    bg: Math.max(0, Math.min(FEED_BG_COUNT - 1, bg)), image: img && /^(\/|https?:\/\/)/.test(img) ? img.slice(0, 500) : undefined,
    createdAt: Date.now(), cheers: [], reports: [], saves: [],
  };
  const creators = { ...s.creators };
  if (!creators[s.me.id]) creators[s.me.id] = { bio: "", followers: [], since: Date.now() };
  const next = { ...s, feed: [f, ...s.feed], creators };
  saveCommunity(next);
  return next;
}

export function deleteFeedPost(s: CommunityStore, id: string): CommunityStore {
  const next = { ...s, feed: s.feed.filter((f) => f.id !== id), comments: s.comments.filter((c) => c.postId !== id) };
  saveCommunity(next);
  return next;
}

export function updateCreatorBio(s: CommunityStore, bio: string): CommunityStore {
  const cur = creatorOf(s, s.me.id);
  const next = { ...s, creators: { ...s.creators, [s.me.id]: { ...cur, bio: bio.trim().slice(0, 80) } } };
  saveCommunity(next);
  return next;
}

export function toggleFollow(s: CommunityStore, creatorId: string): CommunityStore {
  if (creatorId === s.me.id) return s;
  const following = s.following.includes(creatorId) ? s.following.filter((x) => x !== creatorId) : [...s.following, creatorId];
  const cur = creatorOf(s, creatorId);
  const followers = following.includes(creatorId) ? Array.from(new Set([...cur.followers, s.me.id])) : cur.followers.filter((x) => x !== s.me.id);
  const next = { ...s, following, creators: { ...s.creators, [creatorId]: { ...cur, followers } } };
  saveCommunity(next);
  return next;
}

export function toggleSave(s: CommunityStore, feedId: string): CommunityStore {
  const me = s.me.id;
  const next = {
    ...s,
    feed: s.feed.map((f) => (f.id === feedId ? { ...f, saves: f.saves.includes(me) ? f.saves.filter((x) => x !== me) : [...f.saves, me] } : f)),
  };
  saveCommunity(next);
  return next;
}

/* ---------- 힘내요 ---------- */

export function toggleCheer(s: CommunityStore, target: Target): CommunityStore {
  const me = s.me.id;
  return patchTarget(s, target, (x) => ({
    ...x,
    cheers: x.cheers.includes(me) ? x.cheers.filter((u) => u !== me) : [...x.cheers, me],
  }));
}

/* ---------- 신고 ---------- */

export function hasReported(s: CommunityStore, item: Base) {
  return activeReports(item).some((r) => r.by === s.me.id);
}

export function report(s: CommunityStore, target: Target, reason: ReportReason): CommunityStore {
  const me = s.me.id;
  return patchTarget(s, target, (x) =>
    activeReports(x).some((r) => r.by === me) ? x : { ...x, reports: [...x.reports, { by: me, reason, at: Date.now() }] }
  );
}

/* ---------- 알림: 내 글의 새 댓글, 내가 댓글 단 글의 새 댓글 ---------- */

export interface Notification {
  id: string; // 댓글 id
  kind: "comment_on_post" | "reply_on_thread";
  postKind: "post" | "feed";
  postId: string;
  postText: string;
  actorId: string;
  actorNick: string;
  text: string;
  at: number;
  read: boolean;
}

export function listNotifications(s: CommunityStore, seenAt = loadNotifSeen()): Notification[] {
  const me = s.me.id;
  const out: Notification[] = [];
  const postOf = (id: string): { kind: "post" | "feed"; text: string; authorId: string } | null => {
    const p = s.posts.find((x) => x.id === id);
    if (p) return { kind: "post", text: p.text, authorId: p.authorId };
    const f = s.feed.find((x) => x.id === id);
    if (f) return { kind: "feed", text: f.title ? `${f.title} · ${f.text}` : f.text, authorId: f.authorId };
    return null;
  };
  // 내가 댓글 단 글: 글별 내 첫 댓글 시각
  const myFirstComment = new Map<string, number>();
  for (const c of s.comments) if (c.authorId === me) myFirstComment.set(c.postId, Math.min(c.createdAt, myFirstComment.get(c.postId) ?? Infinity));
  for (const c of s.comments) {
    if (c.authorId === me || !isVisible(s, c)) continue;
    const p = postOf(c.postId);
    if (!p) continue;
    if (p.authorId === me) {
      out.push({ id: c.id, kind: "comment_on_post", postKind: p.kind, postId: c.postId, postText: p.text, actorId: c.authorId, actorNick: userById(s, c.authorId).nick, text: c.text, at: c.createdAt, read: c.createdAt <= seenAt });
    } else {
      const mine = myFirstComment.get(c.postId);
      if (mine !== undefined && c.createdAt > mine) {
        out.push({ id: c.id, kind: "reply_on_thread", postKind: p.kind, postId: c.postId, postText: p.text, actorId: c.authorId, actorNick: userById(s, c.authorId).nick, text: c.text, at: c.createdAt, read: c.createdAt <= seenAt });
      }
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 50);
}

export const unreadCount = (s: CommunityStore) => listNotifications(s).filter((n) => !n.read).length;

/* ---------- 프로토타입: 샘플 유저가 잠시 후 위로 댓글을 남김 (서버가 생기면 삭제) ---------- */

const REPLY_POOL = [
  "그 말을 여기 적어둔 것만으로도 오늘 한 걸음이에요.",
  "저도 비슷한 날이 있었어요. 지나가더라고요. 지금은 그냥 지나가는 중이에요.",
  "힘내라는 말 대신, 오늘은 그냥 여기 있어줘서 고마워요.",
  "읽고 한참 멈춰 있었어요. 혼자 아니에요.",
  "오늘 밤은 아무것도 결정하지 말고 그냥 자요. 내일의 당신이 알아서 할 거예요.",
  "이렇게 솔직하게 쓰는 사람은 이미 반은 괜찮아지는 중이에요.",
];
const THREAD_REPLY_POOL = [
  "댓글 읽고 저도 힘이 났어요. 고마워요.",
  "그 말 덕분에 오늘 조금 괜찮아졌어요.",
  "저장해 두고 다시 읽을게요.",
  "맞아요, 그렇게 생각하니 좀 가벼워지네요.",
];
const SIM_DELAY = 30 * 1000; // 내 글·댓글이 올라간 뒤 이 시간이 지나면 답글이 달림

export function simulateReplies(s: CommunityStore): CommunityStore {
  const me = s.me.id;
  const now = Date.now();
  const samples = s.users.filter((u) => !isBlocked(u));
  if (!samples.length) return s;
  const pick = <T,>(arr: T[], seed: string) => arr[seed.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0) % arr.length];
  const added: Comment[] = [];
  // 1) 내가 쓴 외침 글에 샘플 유저의 위로 댓글 (글마다 1개)
  for (const p of s.posts) {
    if (p.authorId !== me || p.hidden || now - p.createdAt < SIM_DELAY) continue;
    const hasOther = s.comments.some((c) => c.postId === p.id && c.authorId !== me);
    if (hasOther) continue;
    const actor = pick(samples, p.id);
    added.push({ id: `sim-${p.id}`, postId: p.id, authorId: actor.id, text: pick(REPLY_POOL, p.id + actor.id), createdAt: now, cheers: [], reports: [] });
  }
  // 2) 내가 댓글 단 남의 글에 답글 (글마다 1개, 내 댓글 이후)
  for (const c of s.comments) {
    if (c.authorId !== me || now - c.createdAt < SIM_DELAY) continue;
    const owner = s.posts.find((p) => p.id === c.postId)?.authorId ?? s.feed.find((f) => f.id === c.postId)?.authorId;
    if (!owner || owner === me) continue;
    const already = s.comments.some((x) => x.postId === c.postId && x.authorId !== me && x.createdAt > c.createdAt) || added.some((x) => x.postId === c.postId);
    if (already) continue;
    const actor = s.users.find((u) => u.id === owner && !isBlocked(u)) ?? pick(samples, c.id);
    added.push({ id: `sim-${c.id}`, postId: c.postId, authorId: actor.id, text: pick(THREAD_REPLY_POOL, c.id), createdAt: now, cheers: [], reports: [] });
  }
  if (!added.length) return s;
  const next = { ...s, comments: [...s.comments, ...added] };
  saveCommunity(next);
  return next;
}

/* ---------- 관리자 ---------- */

export interface FlaggedItem {
  target: Target;
  item: Post | Comment | FeedPost;
  author: User;
  reports: Report[];
  postText?: string; // 댓글이면 원글 요약
}

export function listFlagged(s: CommunityStore): FlaggedItem[] {
  const out: FlaggedItem[] = [];
  const ok = (item: Base) => isFlagged(item) && !isBlocked(userById(s, item.authorId));
  for (const p of s.posts ?? []) if (ok(p)) out.push({ target: { kind: "post", id: p.id }, item: p, author: userById(s, p.authorId), reports: activeReports(p) });
  for (const f of s.feed ?? []) if (ok(f)) out.push({ target: { kind: "feed", id: f.id }, item: f, author: userById(s, f.authorId), reports: activeReports(f) });
  for (const c of s.comments ?? [])
    if (ok(c))
      out.push({
        target: { kind: "comment", id: c.id },
        item: c,
        author: userById(s, c.authorId),
        reports: activeReports(c),
        postText: (s.posts.find((p) => p.id === c.postId) ?? s.feed.find((f) => f.id === c.postId))?.text,
      });
  return out.sort((a, b) => b.reports.length - a.reports.length || b.item.createdAt - a.item.createdAt);
}

export const adminHide = (s: CommunityStore, target: Target) => patchTarget(s, target, (x) => ({ ...x, hidden: true }));

/** "문제 없음": 지금까지의 신고를 검토 완료로 처리 (피드에 계속 보임) */
export const adminDismiss = (s: CommunityStore, target: Target) => patchTarget(s, target, (x) => ({ ...x, reviewedAt: Date.now() }));

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
  const F = (id: string, authorId: string, bg: number, text: string, ago: number, cheers: string[] = [], saves: string[] = [], title?: string): FeedPost => ({
    id, authorId, bg, text, title, createdAt: t - ago, cheers, reports: [], saves,
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
    // 이번 주 불행 털어내기 (랭킹용)
    P("p8", "misfortune", "u4", "월세 올려달래요. 15만원. 이직도 안 됐는데. 집에 와서 통장 보고 그냥 누웠어요.", 20 * H, ["u1", "u2", "u3", "u5", "u6", "u7"]),
    P("p9", "misfortune", "u6", "엄마 검사 결과가 안 좋대요. 회사에선 티도 못 내고 하루 종일 웃었어요.", 28 * H, ["u1", "u2", "u3", "u4", "u5", "u7", "me"]),
    P("p10", "misfortune", "u3", "5년 사귄 사람이랑 헤어졌어요. 짐 정리하다가 같이 산 컵을 버릴지 말지 30분 고민했어요.", 40 * H, ["u1", "u2", "u5"]),
    // 지난주 불행 털어내기 (확정 집계용)
    P("p11", "misfortune", "u5", "아빠 장례 치르고 첫 출근. 아무도 모르고, 저도 아무 말 안 했어요.", 8 * 24 * H, ["u1", "u2", "u3", "u4", "u6", "u7", "me"]),
    P("p12", "misfortune", "u1", "전 회사에서 받을 돈 못 받았어요. 노동청 가는 길에 비 맞았고요.", 9 * 24 * H, ["u2", "u3", "u4", "u5"]),
    P("p13", "misfortune", "u6", "강아지가 떠났어요. 12년. 집에 오면 아직 현관에서 기다리는 것 같아요.", 10 * 24 * H, ["u1", "u2", "u3", "u4", "u5", "u7"]),
    P("p14", "misfortune", "u4", "통장에 4만원. 월급은 열흘 뒤. 라면을 샀는데 계산대에서 카드가 안 됐어요.", 11 * 24 * H, ["u2", "u3"]),
    // 내가 쓴 글 (알림 샘플용)
    P("p15", "misfortune", "me", "오늘 주식 수익 50%인데 1년 전 '100%면 팔자'고 적어둔 메모가 자꾸 생각나요. 팔지도 못하고 들고 있지도 못하겠어요.", 3 * H, ["u2", "u3", "u5"]),
  ];
  const donations: Donation[] = [
    { id: "d1", by: "u2", amount: 5000, message: "지난주 글 읽고 울었어요. 조금이라도.", at: t - 6 * H },
    { id: "d2", by: "u3", amount: 3000, at: t - 18 * H },
    { id: "d3", by: "u7", amount: 10000, message: "다들 버텨요.", at: t - 30 * H },
    { id: "d4", by: "u1", amount: 1000, at: t - 44 * H },
    { id: "d5", by: "u2", amount: 10000, message: "장례 치르고 출근하신 분께.", at: t - 8 * 24 * H },
    { id: "d6", by: "u3", amount: 5000, at: t - 9 * 24 * H },
    { id: "d7", by: "u5", amount: 3000, at: t - 10 * 24 * H },
    { id: "d8", by: "u6", amount: 20000, message: "강아지 보내신 분, 저도 작년에.", at: t - 10 * 24 * H },
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
    // 내 글 p15에 달린 위로 댓글 (알림 샘플)
    C("c_me1", "p15", "u2", "1년 전의 당신이 오늘의 당신을 위해 써둔 메모잖아요. 그 사람 말을 한 번만 들어봐요.", 2 * H, ["u3", "u5"]),
    C("c_me2", "p15", "u6", "팔든 안 팔든, 앱을 닫고 산책 한 번 다녀와서 정해도 늦지 않아요.", 1 * H, ["u2"]),
    // 내가 p3에 남긴 댓글과 그 뒤에 달린 답글 (알림 샘플)
    C("c_me3", "p3", "me", "3주 만의 30분, 저도 오늘 20분 걸었어요. 같이 가요.", 5 * H, ["u2"]),
    C("c_me4", "p3", "u2", "같이 가요. 내일은 25분 어때요.", 4 * H, ["me"]),
    // 피드 댓글
    C("fc1", "f1", "u1", "이 글 보고 오늘 처음으로 울었어요. 고마워요.", 1.2 * H, ["u2", "u4"]),
    C("fc2", "f1", "u5", "저장해두고 매일 아침 읽을게요.", 0.9 * H, ["u2"]),
    C("fc3", "f3", "u4", "숫자를 안 보는 연습, 저도 같이 할게요.", 8 * H, ["u3"]),
  ];
  const feed: FeedPost[] = [
    F("f1", "u2", 0, "떨어진 날은\n내가 모자란 날이 아니라\n내가 거기까지 걸어간 날이에요.\n\n3차까지 간 사람은\n3차까지 걸어간 사람이에요.", 1.5 * H, ["u1", "u3", "u4", "u5", "u6"], ["u1", "u5"], "떨어진 날에게"),
    F("f2", "u3", 2, "불안은 미래를 재는 자예요.\n자를 내려놓으면\n오늘 한 걸음만 남아요.\n\n오늘은 그 한 걸음만 봐요.", 4 * H, ["u1", "u2", "u5"], ["u4"], "자를 내려놓기"),
    F("f3", "u2", 3, "주식창을 열지 않은 하루는\n아무 일도 없던 하루가 아니라\n나를 지킨 하루예요.", 9 * H, ["u1", "u4", "u6"], ["u1"], undefined),
    F("f4", "u5", 1, "잠이 안 오는 밤엔\n잠을 쫓지 말고\n숨만 세어요.\n넷 들이쉬고, 여섯 내쉬고.\n\n잠은 오지 않아도\n심장은 느려져요.", 15 * H, ["u3", "u6"], ["u6"], "잠이 안 오는 밤"),
    F("f5", "u3", 4, "괜히 짜증낸 날,\n미안하다는 말은\n두 글자면 충분해요.\n\n길게 쓰려다 못 보내는 것보다\n두 글자가 먼저예요.", 27 * H, ["u1", "u2", "u4"], [], undefined),
    F("f6", "u2", 5, "오늘 30분 걸은 사람에게.\n\n3주 만의 30분은\n30분이 아니라 3주예요.", 31 * H, ["u1", "u3", "u4", "u5", "u6", "u7"], ["u3", "u5"], "작은 승리에게"),
    // 그림이 있는 위로 시 5편
    { ...F("f7", "u3", 3, "달은 매일 조금씩 사라지고\n매일 조금씩 돌아와요.\n\n오늘 반쯤 깎인 당신도\n사라지는 중이 아니라\n돌아오는 중이에요.", 36 * H, ["u1", "u2", "u4", "u5", "u6", "u7", "me"], ["u1", "u4"], "반달에게"), image: "/feed/moon-wave.svg" },
    { ...F("f8", "u2", 1, "안개는 산을 지우지 않아요.\n잠깐 가릴 뿐.\n\n길이 안 보이는 아침에도\n산은 거기 그대로 있어요.\n당신이 걸어온 길도요.", 44 * H, ["u1", "u3", "u5", "u6"], ["u5"], "안개 낀 아침"), image: "/feed/mountain-fog.svg" },
    { ...F("f9", "u5", 0, "비 오는 날 창가에 앉아\n아무것도 안 해도 돼요.\n\n빗방울은 유리를 타고\n알아서 내려가요.\n오늘 눈물도 그렇게 두세요.", 52 * H, ["u2", "u3", "u4", "u7"], ["u2", "u3"], "창가에서"), image: "/feed/rain-window.svg" },
    { ...F("f10", "u1", 3, "가장 어두운 건\n새벽 네 시예요.\n\n그 시간을 지나본 사람만\n하늘이 보라색으로\n변하는 걸 알아요.\n\n조금만 더 깨어 있어요.\n곧 보여요.", 60 * H, ["u2", "u3", "u4", "u5", "u6"], ["u3", "u6"], "새벽 네 시"), image: "/feed/dawn-stars.svg" },
    { ...F("f11", "u4", 4, "나무는 잎을 떨어뜨린 걸\n실패라고 부르지 않아요.\n\n내려놓은 만큼\n뿌리를 깊게 내릴 뿐.\n\n올해 많이 떨어뜨린 당신,\n지금 뿌리를 내리는 중이에요.", 70 * H, ["u1", "u2", "u3", "u5", "u6", "u7"], ["u2", "u7"], "잎을 떨어뜨린 나무"), image: "/feed/one-tree.svg" },
    // 동기부여 · 위로 글 5편
    F("f12", "u2", 0, "어제의 나를 이기려 하지 말고\n어제의 나를 데리고 가요.\n\n그 사람도 오늘까지 오느라\n애썼으니까.", 80 * H, ["u1", "u3", "u4", "u5"], ["u1"], "어제의 나에게"),
    F("f13", "u5", 2, "시작이 반이라는 말은 틀렸어요.\n시작은 시작이에요.\n\n대신 그 시작을\n오늘 한 번 더 하면\n그게 반이에요.", 92 * H, ["u2", "u3", "u6", "u7"], ["u4"], "두 번째 시작"),
    F("f14", "u3", 5, "잘하고 있냐고 묻지 말고\n하고 있냐고 물어요.\n\n하고 있으면\n잘은 나중에 따라와요.", 100 * H, ["u1", "u2", "u4", "u5", "u6"], ["u1", "u2"], "하고 있나요"),
    F("f15", "u1", 1, "오늘 아무것도 못 한 날엔\n숨을 쉰 걸로 해요.\n\n그것도 하루치 일이에요.\n몸은 알아요.", 110 * H, ["u2", "u3", "u4", "u6", "u7"], ["u3"], "아무것도 못 한 날"),
    F("f16", "u4", 3, "불안은 미래에서 빌려온 고통이에요.\n이자가 비싸요.\n\n오늘 갚을 건\n오늘 몫만.", 120 * H, ["u1", "u2", "u3", "u5", "u6", "u7"], ["u2", "u5", "u6"], "오늘 몫만"),
  ];
  const creators: Record<string, Creator> = {
    u2: { bio: "떨어진 날의 사람들에게 쓰는 짧은 글", followers: ["u1", "u3", "u4", "u5", "u6"], since: t - 40 * 24 * H },
    u3: { bio: "불안을 작게 만드는 문장들", followers: ["u1", "u2", "u5"], since: t - 25 * 24 * H },
    u5: { bio: "잠 못 드는 밤을 위한 글", followers: ["u2", "u6"], since: t - 12 * 24 * H },
    u1: { bio: "새벽에 쓰는 시", followers: ["u2", "u3", "u4"], since: t - 20 * 24 * H },
    u4: { bio: "떨어뜨린 것들에 대하여", followers: ["u1", "u5", "u6"], since: t - 15 * 24 * H },
  };
  return { me, users, posts, comments, feed, creators, following: [], donations, weekly: {} };
}

export function resetCommunity(): CommunityStore {
  const s = ensureWeeklyBatches(seedCommunity());
  saveCommunity(s);
  return s;
}
