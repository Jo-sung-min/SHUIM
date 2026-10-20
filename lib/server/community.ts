/**
 * 커뮤니티 저장소 (서버 전용, PostgreSQL).
 * 화면이 쓰는 CommunityStore 모양을 그대로 만들어 돌려주고, 변경은 SQL로 처리한 뒤 다시 전체를 읽어 돌려준다.
 */
import { getPool } from "../db";
import { uid } from "../dates";
import {
  Comment,
  CommunityStore,
  Creator,
  Donation,
  FEED_BG_COUNT,
  FEED_MAX_IMAGES,
  FeedPost,
  Post,
  REPORT_REASON_IDS,
  Report,
  ReportReason,
  SHOUT_CAT_IDS,
  ShoutCat,
  Target,
  TargetKind,
  User,
  WeeklyBatch,
  computeWeekly,
  pendingSimulatedReplies,
  weeksNeedingCompute,
} from "../community-core";
import type { DbUser } from "./auth";
import { deleteUploadedImage } from "./s3";

const SAMPLE_USER_IDS = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"];
const SIMULATE = process.env.COMMUNITY_SIMULATE !== "0" && process.env.NODE_ENV !== "production";

function db() {
  const p = getPool();
  if (!p) throw new Error("DB_URL이 설정되지 않았어요");
  return p;
}
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : undefined);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/* ---------- 읽기 ---------- */

