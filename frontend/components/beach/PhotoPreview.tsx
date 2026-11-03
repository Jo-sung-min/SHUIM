"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconShare } from "@/components/Icons";
import { Sheet } from "@/components/ui";
import { canSharePhoto, downloadBeachPhoto, shareBeachPhoto, type BeachPhoto } from "@/lib/beach/photo";
import { showToast, tick as haptic } from "@/lib/toast";
import styles from "./PhotoPreview.module.css";

export function CameraIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 5 1.5-2h5L16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12.5" r="4"/></svg>;
}

export default function PhotoPreview({ photo, onClose }: { photo: BeachPhoto; onClose: () => void }) {
  const [sharing, setSharing] = useState(false);
  const busy = useRef(false);
  const supported = canSharePhoto(photo.file);
  const save = () => { downloadBeachPhoto(photo); haptic(); };
  const share = async () => {
    if (busy.current) return;
    busy.current = true;
    setSharing(true);
    try {
      // File creation happened during capture; native share receives this click's gesture.
      const result = await shareBeachPhoto(photo.file);
      if (result === "unsupported") {
        downloadBeachPhoto(photo);
        showToast("사진을 저장한 뒤 원하는 앱에서 보내 주세요.", { kind: "info" });
      }
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "사진을 저장한 뒤 다시 공유해 주세요.", { kind: "info" });
    } finally { busy.current = false; setSharing(false); }
  };

  return createPortal(<div className={styles.scope}><Sheet open onClose={onClose} title="머물고 싶은 순간">
    <div className={styles.content}>
      {/* An in-memory snapshot already has its final size; no image proxy is needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.photo} src={photo.url} alt="방금 담은 소로우 바닷가 풍경" />
      <p className={styles.caption}>{supported ? "공유 화면에서 카카오톡 등 보낼 앱을 골라요." : "사진을 저장한 뒤 원하는 앱에서 보내세요."}</p>
      <div className={styles.actions}>
        <button type="button" onClick={save} disabled={sharing}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></svg>사진 저장</button>
        <button type="button" className={styles.share} onClick={() => void share()} disabled={sharing}><IconShare />{sharing ? "공유 화면 여는 중" : "공유하기"}</button>
      </div>
    </div>
  </Sheet></div>, document.body);
}
