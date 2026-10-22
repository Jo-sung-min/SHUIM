"use client";

import { useState } from "react";
import { setUserBlocked } from "@/lib/safety";
import { ConfirmSheet } from "./ui";

/** 사용자 차단: 브라우저 팝업 대신 확인 시트로 묻고, 끝나면 차단 목록으로 이동 */
export default function BlockUser({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const block = async () => {
    setBusy(true); setError("");
    try { await setUserBlocked(userId, true); window.location.assign("/blocks"); }
    catch (e) { setError(e instanceof Error ? e.message : "차단하지 못했어요."); setBusy(false); setOpen(false); }
  };
  return <span>
    <button type="button" className="text-btn muted" disabled={busy} onClick={() => setOpen(true)}>{busy ? "처리 중…" : "사용자 차단"}</button>
    {error && <span role="alert" className="form-error" style={{ marginLeft: 8 }}>{error}</span>}
    <ConfirmSheet
      open={open}
      title="이 사용자를 차단할까요?"
      message="서로의 글과 메시지가 보이지 않게 돼요. 나 › 차단한 사용자에서 다시 해제할 수 있어요."
      confirmLabel="차단하기"
      danger
      busy={busy}
      onClose={() => setOpen(false)}
      onConfirm={() => void block()}
    />
  </span>;
}