export async function loadStore(me: DbUser): Promise<CommunityStore> {
  const q = db();
  const [users, posts, comments, feed, cheers, reports, saves, follows, creators, donations, weekly] = await Promise.all([
    q.query("SELECT id, nick, role, blocked_at, blocked_reason FROM users"),
    q.query("SELECT * FROM shout_posts"),
    q.query("SELECT * FROM comments"),
    q.query("SELECT * FROM feed_posts"),
    q.query("SELECT user_id, target_kind, target_id FROM cheers ORDER BY created_at"),
    q.query("SELECT reporter_id, target_kind, target_id, reason, created_at FROM reports ORDER BY created_at"),
    q.query("SELECT user_id, feed_post_id FROM saves ORDER BY created_at"),
    q.query("SELECT follower_id, creator_id FROM follows ORDER BY created_at"),
    q.query("SELECT user_id, bio, since FROM creators"),
    q.query("SELECT * FROM donations ORDER BY created_at DESC"),
    q.query("SELECT * FROM weekly_batches"),
  ]);

  const cheerMap = new Map<string, string[]>();
  for (const r of cheers.rows) {
    const k = `${r.target_kind}:${r.target_id}`;
    cheerMap.set(k, [...(cheerMap.get(k) ?? []), r.user_id]);
  }
  const reportMap = new Map<string, Report[]>();
  for (const r of reports.rows) {
    const k = `${r.target_kind}:${r.target_id}`;
    reportMap.set(k, [...(reportMap.get(k) ?? []), { by: r.reporter_id, reason: r.reason, at: ms(r.created_at)! }]);
  }
  const saveMap = new Map<string, string[]>();
  for (const r of saves.rows) saveMap.set(r.feed_post_id, [...(saveMap.get(r.feed_post_id) ?? []), r.user_id]);
  const followerMap = new Map<string, string[]>();
  for (const r of follows.rows) followerMap.set(r.creator_id, [...(followerMap.get(r.creator_id) ?? []), r.follower_id]);

  const toUser = (r: Record<string, unknown>): User => ({
    id: String(r.id),
    nick: String(r.nick),
    role: r.role === "admin" ? "admin" : "user",
    blockedAt: ms(r.blocked_at),
    blockedReason: (r.blocked_reason as string | null) ?? undefined,
  });
  const allUsers = users.rows.map(toUser);
  const meUser: User = allUsers.find((u) => u.id === me.id) ?? { id: me.id, nick: me.nick, role: me.role };

  const store: CommunityStore = {
    me: meUser,
    users: allUsers.filter((u) => u.id !== me.id),
    posts: posts.rows.map(
      (r): Post => ({
        id: r.id, cat: r.cat, text: r.text, authorId: r.author_id, createdAt: ms(r.created_at)!,
        cheers: cheerMap.get(`post:${r.id}`) ?? [], reports: reportMap.get(`post:${r.id}`) ?? [],
        hidden: r.hidden || undefined, reviewedAt: ms(r.reviewed_at),
      })
    ),
    comments: comments.rows.map(
      (r): Comment => ({
        id: r.id, postId: r.post_id, text: r.text, authorId: r.author_id, createdAt: ms(r.created_at)!,
        cheers: cheerMap.get(`comment:${r.id}`) ?? [], reports: reportMap.get(`comment:${r.id}`) ?? [],
        hidden: r.hidden || undefined, reviewedAt: ms(r.reviewed_at),
      })
    ),
    feed: feed.rows.map(
      (r): FeedPost => ({
        id: r.id, title: r.title ?? undefined, text: r.text, bg: r.bg, image: r.image ?? undefined, images: (r.images as string[] | null) ?? (r.image ? [r.image] : []), authorId: r.author_id, createdAt: ms(r.created_at)!,
        cheers: cheerMap.get(`feed:${r.id}`) ?? [], reports: reportMap.get(`feed:${r.id}`) ?? [], saves: saveMap.get(r.id) ?? [],
        hidden: r.hidden || undefined, reviewedAt: ms(r.reviewed_at),
      })
    ),
    creators: Object.fromEntries(creators.rows.map((r) => [r.user_id, { bio: r.bio, followers: followerMap.get(r.user_id) ?? [], since: ms(r.since)! } as Creator])),
    following: follows.rows.filter((r) => r.follower_id === me.id).map((r) => r.creator_id),
    donations: donations.rows.map((r): Donation => ({ id: r.id, by: r.user_id, amount: r.amount, message: r.message ?? undefined, at: ms(r.created_at)! })),
    weekly: Object.fromEntries(
      weekly.rows.map((r) => {
        const week = typeof r.week === "string" ? r.week : new Date(r.week).toISOString().slice(0, 10);
        return [week, { week, computedAt: ms(r.computed_at)!, finalized: r.finalized, rows: r.rows, fund: { total: r.fund_total, count: r.fund_count, donors: r.fund_donors } } as WeeklyBatch];
      })
    ),
  };

  // 프로토타입: 샘플 유저의 자동 답글
  if (SIMULATE) {
    const pending = pendingSimulatedReplies(store, SAMPLE_USER_IDS);
    for (const c of pending) {
      await q.query(
        "INSERT INTO comments (id, post_kind, post_id, author_id, text) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
        [c.id, store.posts.some((p) => p.id === c.postId) ? "post" : "feed", c.postId, c.authorId, c.text]
      );
      store.comments.push(c);
    }
  }

  // 주간 집계 (지난 주 확정, 이번 주 잠정)
  for (const { week, finalized } of weeksNeedingCompute(store)) {
    const b = computeWeekly(store, week, finalized);
    await upsertWeekly(b);
    store.weekly[week] = b;
  }
  return store;
}

async function upsertWeekly(b: WeeklyBatch) {
  await db().query(
    `INSERT INTO weekly_batches (week, computed_at, finalized, rows, fund_total, fund_count, fund_donors)
     VALUES ($1, now(), $2, $3, $4, $5, $6)
     ON CONFLICT (week) DO UPDATE SET computed_at = now(), finalized = EXCLUDED.finalized, rows = EXCLUDED.rows,
       fund_total = EXCLUDED.fund_total, fund_count = EXCLUDED.fund_count, fund_donors = EXCLUDED.fund_donors`,
    [b.week, b.finalized, JSON.stringify(b.rows), b.fund.total, b.fund.count, b.fund.donors]
  );
}

/* ---------- 쓰기 (모두 loadStore 로 끝나 최신 상태를 돌려준다) ---------- */

