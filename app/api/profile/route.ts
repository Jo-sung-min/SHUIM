import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getMyProfile, updateMyProfile } from "@/lib/server/profile";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/profile — 내 프로필(비공개 필드 포함) */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  try {
    const me = await requireUser();
    return NextResponse.json(await getMyProfile(me));
  } catch (e) {
    console.error("profile GET failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** PUT /api/profile { nick?, bio?, avatarUrl?, name?, phone? } */
export async function PUT(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  try {
    const me = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await updateMyProfile(me, {
      nick: typeof body.nick === "string" ? body.nick : undefined,
      bio: typeof body.bio === "string" ? body.bio : undefined,
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : null,
      name: typeof body.name === "string" ? body.name : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(await getMyProfile(me));
  } catch (e) {
    console.error("profile PUT failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
