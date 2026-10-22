"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SkeletonList } from "./ui";
import { toastSuccess } from "@/lib/toast";

type Report = {
  id: string;
  reporterId: string;
  kind: "user" | "message" | "ai";
  targetId?: string | null;
  detail: string;
  createdAt: string | number;
  reviewedAt?: string | number | null;
};

const LABELS: Record<Report["kind"], string> = { user: "사용자", message: "메시지", ai: "AI 답변" };

function timestamp(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 확인 필요" : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function SafetyAdmin() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const [confirm, setConfirm] = useState<Report | null>(null);
  const reviewing = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/safety-reports", { credentials: "same-origin", cache: "no-store", signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "신고 목록을 불러오지 못했어요.");
      if (!Array.isArray(body?.reports)) throw new Error("신고 목록을 불러오지 못했어요. 다시 시도해 주세요.");
      setReports(body.reports);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해 주세요.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const review = async (report: Report, action: "dismiss" | "block") => {
    if (reviewing.current || (action === "block" && (report.kind === "ai" || !report.targetId))) return;
    reviewing.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/safety-reports/${encodeURIComponent(report.id)}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "신고를 처리하지 못했어요.");
      }
      setConfirm(null);
      toastSuccess(action === "block" ? "신고 대상을 이용 정지하고 검토를 마쳤어요." : "검토 완료로 표시했어요.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해 주세요.");
    } finally {
      reviewing.current = false;
      setBusy(false);
    }
  };

  const pending = reports.filter((report) => !report.reviewedAt);
  const visible = showReviewed ? reports : pending;

  return (
    <section aria-label="사용자와 AI 신고 검토" style={{ marginBottom: 24 }}>
      <div className="section-title">
        <span>사용자 · 메시지 · AI 신고 {pending.length > 0 ? `(${pending.length})` : ""}</span>
        <button type="button" className="text-btn" onClick={() => void load()} disabled={loading || busy}>새로고침</button>
      </div>
      <p className="tiny muted">신고 내용을 검토한 뒤 필요한 조치를 취해 주세요. AI 신고는 답변과 안전 기능을 개선하는 데 반영하고, 처리 후 검토 완료로 표시하세요.</p>
      <label className="tiny row" style={{ gap: 8, margin: "12px 0" }}>
        <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />검토 완료 포함
      </label>
      {error && <p className="notice warn" role="alert">{error}</p>}
      {loading ? <div role="status" aria-label="신고를 불러오고 있어요"><SkeletonList count={2} lines={2} head={false} /></div> : visible.length === 0 && !error ? <p className="tiny muted">표시할 신고가 없어요.</p> : (
        <div className="stack" aria-busy={busy}>
          {visible.map((report) => (
            <article key={report.id} className="card" style={{ padding: 16, overflowWrap: "anywhere" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <b>{LABELS[report.kind] ?? "기타"} 신고</b>
                <span className="badge gray">{report.reviewedAt ? "검토 완료" : "대기"}</span>
              </div>
              <p className="tiny muted">접수 {timestamp(report.createdAt)}</p>
              {report.targetId && <p className="tiny muted">대상 번호: {report.targetId}</p>}
              <p style={{ whiteSpace: "pre-wrap", margin: "12px 0" }}>{report.detail}</p>
              <details className="tiny muted"><summary>접수 정보</summary><p>접수 번호: {report.id}<br />신고자 번호: {report.reporterId}</p></details>
              {report.reviewedAt ? <p className="tiny muted">검토 {timestamp(report.reviewedAt)}</p> : (
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void review(report, "dismiss")}>검토 완료</button>
                  {report.kind !== "ai" && report.targetId && <button type="button" className="btn ghost danger sm" disabled={busy} onClick={() => { setError(null); setConfirm(report); }}>대상 이용 정지</button>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <Sheet open={confirm !== null} onClose={() => { if (!reviewing.current) setConfirm(null); }} title="신고 대상을 이용 정지할까요?">
        <p className="sheet-text">{confirm?.kind === "message" ? "이 메시지를 보낸 사용자의 계정을 이용 정지해요." : "신고된 사용자의 계정을 이용 정지해요."} 신고 내용과 대상을 확인한 뒤 진행하세요.</p>
        {confirm?.targetId && <p className="tiny muted" style={{ overflowWrap: "anywhere" }}>대상 번호: {confirm.targetId}</p>}
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm(null)}>취소</button>
          <button type="button" className="btn danger" disabled={busy || !confirm} aria-busy={busy} onClick={() => { if (confirm) void review(confirm, "block"); }}>{busy ? "처리 중…" : "이용 정지하고 완료"}</button>
        </div>
      </Sheet>
    </section>
  );
}
