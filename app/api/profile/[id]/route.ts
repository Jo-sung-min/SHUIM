import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { getPublicProfile } from "@/lib/server/profile";
import { getPool, dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/profile/:id — 공개 프로필 + 그 사람의 위로글·외침 (숨김·차단 제외) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  const { id } = await ctx.params;
  try {
    const viewer = await currentUser();
    const profile = await getPublicProfile(viewer?.id ?? null, id);
    if (!profile) return NextResponse.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
    const q = getPool()!;
    const [feed, shout] = profile.blocked
      ? [{ rows: [] }, { rows: [] }]
      : await Promise.all([
          q.query(
            `SELECT f.id, f.title, f.text, f.bg, f.image, f.created_at,
                    (SELECT count(*) FROM cheers c WHERE c.target_kind = 'feed' AND c.target_id = f.id)::int AS cheers
               FROM feed_posts f WHERE f.author_id = $1 AND f.hidden = FALSE ORDER BY f.created_at DESC LIMIT 50`,
            [id]
          ),
          q.query(
            `SELECT s.id, s.cat, s.text, s.created_at,
                    (SELECT count(*) FROM cheers c WHERE c.target_kind = 'post' AND c.target_id = s.id)::int AS cheers
               FROM shout_posts s WHERE s.author_id = $1 AND s.hidden = FALSE ORDER BY s.created_at DESC LIMIT 50`,
            [id]
          ),
        ]);
    return NextResponse.json({
      profile,
      isMe: viewer?.id === id,
      feed: feed.rows.map((r) => ({ id: r.id, title: r.title ?? undefined, text: r.text, bg: r.bg, image: r.image ?? undefined, cheers: r.cheers, createdAt: new Date(r.created_at).getTime() })),
      shout: shout.rows.map((r) => ({ id: r.id, cat: r.cat, text: r.text, cheers: r.cheers, createdAt: new Date(r.created_at).getTime() })),
    });
  } catch (e) {
    console.error("profile/:id failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
