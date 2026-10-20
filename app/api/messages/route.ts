import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { listConversations, sendMessage, unreadMessageCount } from "@/lib/server/messages";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/messages — 내 대화 목록 + 읽지 않은 수 */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  try {
    const me = await requireUser();
    const [conversations, unread] = await Promise.all([listConversations(me), unreadMessageCount(me)]);
    return NextResponse.json({ conversations, unread });
  } catch (e) {
    console.error("messages GET failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/messages { toUserId, text } — 메시지 보내기 (대화가 없으면 만든다) */
export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  try {
    const me = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { toUserId?: string; text?: string };
    const r = await sendMessage(me, String(body.toUserId ?? ""), String(body.text ?? ""));
    return NextResponse.json(r);
  } catch (e) {
    const msg = (e as Error).message;
    const status = /차단|자기 자신|비어|찾을 수 없어요/.test(msg) ? 400 : 500;
    if (status === 500) console.error("messages POST failed", e);
    return NextResponse.json({ error: msg }, { status });
  }
}
