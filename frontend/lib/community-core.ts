/**
 * 외침·위로 피드·랭킹·모금의 타입과 순수 계산 로직.
 * 서버(API 라우트)와 클라이언트가 함께 쓰므로 브라우저 전용 코드("use client", localStorage)는 두지 않는다.
 */

import { addDays, todayKey } from "./dates";
import { stripHighlights } from "./highlight";

export type ShoutCat = "misfortune" | "anxiety" | "money" | "work" | "relation" | "body" | "small-win" | "free";

export interface ShoutCategory {
  id: ShoutCat;
  /** 광장 이름 (게시판 이름처럼 "○○광장") */
  label: string;
  /** 전체 목록에서 제목 앞에 붙는 짧은 말머리 */
  head: string;
  emoji: string;
  desc: string;
  placeholder: string;
}

export const SHOUT_CATEGORIES: ShoutCategory[] = [
  { id: "misfortune", label: "불행광장", head: "불행", emoji: "🌧️", desc: "오늘 내 불행을 글로 털어내면, 사람들이 위로를 남겨요", placeholder: "오늘 무슨 일이 있었나요. 그냥 털어놔도 돼요." },
  { id: "anxiety", label: "불안광장", head: "불안", emoji: "🫧", desc: "막연한 불안을 적어두면 조금 작아져요", placeholder: "지금 무엇이 불안한가요." },
  { id: "money", label: "돈걱정광장", head: "돈걱정", emoji: "💸", desc: "주식, 전세, 지출… 숫자 때문에 흔들린 마음", placeholder: "돈 때문에 흔들린 이야기." },
  { id: "work", label: "직장광장", head: "직장", emoji: "💼", desc: "회사, 이직, 사이드 프로젝트", placeholder: "일 이야기, 편하게." },
  { id: "relation", label: "관계광장", head: "관계", emoji: "🤝", desc: "연인, 가족, 친구와의 일", placeholder: "누구와 어떤 일이 있었나요." },
  { id: "body", label: "건강광장", head: "건강", emoji: "🌙", desc: "잠, 떨림, 식사, 몸의 신호", placeholder: "몸이 보내는 신호를 적어요." },
  { id: "small-win", label: "작은승리광장", head: "작은승리", emoji: "🌱", desc: "오늘 해낸 아주 작은 것. 서로 힘내요를 보내요", placeholder: "오늘 해낸 작은 것 하나." },
  { id: "free", label: "자유광장", head: "자유", emoji: "💬", desc: "무엇이든", placeholder: "아무 말이나 외쳐도 돼요." },
];
export const SHOUT_CAT_IDS = SHOUT_CATEGORIES.map((c) => c.id);
export const shoutCatById = (id: ShoutCat) => SHOUT_CATEGORIES.find((c) => c.id === id) ?? SHOUT_CATEGORIES[SHOUT_CATEGORIES.length - 1];

export type ReportReason = "not_comfort" | "abuse" | "spam" | "other";
export const REPORT_REASONS: { id: ReportReason; label: string; desc: string }[] = [
  { id: "not_comfort", label: "위로가 아니에요", desc: "비난, 훈계, 조롱 등 위로와 거리가 먼 내용" },
  { id: "abuse", label: "욕설·혐오", desc: "욕설, 혐오 표현, 괴롭힘" },
  { id: "spam", label: "광고·도배", desc: "홍보, 반복 게시" },
  { id: "other", label: "기타", desc: "그 밖의 이유" },
];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id);
export const REPORT_THRESHOLD = 5;

export const FEED_BG_COUNT = 6;
export const FEED_BG_LABELS = ["먹", "안개", "새벽", "밤하늘", "종이", "노을"];
export const FEED_IMAGES: { src: string; label: string; dark: boolean }[] = [
  { src: "/feed/moon-wave.svg", label: "달과 파도", dark: true },
  { src: "/feed/mountain-fog.svg", label: "안개 낀 산", dark: false },
  { src: "/feed/rain-window.svg", label: "비 오는 창", dark: true },
  { src: "/feed/dawn-stars.svg", label: "새벽 별", dark: true },
  { src: "/feed/one-tree.svg", label: "나무 한 그루", dark: false },
];

export interface Report {
  by: string;
  reason: ReportReason;
  at: number;
}

