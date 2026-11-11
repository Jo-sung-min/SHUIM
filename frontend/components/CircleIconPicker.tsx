"use client";

import { useRef, useState } from "react";
import { CircleMark, circleIconOf } from "./CircleMark";
import IconSearchSheet, { prefetchFluentIcons } from "./IconSearchSheet";
import { useFluentIcon } from "./FluentIcon";
import { IconClose, IconImage, IconSearch } from "./Icons";
import { fluentId, fluentName } from "@/lib/fluent-icons";
import styles from "@/app/c/circle.module.css";

/** 고른 아이콘: 기본 아이콘 id 와 올린 사진(data URL 또는 이미 저장된 주소). 사진이 있으면 사진이 먼저 보인다 */
export type IconChoice = { icon: string | null; image: string | null };

/** 아이콘 사진은 256px 정사각형 WebP(안 되면 PNG) data URL 로 줄여 보낸다 (서버 상한 200KB) */
export async function prepareIconImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("이미지를 읽지 못했어요"));
      el.src = url;
    });
    const size = 256, canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 줄이지 못했어요");
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const webp = canvas.toDataURL("image/webp", 0.86);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 고른 아이콘 이름 한 줄 ("커피", 예전 기본 아이콘은 그 이름) */
function IconCaption({ icon, image }: IconChoice) {
  const fluent = fluentName(icon);
  const row = useFluentIcon(fluent);
  const label = image ? "올린 사진" : fluent ? (row && row !== "missing" ? row[1] : "") : circleIconOf(icon)?.label;
  return <small className={styles.iconCaption}>{label ? `고른 아이콘: ${label}` : "아이콘을 고르지 않으면 이름 첫 글자가 보여요"}</small>;
}

/** 소로우 열기·설정에서 쓰는 아이콘 고르기: 미리보기 + 아이콘 찾기(전체 화면) + 사진 올리기 */
export default function CircleIconPicker({ name, value, onChange, disabled }: {
  name: string; value: IconChoice; onChange: (next: IconChoice) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      onChange({ icon: value.icon, image: await prepareIconImage(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지를 읽지 못했어요");
    }
    if (input.current) input.current.value = "";
  };
  return (
    <div className={styles.iconPicker}>
      <div className={styles.iconPreview}>
        <CircleMark c={{ name: name || "소로우", icon: value.icon, iconUrl: null }} preview={value.image} />
        <div className={styles.iconPreviewActions}>
          <button type="button" className="btn soft sm" disabled={disabled} onPointerDown={prefetchFluentIcons} onFocus={prefetchFluentIcons}
            onClick={() => setSearching(true)}><IconSearch />아이콘 찾기</button>
          <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => input.current?.click()}><IconImage />사진 올리기</button>
          {value.image ? <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => onChange({ ...value, image: null })}><IconClose />사진 지우기</button>
            : value.icon && <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => onChange({ ...value, icon: null })}><IconClose />아이콘 빼기</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      <IconCaption {...value} />
      {error && <small className={styles.iconError} role="alert">{error}</small>}
      <IconSearchSheet open={searching} selected={fluentName(value.icon)} onClose={() => setSearching(false)}
        onPick={(picked) => { onChange({ image: null, icon: fluentId(picked) }); setSearching(false); }} />
    </div>
  );
}
