/**
 * S3 업로드 (서버 전용). 브라우저가 파일을 서버로 보내지 않고, 서버가 발급한 프리사인 PUT URL로 S3에 직접 올린다.
 * 공개 주소는 CDN_BASE_URL(CloudFront)이 있으면 그걸로, 없으면 S3 가상 호스트 주소로 만든다.
 *
 * 환경변수 (.env):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   — IAM 키 (s3:PutObject, s3:DeleteObject 권한)
 *   S3_BUCKET                                               — 버킷 이름
 *   S3_PREFIX   (선택, 기본 "feed")                          — 키 앞에 붙는 폴더
 *   CDN_BASE_URL (선택)                                      — 예: https://d1234abcd.cloudfront.net
 */
import crypto from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB (클라이언트에서 리사이즈 후 보통 수백 KB)
const PRESIGN_TTL_SEC = 60;

function cfg() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !bucket || !accessKeyId || !secretAccessKey) return null;
  const prefix = (process.env.S3_PREFIX ?? "feed").replace(/^\/+|\/+$/g, "");
  const cdn = (process.env.CDN_BASE_URL ?? "").replace(/\/+$/, "");
  return { region, bucket, accessKeyId, secretAccessKey, prefix, cdn };
}

export const s3Configured = () => Boolean(cfg());

let client: S3Client | null = null;
function s3() {
  const c = cfg();
  if (!c) throw new Error("S3 환경변수가 설정되지 않았어요");
  if (!client) client = new S3Client({ region: c.region, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
  return client;
}

/** 키 → 공개 URL (CDN 우선) */
export function publicUrlFor(key: string): string {
  const c = cfg()!;
  return c.cdn ? `${c.cdn}/${key}` : `https://${c.bucket}.s3.${c.region}.amazonaws.com/${key}`;
}

/** 공개 URL → 우리 버킷의 키 (우리 주소가 아니면 null) */
export function keyFromUrl(url: string): string | null {
  const c = cfg();
  if (!c) return null;
  const bases = [c.cdn, `https://${c.bucket}.s3.${c.region}.amazonaws.com`, `https://${c.bucket}.s3.amazonaws.com`].filter(Boolean);
  for (const b of bases) if (url.startsWith(b + "/")) return url.slice(b.length + 1);
  return null;
}

export interface Presigned {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
  headers: Record<string, string>; // 브라우저가 PUT 때 그대로 보내야 하는 헤더 (서명에 포함됨)
}

/** 프리사인 PUT URL 발급. Content-Type·Content-Length·Cache-Control을 서명에 넣어 그 조건으로만 올릴 수 있게 한다. */
export async function presignUpload(userId: string, contentType: string, size: number): Promise<Presigned> {
  const c = cfg();
  if (!c) throw new Error("S3 환경변수가 설정되지 않았어요");
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error("jpg, png, webp, gif 이미지만 올릴 수 있어요");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) throw new Error(`파일은 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하여야 해요`);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const key = `${c.prefix}/${day}/${userId}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const cacheControl = "public, max-age=31536000, immutable";
  const cmd = new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: contentType, ContentLength: size, CacheControl: cacheControl });
  // Content-Type·Cache-Control·Content-Length를 서명에 넣어, 브라우저가 같은 값으로 보낼 때만 S3가 받아들이게 한다
  const uploadUrl = await getSignedUrl(s3(), cmd, {
    expiresIn: PRESIGN_TTL_SEC,
    signableHeaders: new Set(["content-type", "cache-control", "content-length"]),
    unhoistableHeaders: new Set(["content-type", "cache-control"]),
  });
  return { uploadUrl, key, publicUrl: publicUrlFor(key), expiresIn: PRESIGN_TTL_SEC, headers: { "Content-Type": contentType, "Cache-Control": cacheControl } };
}

/** 글 삭제 때 우리 버킷의 이미지면 함께 지운다 (실패해도 글 삭제는 계속) */
export async function deleteUploadedImage(url: string | null | undefined) {
  if (!url) return;
  const key = keyFromUrl(url);
  if (!key) return;
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: cfg()!.bucket, Key: key }));
  } catch (e) {
    console.warn("S3 delete failed", key, (e as Error).message);
  }
}
