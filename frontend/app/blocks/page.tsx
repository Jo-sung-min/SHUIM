"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/ui";
import { fetchBlocks, setUserBlocked } from "@/lib/safety";

export default function BlocksPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setIds(await fetchBlocks()); }
    catch (e) { setError(e instanceof Error ? e.message : "목록을 불러오지 못했어요."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <><TopBar title="차단한 사용자" right={<Link href="/me">나로 돌아가기</Link>} /><main className="screen stack">
    <p className="tiny muted">차단하면 서로의 글과 메시지가 제한됩니다.</p>
    {loading && <p role="status">불러오는 중…</p>}
    {error && <div role="alert"><p>{error}</p><button className="btn ghost" onClick={load}>다시 시도</button></div>}
    {!loading && !error && ids.length === 0 && <p>차단한 사용자가 없어요.</p>}
    {ids.map((id) => <div className="card row" key={id}><span className="grow tiny" style={{ overflowWrap: "anywhere" }}>사용자 {id}</span><button className="btn ghost sm" disabled={busy !== null} onClick={async () => {
      if (!window.confirm("이 사용자의 차단을 해제할까요?")) return;
      setBusy(id); setError("");
      try { await setUserBlocked(id, false); setIds((current) => current.filter((value) => value !== id)); }
      catch (e) { setError(e instanceof Error ? e.message : "차단을 해제하지 못했어요."); }
      finally { setBusy(null); }
    }}>{busy === id ? "처리 중…" : "차단 해제"}</button></div>)}
  </main></>;
}
