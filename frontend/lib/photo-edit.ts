export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000;
export const MAX_PHOTO_EDGE = 16_384;
export const WORKING_PHOTO_EDGE = 2048;
export const OUTPUT_PHOTO_EDGE = 1600;

export interface PhotoPosition { x: number; y: number }
export interface PhotoCrop {
  x: number; y: number; width: number; height: number;
  rotatedWidth: number; rotatedHeight: number; rotation: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeRotation(rotation: number): number {
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

export function validatePhotoDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("사진 크기를 확인하지 못했어요. 다른 사진을 선택해 주세요.");
  if (width > MAX_PHOTO_EDGE || height > MAX_PHOTO_EDGE || width * height > MAX_PHOTO_PIXELS) throw new Error("사진 해상도가 너무 커요. 크기를 줄인 사진을 선택해 주세요.");
}

/** Inspect dimensions before decoding so a small compressed file cannot allocate an unbounded bitmap. */
export function inspectPhotoHeader(buffer: ArrayBuffer): { width: number; height: number } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  let width = 0;
  let height = 0;
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    width = view.getUint16(6, true); height = view.getUint16(8, true);
  } else if (bytes.length >= 25 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4);
    const uint24 = (at: number) => bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16;
    if (kind === "VP8X" && bytes.length >= 30) { width = uint24(24) + 1; height = uint24(27) + 1; }
    else if (kind === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === "VP8L" && bytes[20] === 0x2f) {
      width = 1 + (bytes[21] | (bytes[22] & 0x3f) << 8);
      height = 1 + (bytes[22] >> 6 | bytes[23] << 2 | (bytes[24] & 0x0f) << 10);
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  }
  validatePhotoDimensions(width, height);
  return { width, height };
}

/** Position is the image's translation: moving it right reveals the left of the source. */
export function calculatePhotoCrop(width: number, height: number, rotation: number, ratio: number, zoom: number, position: PhotoPosition): PhotoCrop {
  validatePhotoDimensions(width, height);
  const angle = normalizeRotation(rotation);
  const turned = angle === 90 || angle === 270;
  const rw = turned ? height : width;
  const rh = turned ? width : height;
  const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const cropWidth = Math.min(rw, rh * aspect) / clamp(zoom, 1, 4);
  const cropHeight = cropWidth / aspect;
  return {
    x: (rw - cropWidth) * (1 - clamp(position.x, -1, 1)) / 2,
    y: (rh - cropHeight) * (1 - clamp(position.y, -1, 1)) / 2,
    width: cropWidth, height: cropHeight, rotatedWidth: rw, rotatedHeight: rh, rotation: angle,
  };
}

export function photoOutputSize(crop: Pick<PhotoCrop, "width" | "height">, maxEdge = OUTPUT_PHOTO_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  return { width: Math.max(1, Math.round(crop.width * scale)), height: Math.max(1, Math.round(crop.height * scale)) };
}

export async function loadEditablePhoto(file: File): Promise<HTMLCanvasElement> {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error("사진은 20MB 이하로 선택해 주세요.");
  if (file.type && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error("JPG, PNG, WebP, GIF 사진을 선택해 주세요.");
  inspectPhotoHeader(await file.slice(0, 512 * 1024).arrayBuffer());
  let image: ImageBitmap | HTMLImageElement | null = null;
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      try { image = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* Try the browser image decoder. */ }
    }
    if (!image) {
      objectUrl = URL.createObjectURL(file);
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("사진을 읽지 못했어요. 다른 사진을 선택해 주세요."));
        element.src = objectUrl!;
      });
    }
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    validatePhotoDimensions(width, height);
    const scale = Math.min(1, WORKING_PHOTO_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진 편집을 시작하지 못했어요. 다시 시도해 주세요.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if (image && "close" in image) image.close();
    if (image instanceof HTMLImageElement) { image.onload = null; image.onerror = null; image.src = ""; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export function drawPhotoCrop(context: CanvasRenderingContext2D, source: HTMLCanvasElement, crop: PhotoCrop, outputWidth: number, outputHeight: number): void {
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.scale(outputWidth / crop.width, outputHeight / crop.height);
  context.translate(-crop.x, -crop.y);
  context.translate(crop.rotatedWidth / 2, crop.rotatedHeight / 2);
  context.rotate(crop.rotation * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  context.restore();
}

export async function exportPhotoCrop(source: HTMLCanvasElement, crop: PhotoCrop, name: string): Promise<File> {
  const canvas = document.createElement("canvas");
  const size = photoOutputSize(crop);
  canvas.width = size.width; canvas.height = size.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 준비하지 못했어요. 다시 시도해 주세요.");
    drawPhotoCrop(context, source, crop, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob?.size || blob.size > 5 * 1024 * 1024) throw new Error("사진을 저장하지 못했어요. 조금 더 작게 잘라 주세요.");
    const filename = name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 64) || "sorow-photo";
    return new File([blob], `${filename}-edited.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally { canvas.width = 0; canvas.height = 0; }
}
