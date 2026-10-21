"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "./ui";

export default function CommunityConsent() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  useEffect(() => {
    const listener = (event: Event) => { resolve.current = (event as CustomEvent<(accepted: boolean) => void>).detail; setChecked(false); setOpen(true); };
    window.addEventListener("sorow:community-consent", listener);
    return () => { window.removeEventListener("sorow:community-consent", listener); resolve.current?.(false); };
  }, []);
  const finish = (accepted: boolean) => { resolve.current?.(accepted); resolve.current = null; setOpen(false); };
  return <div className="community-consent"><Sheet open={open} onClose={() => finish(false)} title="함께 지킬 약속">
    <p>글·사진·프로필·메시지를 공유하기 전에 확인해 주세요.</p>
    <p className="tiny">괴롭힘, 혐오·폭력·협박, 개인정보 노출, 사기, 성적 착취와 아동 성적 학대 및 착취 콘텐츠는 금지됩니다. 위반 콘텐츠와 계정은 신고·제한될 수 있습니다.</p>
    <p className="tiny"><a href="/terms#community" target="_blank" rel="noopener noreferrer">이용약관·커뮤니티 기준 읽기 ↗</a> · <a href="/privacy" target="_blank" rel="noopener noreferrer">개인정보 처리방침 ↗</a></p>
    <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />이용약관과 커뮤니티 기준을 읽고 동의합니다.</label>
    <div className="sheet-actions"><button className="btn ghost" onClick={() => finish(false)}>취소</button><button className="btn" disabled={!checked} onClick={() => finish(true)}>동의하고 계속</button></div>
  </Sheet></div>;
}
