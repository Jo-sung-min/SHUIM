"use client";

import { useId, useRef, useState } from "react";
import { Sheet } from "./ui";
import { toastSuccess } from "@/lib/toast";

type SafetyReportKind = "user" | "message" | "ai";

const LABELS: Record<SafetyReportKind, string> = {
  user: "사용자 신고",
  message: "메시지 신고",
  ai: "AI 답변 신고",
};

export default function SafetyReport({
  kind,
  targetId,
  context,
}: {
  kind: SafetyReportKind;
  targetId?: string;
  context?: string;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const source = context?.trim();
  const close = () => { if (!submitting.current) setOpen(false); };

  const submit = async () => {
    const text = detail.trim();
    if (submitting.current || !text) return;
    if (kind !== "ai" && !targetId) {
      setError("신고 대상을 확인하지 못했어요. 화면을 다시 열어 주세요.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/safety-reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(targetId ? { targetId } : {}), detail: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "신고를 보내지 못했어요. 다시 시도해 주세요.");
      }
      setDetail("");
      setOpen(false);
      toastSuccess("신고를 접수했어요");
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="text-btn muted" onClick={() => { setError(null); setOpen(true); }}>
        {LABELS[kind]}
      </button>
      <Sheet open={open} onClose={close} title={LABELS[kind]}>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p className="tiny muted">문제가 된 부분과 이유를 알려 주세요. 신고 대상과 아래에 작성한 내용이 운영팀에 전달돼요. 비밀번호나 불필요한 개인정보는 적지 마세요.</p>
          {source && (
            <details style={{ margin: "14px 0" }}>
              <summary className="tiny">신고할 내용 참고하기</summary>
              <p className="tiny muted">참고 내용은 자동으로 전송되지 않아요. 필요한 부분만 아래 신고 내용에 복사해 주세요.</p>
              <div className="notice" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflowY: "auto", userSelect: "text" }}>{source}</div>
            </details>
          )}
          <div className="field">
            <label htmlFor={fieldId}>신고 내용</label>
            <textarea id={fieldId} autoFocus required maxLength={2000} rows={5} value={detail} disabled={busy}
              onChange={(e) => setDetail(e.target.value)} placeholder={kind === "ai" ? "문제가 된 답변의 일부와 이유를 적어 주세요." : "예: 상대방이 원치 않는 메시지를 반복해서 보내요."}
              aria-describedby={`${fieldId}-count`} />
            <span id={`${fieldId}-count`} className="tiny muted">{detail.length.toLocaleString()} / 2,000자</span>
          </div>
          {error && <p className="notice warn" role="alert">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn ghost" onClick={close} disabled={busy}>취소</button>
            <button type="submit" className="btn" disabled={busy || !detail.trim()}>{busy ? "보내는 중…" : "신고 보내기"}</button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