function assertNotBlocked(me: DbUser) {
  if (me.blockedAt) throw new ApiError(403, "차단된 계정은 글과 댓글을 쓸 수 없어요.");
}
const assertKind = (k: unknown): TargetKind => {
  if (k === "post" || k === "comment" || k === "feed") return k;
  throw new ApiError(400, "대상 종류가 올바르지 않아요");
};
const text = (v: unknown, max: number) => {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) throw new ApiError(400, "내용이 비어 있어요");
  return t.slice(0, max);
};

export async function createPost(me: DbUser, cat: unknown, body: unknown) {
  assertNotBlocked(me);
  if (!SHOUT_CAT_IDS.includes(cat as ShoutCat)) throw new ApiError(400, "카테고리가 올바르지 않아요");
  await db().query("INSERT INTO shout_posts (id, author_id, cat, text) VALUES ($1, $2, $3, $4)", [uid(), me.id, cat, text(body, 600)]);
  return loadStore(me);
}
export async function deletePost(me: DbUser, id: string) {
  const r = await db().query("DELETE FROM shout_posts WHERE id = $1 AND author_id = $2", [id, me.id]);
  if (r.rowCount) await db().query("DELETE FROM comments WHERE post_kind = 'post' AND post_id = $1", [id]);
  return loadStore(me);
}
export async function addComment(me: DbUser, postId: string, body: unknown) {
  assertNotBlocked(me);
  const q = db();
  const kind = (await q.query("SELECT 1 FROM shout_posts WHERE id = $1", [postId])).rowCount
    ? "post"
    : (await q.query("SELECT 1 FROM feed_posts WHERE id = $1", [postId])).rowCount
    ? "feed"
    : null;
  if (!kind) throw new ApiError(404, "글을 찾을 수 없어요");
  await q.query("INSERT INTO comments (id, post_kind, post_id, author_id, text) VALUES ($1, $2, $3, $4, $5)", [uid(), kind, postId, me.id, text(body, 300)]);
  return loadStore(me);
}
export async function deleteComment(me: DbUser, id: string) {
  await db().query("DELETE FROM comments WHERE id = $1 AND author_id = $2", [id, me.id]);
  return loadStore(me);
}
export async function toggleCheer(me: DbUser, target: Target) {
  const kind = assertKind(target.kind);
  const q = db();
  const del = await q.query("DELETE FROM cheers WHERE user_id = $1 AND target_kind = $2 AND target_id = $3", [me.id, kind, target.id]);
  if (!del.rowCount) await q.query("INSERT INTO cheers (user_id, target_kind, target_id) VALUES ($1, $2, $3)", [me.id, kind, target.id]);
  return loadStore(me);
}
export async function report(me: DbUser, target: Target, reason: unknown) {
  const kind = assertKind(target.kind);
  if (!REPORT_REASON_IDS.includes(reason as ReportReason)) throw new ApiError(400, "신고 사유가 올바르지 않아요");
  await db().query(
    "INSERT INTO reports (id, reporter_id, target_kind, target_id, reason) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (reporter_id, target_kind, target_id) DO NOTHING",
    [uid(), me.id, kind, target.id, reason]
  );
  return loadStore(me);
}
export async function createFeedPost(me: DbUser, body: unknown, bg: unknown, title: unknown, images: unknown) {
  assertNotBlocked(me);
  const q = db();
  const bgN = Math.max(0, Math.min(FEED_BG_COUNT - 1, Number(bg) || 0));
  const ok = (u: unknown): u is string => typeof u === "string" && /^(\/|https?:\/\/)/.test(u.trim());
  const list = (Array.isArray(images) ? images : typeof images === "string" ? [images] : []).filter(ok).map((u) => u.trim().slice(0, 500)).slice(0, FEED_MAX_IMAGES);
  const t = typeof title === "string" && title.trim() ? title.trim().slice(0, 24) : null;
  await q.query("INSERT INTO creators (user_id, bio) VALUES ($1, '') ON CONFLICT (user_id) DO NOTHING", [me.id]);
  await q.query("INSERT INTO feed_posts (id, author_id, title, text, bg, image, images) VALUES ($1, $2, $3, $4, $5, $6, $7)", [uid(), me.id, t, text(body, 280), bgN, list[0] ?? null, list]);
  return loadStore(me);
}
export async function deleteFeedPost(me: DbUser, id: string) {
  const r = await db().query("DELETE FROM feed_posts WHERE id = $1 AND author_id = $2 RETURNING image, images", [id, me.id]);
  if (r.rowCount) {
    await db().query("DELETE FROM comments WHERE post_kind = 'feed' AND post_id = $1", [id]);
    const urls = new Set<string>([...((r.rows[0]?.images as string[] | null) ?? []), r.rows[0]?.image].filter(Boolean));
    for (const u of urls) await deleteUploadedImage(u); // 우리 S3에 올린 사진이면 함께 삭제
  }
  return loadStore(me);
}
export async function updateBio(me: DbUser, bio: unknown) {
  const b = typeof bio === "string" ? bio.trim().slice(0, 80) : "";
  await db().query("INSERT INTO creators (user_id, bio) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio", [me.id, b]);
  return loadStore(me);
}
export async function toggleFollow(me: DbUser, creatorId: string) {
  if (creatorId === me.id) throw new ApiError(400, "자기 자신은 팔로우할 수 없어요");
  const q = db();
  const del = await q.query("DELETE FROM follows WHERE follower_id = $1 AND creator_id = $2", [me.id, creatorId]);
  if (!del.rowCount) await q.query("INSERT INTO follows (follower_id, creator_id) VALUES ($1, $2)", [me.id, creatorId]);
  return loadStore(me);
}
export async function toggleSave(me: DbUser, feedId: string) {
  const q = db();
  const del = await q.query("DELETE FROM saves WHERE user_id = $1 AND feed_post_id = $2", [me.id, feedId]);
  if (!del.rowCount) await q.query("INSERT INTO saves (user_id, feed_post_id) VALUES ($1, $2)", [me.id, feedId]);
  return loadStore(me);
}
export async function donate(me: DbUser, amount: unknown, message: unknown) {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt < 100 || amt > 1_000_000) throw new ApiError(400, "금액은 100원~1,000,000원이에요");
  const msg = typeof message === "string" && message.trim() ? message.trim().slice(0, 60) : null;
  await db().query("INSERT INTO donations (id, user_id, amount, message) VALUES ($1, $2, $3, $4)", [uid(), me.id, amt, msg]);
  // 이번 주 잠정 집계를 바로 갱신
  const store = await loadStore(me);
  const cur = computeWeekly(store, Object.keys(store.weekly).sort().pop()!, false);
  if (!store.weekly[cur.week]?.finalized) {
    await upsertWeekly(cur);
    store.weekly[cur.week] = cur;
  }
  return store;
}
export async function refreshCurrentWeek(me: DbUser) {
  const store = await loadStore(me);
  const week = Object.keys(store.weekly).sort().pop();
  if (week && !store.weekly[week].finalized) {
    const b = computeWeekly(store, week, false);
    await upsertWeekly(b);
    store.weekly[week] = b;
  }
  return store;
}

/* ---------- 관리자 ---------- */

const tableOf = (kind: TargetKind) => (kind === "post" ? "shout_posts" : kind === "comment" ? "comments" : "feed_posts");

export async function adminHide(me: DbUser, target: Target) {
  await db().query(`UPDATE ${tableOf(assertKind(target.kind))} SET hidden = TRUE WHERE id = $1`, [target.id]);
  return loadStore(me);
}
export async function adminDismiss(me: DbUser, target: Target) {
  await db().query(`UPDATE ${tableOf(assertKind(target.kind))} SET reviewed_at = now() WHERE id = $1`, [target.id]);
  return loadStore(me);
}
export async function adminBlock(me: DbUser, userId: string, reason: unknown) {
  const r = typeof reason === "string" ? reason.slice(0, 200) : "";
  await db().query("UPDATE users SET blocked_at = now(), blocked_reason = $2 WHERE id = $1", [userId, r]);
  return loadStore(me);
}
export async function adminUnblock(me: DbUser, userId: string) {
  await db().query("UPDATE users SET blocked_at = NULL, blocked_reason = NULL WHERE id = $1", [userId]);
  return loadStore(me);
}
