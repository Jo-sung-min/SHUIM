import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getThread, markRead } from "@/lib/server/messages";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/messages/:id?after=<ms> — 대화 내용 (after 이후 것만도 가능) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  const { id } = await ctx.params;
  try {
    const me = await requireUser();
    const after = Number(new URL(req.url).searchParams.get("after") ?? "");
    const thread = await getThread(me, id, Number.isFinite(after) && after > 0 ? after : undefined);
    return NextResponse.json(thread);
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: /찾을 수 없어요/.test(msg) ? 404 : 500 });
  }
}

/** POST /api/messages/:id — 읽음 처리 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  const { id } = await ctx.params;
  try {
    const me = await requireUser();
    await markRead(me, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: /찾을 수 없어요/.test(msg) ? 404 : 500 });
  }
}