export interface User {
  id: string;
  nick: string;
  role?: "admin" | "user";
  blockedAt?: number;
  blockedReason?: string;
  /** 대표 칭호 (얻은 위로 배지 이름). 닉네임 옆에 작게 */
  title?: string;
}

export interface Creator {
  bio: string;
  followers: string[];
  since: number;
}

export interface Base {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  cheers: string[];
  reports: Report[];
  hidden?: boolean;
  reviewedAt?: number;
}

export interface Post extends Base {
  cat: ShoutCat;
  /** 사진 주소 (최대 SHOUT_MAX_IMAGES 장). 옛 글은 빈 배열 */
  images?: string[];
  /** 커뮤니티 소로우에 게시된 사연이면 그 소로우 (작성자는 "c:<소로우 id>" 로 가려져 온다) */
  communityId?: string;
  /** 소로우 안의 #번호 */
  postNo?: number;
  /** 소로우 이름·주소 (화면 표시용) */
  circle?: string;
  circleSlug?: string;
}

export const SHOUT_MAX_IMAGES = 4;

export interface Comment extends Base {
  postId: string;
  /** 답글(대댓글)이면 부모 댓글 id. 한 단계만 — 답글의 답글은 같은 부모에 붙는다 */
  parentId?: string;
}

/** 피드 글 안의 콘텐츠 하나: 사진(선택) + 제목(선택) + 글. 가로로 넘기면 사진과 글이 함께 바뀐다 */
export interface FeedPage {
  image?: string;
  title?: string;
  text: string;
}

export interface FeedPost extends Base {
  title?: string; // 첫 콘텐츠 제목 (대표)
  bg: number;
  image?: string; // 첫 콘텐츠 사진 (대표)
  images: string[]; // 모든 콘텐츠 사진
  pages: FeedPage[]; // 콘텐츠 목록 (최소 1개)
  saves: string[];
}
export const FEED_MAX_IMAGES = 10;
export const FEED_MAX_PAGES = 10;

/** 글의 콘텐츠 목록 (옛 데이터는 글 하나로) */
export const pagesOf = (f: FeedPost): FeedPage[] =>
  f.pages?.length ? f.pages : [{ image: f.image, title: f.title, text: f.text }];

export interface Donation {
  id: string;
  by: string;
  amount: number;
  message?: string;
  at: number;
}

export interface RankRow {
  rank: number;
  userId: string;
  nick: string;
  cheers: number;
  posts: number;
  topPostId: string;
  topPostText: string;
  share: number;
  payout: number;
}

export interface WeeklyBatch {
  week: string;
  computedAt: number;
  finalized: boolean;
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
  following: string[];
  donations: Donation[];
  weekly: Record<string, WeeklyBatch>;
}

export type TargetKind = "post" | "comment" | "feed";
export type Target = { kind: TargetKind; id: string };

/* ---------- 닉네임 ---------- */

const NICK_A = ["조용한", "느린", "따뜻한", "고요한", "작은", "흐린", "맑은", "푸른", "낮은", "깊은"];
const NICK_B = ["바람", "구름", "파도", "숲", "달", "강", "안개", "돌", "눈", "빛"];
export function randomNick() {
  return `${NICK_A[Math.floor(Math.random() * NICK_A.length)]} ${NICK_B[Math.floor(Math.random() * NICK_B.length)]} ${Math.floor(Math.random() * 90) + 10}`;
}

/* ---------- 조회 도우미 ---------- */

export function userById(s: CommunityStore, id: string): User {
  if (s.me.id === id) return s.me;
  return s.users.find((u) => u.id === id) ?? { id, nick: "익명" };
}
export const isBlocked = (u: User) => Boolean(u.blockedAt);
export function activeReports(item: Base): Report[] {
  return item.reports.filter((r) => !item.reviewedAt || r.at > item.reviewedAt);
}
export const isFlagged = (item: Base) => !item.hidden && activeReports(item).length >= REPORT_THRESHOLD;
export function isVisible(s: CommunityStore, item: Base): boolean {
  if (item.hidden) return false;
  return !isBlocked(userById(s, item.authorId));
}
export function findTarget(s: CommunityStore, target: Target): Post | Comment | FeedPost | undefined {
  if (target.kind === "post") return s.posts.find((p) => p.id === target.id);
  if (target.kind === "comment") return s.comments.find((c) => c.id === target.id);
  return s.feed.find((f) => f.id === target.id);
}
export const commentsOf = (s: CommunityStore, postId: string) =>
  s.comments.filter((c) => c.postId === postId && isVisible(s, c)).sort((a, b) => a.createdAt - b.createdAt);
