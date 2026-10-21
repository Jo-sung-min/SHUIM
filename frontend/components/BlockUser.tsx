"use client";

import { useState } from "react";
import { setUserBlocked } from "@/lib/safety";

export default function BlockUser({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <span>
    <button type="button" className="text-btn" disabled={busy} onClick={async () => {
      if (!window.confirm("이 사용자를 차단할까요? 서로의 글과 메시지가 차단됩니다. 나 > 차단한 사용자에서 해제할 수 있어요.")) return;
      setBusy(true); setError("");
      try { await setUserBlocked(userId, true); window.location.assign("/blocks"); }
      catch (e) { setError(e instanceof Error ? e.message : "차단하지 못했어요."); setBusy(false); }
    }}>{busy ? "처리 중…" : "사용자 차단"}</button>
    {error && <span role="alert" className="tiny">{error}</span>}
  </span>;
}
