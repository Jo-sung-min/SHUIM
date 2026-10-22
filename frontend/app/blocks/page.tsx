"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmSheet, Empty, LoadError, SkeletonList, TopBar } from "@/components/ui";
import { IconChevronL, IconShield } from "@/components/Icons";
import { fetchBlocks, setUserBlocked } from "@/lib/safety";
import { toastSuccess } from "@/lib/toast";

export default function BlocksPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setIds(await fetchBlocks()); }
    catch (e) { setError(e instanceof Error ? e.message : "목록을 불러오지 못했어요."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unblock = async (id: string) => {
    setBusy(id);
    try {
      await setUserBlocked(id, false);
      setIds((current) => current.filter((value) => value !== id));
      setConfirmId(null);
      toastSuccess("차단을 해제했어요");
    } catch (e) {
      setError(e instanceof Error ? e.message : "차단을 해제하지 못했어요.");
      setConfirmId(null);
    } finally { setBusy(null); }
  };

  const back = <Link href="/me" className="icon-btn" aria-label="내 공간으로"><IconChevronL /></Link>;
  return <><TopBar title="차단한 사용자" right={back} /><main className="screen stack">
    <p className="tiny muted" style={{ margin: 0 }}>차단하면 서로의 글과 메시지가 제한돼요.</p>
    {loading ? <div role="status" aria-label="차단 목록을 불러오고 있어요"><SkeletonList count={3} lines={1} head={false} /></div>
      : error && ids.length === 0 ? <LoadError message={error} onRetry={load} />
      : ids.length === 0 ? <Empty icon={<IconShield />} title="차단한 사용자가 없어요">프로필이나 대화 화면에서 사용자를 차단할 수 있어요.</Empty>
      : <>
        {error && <p className="notice warn" role="alert">{error}</p>}
        {ids.map((id) => <div className="card row" key={id}><span className="grow" style={{ overflowWrap: "anywhere", fontSize: 15 }}>사용자 {id}</span><button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => setConfirmId(id)}>{busy === id ? "처리 중…" : "차단 해제"}</button></div>)}
      </>}
    <ConfirmSheet
      open={confirmId !== null}
      title="차단을 해제할까요?"
      message="해제하면 서로의 글과 메시지를 다시 볼 수 있어요."
      confirmLabel="차단 해제"
      busy={busy !== null}
      onClose={() => setConfirmId(null)}
      onConfirm={() => { if (confirmId) void unblock(confirmId); }}
    />
  </main></>;
}
