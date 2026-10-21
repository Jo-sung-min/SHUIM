"use client";

/**
 * 브라우저 → S3 직접 업로드.
 * 1) 큰 사진은 캔버스로 긴 변 1600px 이하 WebP(또는 JPEG)로 줄이고
 * 2) 서버에서 프리사인 URL을 받아
 * 3) S3에 PUT 한 뒤 공개(CDN) 주소를 돌려준다.
 */

export interface UploadResult {
  url: string;
  key: string;
  bytes: number;
}

const MAX_EDGE = 1600;

async function fileToBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 읽지 못했어요"));
    img.src = URL.createObjectURL(file);
  });
}

/** 긴 변 1600px 이하로 줄여 WebP로. GIF는 움직임을 지키려고 그대로 둔다. */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await fileToBitmap(file);
  const w = "width" in bmp ? bmp.width : (bmp as HTMLImageElement).naturalWidth;
  const h = "height" in bmp ? bmp.height : (bmp as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  if (scale === 1 && file.size < 600 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (blob && blob.size > 0) return blob;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return jpeg ?? file;
}

export async function uploadImage(file: File, onProgress?: (pct: number) => void): Promise<UploadResult> {
  const blob = await shrinkImage(file);
  const contentType = blob.type || file.type;
  const res = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, size: blob.size }),
    credentials: "same-origin",
  });
  const presigned = (await res.json()) as { uploadUrl?: string; key?: string; publicUrl?: string; headers?: Record<string, string>; error?: string };
  if (!res.ok || !presigned.uploadUrl) throw new Error(presigned.error ?? "업로드 주소를 받지 못했어요");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presigned.uploadUrl!);
    for (const [k, v] of Object.entries(presigned.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 업로드 실패 (${xhr.status}). 버킷 CORS 설정을 확인해요.`)));
    xhr.onerror = () => reject(new Error("S3에 연결하지 못했어요. 버킷 CORS 설정을 확인해요."));
    xhr.send(blob);
  });
  return { url: presigned.publicUrl!, key: presigned.key!, bytes: blob.size };
}

/** 서버에 S3 설정이 있는지 (없으면 업로드 버튼을 숨긴다) */
export async function uploadAvailable(): Promise<boolean> {
  try {
    const r = (await (await fetch("/api/upload/presign")).json()) as { configured?: boolean };
    return Boolean(r.configured);
  } catch {
    return false;
  }
}
