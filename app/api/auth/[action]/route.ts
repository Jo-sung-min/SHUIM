import { NextResponse } from "next/server";
import { currentUser, isAdmin, signIn, signOut, signUp, updateNick, type DbUser } from "@/lib/server/auth";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicUser = (u: DbUser | null) =>
  u && !u.isAnonymous ? { id: u.id, email: u.email, nick: u.nick, role: u.role, createdAt: u.createdAt } : null;

/** GET /api/auth/me — 로그인한 계정(익명 제외)과 관리자 여부 */
export async function GET(_req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "me") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!dbConfigured()) return NextResponse.json({ user: null, admin: false, configured: false });
  try {
    const u = await currentUser();
    return NextResponse.json({ user: publicUser(u), admin: await isAdmin(u), configured: true, anonymousId: u?.isAnonymous ? u.id : null });
  } catch (e) {
    console.error("auth me failed", e);
    return NextResponse.json({ user: null, admin: false, configured: true, error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/auth/signup | login | logout | nick */
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  const { action } = await ctx.params;
  let body: Record<string, string> = {};
  try {
    body = (await req.json()) as Record<string, string>;
  } catch {
    /* noop */
  }
  try {
    if (action === "signup") {
      const r = await signUp(body.email ?? "", body.nick ?? "", body.password ?? "");
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ user: publicUser(r.user), admin: await isAdmin(r.user) });
    }
    if (action === "login") {
      const r = await signIn(body.email ?? "", body.password ?? "");
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      return NextResponse.json({ user: publicUser(r.user), admin: await isAdmin(r.user) });
    }
    if (action === "logout") {
      await signOut();
      return NextResponse.json({ ok: true });
    }
    if (action === "nick") {
      const u = await currentUser();
      if (!u || u.isAnonymous) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
      const err = await updateNick(u, body.nick ?? "");
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      return NextResponse.json({ user: publicUser({ ...u, nick: (body.nick ?? "").trim() }) });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    console.error(`auth ${action} failed`, e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