/** 글의 최상위 댓글만 (답글 제외) */
export const topCommentsOf = (s: CommunityStore, postId: string) => commentsOf(s, postId).filter((c) => !c.parentId);
/** 댓글에 달린 답글 (오래된 순) */
export const repliesOf = (s: CommunityStore, commentId: string) =>
  s.comments.filter((c) => c.parentId === commentId && isVisible(s, c)).sort((a, b) => a.createdAt - b.createdAt);
export const hasReported = (s: CommunityStore, item: Base) => activeReports(item).some((r) => r.by === s.me.id);
export const isCreator = (s: CommunityStore, userId: string) => Boolean(s.creators[userId]);
export const creatorOf = (s: CommunityStore, userId: string): Creator => s.creators[userId] ?? { bio: "", followers: [], since: Date.now() };
export const listFeed = (s: CommunityStore) => s.feed.filter((f) => isVisible(s, f)).sort((a, b) => b.createdAt - a.createdAt);
export const blockedUsers = (s: CommunityStore) => [s.me, ...s.users].filter(isBlocked);

/* ---------- 주간 집계 ---------- */

export const RANK_SHARES = [25, 18, 14, 11, 9, 7, 6, 4, 3, 3];
export const PROVISIONAL_TTL = 5 * 60 * 1000;

export function weekKeyOf(ts: number): string {
  const d = new Date(ts);
  const dow = (d.getDay() + 6) % 7;
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

/** 어떤 주를 (다시) 계산해야 하는지: [week, finalized] 목록 */
export function weeksNeedingCompute(s: CommunityStore): { week: string; finalized: boolean }[] {
  const cur = currentWeekKey();
  const weeks = new Set<string>([cur]);
  for (const p of s.posts) if (p.cat === "misfortune") weeks.add(weekKeyOf(p.createdAt));
  for (const d of s.donations ?? []) weeks.add(weekKeyOf(d.at));
  const out: { week: string; finalized: boolean }[] = [];
  for (const w of weeks) {
    const b = s.weekly?.[w];
    if (w < cur) {
      if (!b || !b.finalized) out.push({ week: w, finalized: true });
    } else if (w === cur) {
      if (!b || b.finalized || Date.now() - b.computedAt > PROVISIONAL_TTL) out.push({ week: w, finalized: false });
    }
  }
  return out;
}

export const weeklyOf = (s: CommunityStore, week: string): WeeklyBatch | undefined => s.weekly?.[week];
export const pastWeeks = (s: CommunityStore) => Object.keys(s.weekly ?? {}).filter((w) => w < currentWeekKey()).sort().reverse();
export const DONATION_PRESETS = [1000, 3000, 5000, 10000];
export function myPayouts(s: CommunityStore): { week: string; rank: number; amount: number }[] {
  return Object.values(s.weekly ?? {})
    .filter((b) => b.finalized)
    .flatMap((b) => b.rows.filter((r) => r.userId === s.me.id && r.payout > 0).map((r) => ({ week: b.week, rank: r.rank, amount: r.payout })))
    .sort((a, b) => (a.week < b.week ? 1 : -1));
}
export const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/* ---------- 알림 ---------- */

export interface Notification {
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

export function listNotifications(s: CommunityStore, seenAt: number): Notification[] {
  const me = s.me.id;
  const out: Notification[] = [];
  const postOf = (id: string): { kind: "post" | "feed"; text: string; authorId: string } | null => {
    const p = s.posts.find((x) => x.id === id);
    if (p) return { kind: "post", text: p.text, authorId: p.authorId };
    const f = s.feed.find((x) => x.id === id);
    if (f) return { kind: "feed", text: stripHighlights(f.title ? `${f.title} · ${f.text}` : f.text), authorId: f.authorId };
    return null;
  };
  const myFirstComment = new Map<string, number>();
  const myCommentIds = new Set<string>();
  for (const c of s.comments) if (c.authorId === me) { myFirstComment.set(c.postId, Math.min(c.createdAt, myFirstComment.get(c.postId) ?? Infinity)); myCommentIds.add(c.id); }
  for (const c of s.comments) {
    if (c.authorId === me || !isVisible(s, c)) continue;
    const p = postOf(c.postId);
    if (!p) continue;
    const base = { id: c.id, postKind: p.kind, postId: c.postId, postText: p.text, actorId: c.authorId, actorNick: userById(s, c.authorId).nick, text: c.text, at: c.createdAt, read: c.createdAt <= seenAt } as const;
    // 내 댓글에 달린 답글이 가장 먼저
    if (c.parentId && myCommentIds.has(c.parentId)) out.push({ ...base, kind: "reply_to_comment" });
    else if (p.authorId === me) out.push({ ...base, kind: "comment_on_post" });
    else {
      const mine = myFirstComment.get(c.postId);
      if (mine !== undefined && c.createdAt > mine) out.push({ ...base, kind: "reply_on_thread" });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 50);
}

/* ---------- 관리자 ---------- */

export interface FlaggedItem {
  target: Target;
  item: Post | Comment | FeedPost;
  author: User;
  reports: Report[];
  postText?: string;
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
        postText: stripHighlights((s.posts.find((p) => p.id === c.postId) ?? s.feed.find((f) => f.id === c.postId))?.text ?? ""),
      });
  return out.sort((a, b) => b.reports.length - a.reports.length || b.item.createdAt - a.item.createdAt);
}

/* ---------- 프로토타입: 샘플 유저의 자동 답글 (서버가 GET 때 적용) ---------- */

export const REPLY_POOL = [
  "그 말을 여기 적어둔 것만으로도 오늘 한 걸음이에요.",
  "저도 비슷한 날이 있었어요. 지나가더라고요. 지금은 그냥 지나가는 중이에요.",
  "힘내라는 말 대신, 오늘은 그냥 여기 있어줘서 고마워요.",
  "읽고 한참 멈춰 있었어요. 혼자 아니에요.",
  "오늘 밤은 아무것도 결정하지 말고 그냥 자요. 내일의 당신이 알아서 할 거예요.",
  "이렇게 솔직하게 쓰는 사람은 이미 반은 괜찮아지는 중이에요.",
];
export const THREAD_REPLY_POOL = [
  "댓글 읽고 저도 힘이 났어요. 고마워요.",
  "그 말 덕분에 오늘 조금 괜찮아졌어요.",
  "저장해 두고 다시 읽을게요.",
  "맞아요, 그렇게 생각하니 좀 가벼워지네요.",
];
export const SIM_DELAY = 30 * 1000;
export const pickBySeed = <T,>(arr: T[], seed: string) => arr[seed.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0) % arr.length];

