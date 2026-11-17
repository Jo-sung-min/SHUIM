"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sheet } from "./ui";
import { toastSuccess } from "@/lib/toast";

/** circle = 소로우 자체, space = 3D 공간의 방명록("guestbook:<id>")·풍등 소원("lantern:<id>") */
export type SafetyReportKind = "user" | "message" | "ai" | "circle" | "space";

const LABELS: Record<SafetyReportKind, string> = {
  user: "사용자 신고",
  message: "메시지 신고",
  ai: "AI 답변 신고",
  circle: "소로우 신고",
  space: "글 신고",
};

const PLACEHOLDERS: Record<SafetyReportKind, string> = {
  user: "예: 상대방이 원치 않는 메시지를 반복해서 보내요.",
  message: "예: 상대방이 원치 않는 메시지를 반복해서 보내요.",
  ai: "문제가 된 답변의 일부와 이유를 적어 주세요.",
  circle: "예: 소로우 이름이나 소개, 사진에 불쾌한 내용이 있어요.",
  space: "예: 욕설이나 개인정보가 적혀 있어요.",
};

/** 서버 오류 문구를 그대로 보여 주되, 너무 기술적인 응답(HTML 등)은 쉬운 말로 바꾼다 */
async function reportError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = typeof body?.error === "string" ? body.error.trim() : "";
  if (message && message.length <= 200) return message;
  if (res.status === 429) return "신고가 많이 접수됐어요. 잠시 후 다시 시도해 주세요.";
  if (res.status === 401) return "로그인 정보를 확인하지 못했어요. 다시 들어와 주세요.";
  return "신고를 보내지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/**
 * 신고 시트 (열고 닫기를 부르는 쪽이 정한다). 3D 공간·방명록처럼 버튼 모양이 다른 곳에서 쓴다.
 * initialDetail 은 사라지는 글(풍등 소원)처럼 운영팀이 나중에 볼 수 없는 내용을 함께 보내야 할 때 미리 채워 둔다.
 */
export function SafetyReportSheet({
  open,
  onClose,
  kind,
  targetId,
  title,
  context,
  initialDetail = "",
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  kind: SafetyReportKind;
  targetId?: string;
  title?: string;
  context?: string;
  initialDetail?: string;
  onSubmitted?: () => void;
}) {
  const fieldId = useId();
  const [detail, setDetail] = useState(initialDetail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const source = context?.trim();
  const heading = title ?? LABELS[kind];
  const close = () => { if (!submitting.current) onClose(); };

  // 새 대상으로 다시 열면 이전 입력과 오류를 비운다
  useEffect(() => {
    if (!open) return;
    setDetail(initialDetail);
    setError(null);
  }, [open, kind, targetId, initialDetail]);

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
        body: JSON.stringify({ kind, ...(targetId ? { targetId } : {}), detail: text.slice(0, 2000) }),
      });
      if (!res.ok) throw new Error(await reportError(res));
      setDetail("");
      submitting.current = false;
      onClose();
      toastSuccess("신고를 접수했어요");
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error && e.name === "Error" ? e.message : "연결을 확인하고 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={heading}>
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
            onChange={(e) => setDetail(e.target.value)} placeholder={PLACEHOLDERS[kind]}
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
  );
}

export default function SafetyReport({
  kind,
  targetId,
  context,
  label,
}: {
  kind: SafetyReportKind;
  targetId?: string;
  context?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-btn muted" onClick={() => setOpen(true)}>
        {label ?? LABELS[kind]}
      </button>
      <SafetyReportSheet open={open} onClose={() => setOpen(false)} kind={kind} targetId={targetId} context={context} />
    </>
  );
}
