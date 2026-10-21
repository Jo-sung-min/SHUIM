"use client";

/** 관리자 사이트 설정용: 이미지를 정해진 크기로 가운데 맞춰 잘라(cover) data URL 로 만든다. 파비콘·공유 이미지는 작아서 S3 없이 DB 에 둔다 */

async function load(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window && file.type !== "image/svg+xml") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했어요")); };
    img.src = url;
  });
}

export async function imageToDataUrl(file: File, width: number, height: number, mime: "image/png" | "image/jpeg", quality = 0.9): Promise<string> {
  const src = await load(file);
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
  if (!sw || !sh) throw new Error("이미지를 읽지 못했어요");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 만들 수 없어요");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src as CanvasImageSource, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return canvas.toDataURL(mime, quality);
}
