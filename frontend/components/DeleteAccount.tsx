"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deleteAccount, fetchMe, type Me } from "@/lib/auth";

export default function DeleteAccount() {
  const [me, setMe] = useState<Me | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    fetchMe(true).then((current) => { if (active) setMe(current); }).catch(() => {
      if (active) setMe({ user: null, admin: false, configured: false, kakao: false, toss: false });
    });
    return () => { active = false; };
  }, []);

  if (done) return <div role="status" className="notice">계정과 연결된 정보가 삭제되었습니다. 이 기기에 저장된 해당 계정의 기록도 정리했어요. 사진과 복구용 사본의 삭제 범위는 위 안내에서 확인할 수 있어요. <a href="/">홈으로</a></div>;
  if (!me) return <p role="status">계정 상태를 확인하고 있어요…</p>;
  if (!me.configured) return <p role="alert">지금은 계정을 확인하기 어려워요. 잠시 후 다시 시도하거나 아래 이메일로 삭제를 요청해 주세요.</p>;
  if (!me.user) return <div className="stack"><p>계정을 삭제하려면 웹에서 로그인한 뒤 이 페이지로 돌아오세요. 앱을 설치하지 않아도 진행할 수 있습니다. 로그인할 수 없다면 아래 이메일로 요청해 주세요.</p><Link href="/auth?next=delete" className="btn">로그인하고 삭제하기</Link></div>;
  return <form className="card stack" aria-busy={busy} onSubmit={async (e) => {
    e.preventDefault();
    if (submitting.current || confirmation !== "계정 삭제") return;
    submitting.current = true;
    setBusy(true); setError("");
    try { await deleteAccount(confirmation, me.user!.id); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했어요. 다시 시도해 주세요."); }
    finally { submitting.current = false; setBusy(false); }
  }}>
    <p><b>{me.user.nick}</b> 님의 계정을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p>
    <label className="field">확인을 위해 ‘계정 삭제’를 입력해 주세요.<input autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="계정 삭제" disabled={busy} /></label>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <button type="submit" className="btn danger" disabled={busy || confirmation !== "계정 삭제"} aria-busy={busy}>{busy ? "삭제 처리 중…" : "계정과 연결된 정보 삭제"}</button>
  </form>;
}
