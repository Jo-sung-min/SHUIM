import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, presignUpload, s3Configured } from "@/lib/server/s3";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/upload/presign — 업로드 가능 여부와 제한 */
export async function GET() {
  return NextResponse.json({ configured: s3Configured(), maxBytes: MAX_UPLOAD_BYTES, types: Object.keys(ALLOWED_TYPES) });
}

/** POST /api/upload/presign { contentType, size } → { uploadUrl, key, publicUrl, headers, expiresIn } */
export async function POST(req: Request) {
  if (!s3Configured()) return NextResponse.json({ error: "S3 설정이 없어 사진 업로드는 꺼져 있어요" }, { status: 503 });
  if (!dbConfigured()) return NextResponse.json({ error: "DB_URL이 설정되지 않았어요" }, { status: 503 });
  try {
    const me = await requireUser();
    if (me.blockedAt) return NextResponse.json({ error: "차단된 계정은 올릴 수 없어요" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as { contentType?: string; size?: number };
    const presigned = await presignUpload(me.id, String(body.contentType ?? ""), Number(body.size));
    return NextResponse.json(presigned);
  } catch (e) {
    const msg = (e as Error).message;
    const status = /이미지만|이하여야/.test(msg) ? 400 : 500;
    if (status === 500) console.error("presign failed", e);
    return NextResponse.json({ error: msg }, { status });
  }
}