/** 아직 답글이 없는 내 글·댓글에 붙일 샘플 답글 목록 (저장은 호출자가) */
export function pendingSimulatedReplies(s: CommunityStore, sampleUserIds: string[]): Comment[] {
  const me = s.me.id;
  const now = Date.now();
  const samples = s.users.filter((u) => sampleUserIds.includes(u.id) && !isBlocked(u));
  if (!samples.length) return [];
  const added: Comment[] = [];
  for (const p of s.posts) {
    if (p.authorId !== me || p.hidden || now - p.createdAt < SIM_DELAY) continue;
    if (s.comments.some((c) => c.postId === p.id && c.authorId !== me)) continue;
    const actor = pickBySeed(samples, p.id);
    added.push({ id: `sim-${p.id}`, postId: p.id, authorId: actor.id, text: pickBySeed(REPLY_POOL, p.id + actor.id), createdAt: now, cheers: [], reports: [] });
  }
  for (const c of s.comments) {
    if (c.authorId !== me || now - c.createdAt < SIM_DELAY) continue;
    const owner = s.posts.find((p) => p.id === c.postId)?.authorId ?? s.feed.find((f) => f.id === c.postId)?.authorId;
    if (!owner || owner === me) continue;
    const already = s.comments.some((x) => x.postId === c.postId && x.authorId !== me && x.createdAt > c.createdAt) || added.some((x) => x.postId === c.postId);
    if (already) continue;
    const actor = samples.find((u) => u.id === owner) ?? pickBySeed(samples, c.id);
    added.push({ id: `sim-${c.id}`, postId: c.postId, authorId: actor.id, text: pickBySeed(THREAD_REPLY_POOL, c.id), createdAt: now, cheers: [], reports: [] });
  }
  return added;
}
