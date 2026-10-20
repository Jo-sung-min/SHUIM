import { NextResponse } from "next/server";
import { isAdmin, requireUser } from "@/lib/server/auth";
import * as C from "@/lib/server/community";
import { dbConfigured } from "@/lib/db";
import type { Target } from "@/lib/community-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;
const target = (b: Body): Target => ({ kind: String(b.kind) as Target["kind"], id: String(b.id ?? "") });
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** POST /api/community/<action> — 변경 후 최신 상태(CommunityStore)를 돌려준다 */
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  const { action } = await ctx.params;
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* 본문 없는 요청 허용 */
  }
  try {
    const me = await requireUser();
    switch (action) {
      case "post.create":
        return NextResponse.json(await C.createPost(me, body.cat, body.text));
      case "post.delete":
        return NextResponse.json(await C.deletePost(me, str(body.id)));
      case "comment.create":
        return NextResponse.json(await C.addComment(me, str(body.postId), body.text));
      case "comment.delete":
        return NextResponse.json(await C.deleteComment(me, str(body.id)));
      case "cheer":
        return NextResponse.json(await C.toggleCheer(me, target(body)));
      case "report":
        return NextResponse.json(await C.report(me, target(body), body.reason));
      case "feed.create":
        return NextResponse.json(await C.createFeedPost(me, body.text, body.bg, body.title, body.image));
      case "feed.delete":
        return NextResponse.json(await C.deleteFeedPost(me, str(body.id)));
      case "bio":
        return NextResponse.json(await C.updateBio(me, body.bio));
      case "follow":
        return NextResponse.json(await C.toggleFollow(me, str(body.creatorId)));
      case "save":
        return NextResponse.json(await C.toggleSave(me, str(body.feedId)));
      case "donate":
        return NextResponse.json(await C.donate(me, body.amount, body.message));
      case "weekly.refresh":
        return NextResponse.json(await C.refreshCurrentWeek(me));
      case "admin.hide":
      case "admin.dismiss":
      case "admin.block":
      case "admin.unblock": {
        if (!(await isAdmin(me))) return NextResponse.json({ error: "관리자만 할 수 있어요" }, { status: 403 });
        if (action === "admin.hide") return NextResponse.json(await C.adminHide(me, target(body)));
        if (action === "admin.dismiss") return NextResponse.json(await C.adminDismiss(me, target(body)));
        if (action === "admin.block") return NextResponse.json(await C.adminBlock(me, str(body.userId), body.reason));
        return NextResponse.json(await C.adminUnblock(me, str(body.userId)));
      }
      default:
        return NextResponse.json({ error: `알 수 없는 동작: ${action}` }, { status: 404 });
    }
  } catch (e) {
    const status = e instanceof C.ApiError ? e.status : 500;
    if (status === 500) console.error(`community ${action} failed`, e);
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
