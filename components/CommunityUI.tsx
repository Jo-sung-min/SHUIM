"use client";

import { useState } from "react";
import {
  Comment,
  CommunityStore,
  REPORT_REASONS,
  REPORT_THRESHOLD,
  ReportReason,
  Target,
  api,
  commentsOf,
  findTarget,
  hasReported,
  isBlocked,
  isFlagged,
  userById,
} from "@/lib/community";
import { Sheet, fmtRelative } from "./ui";
import { IconFlag, IconMore, IconSend, IconTrash } from "./Icons";

/** 변경 결과(최신 store)를 화면에 반영하고, 실패하면 알림 */
export async function run(onChange: (s: CommunityStore) => void, fn: () => Promise<CommunityStore>, onError?: (m: string) => void) {
  try {
    onChange(await fn());
  } catch (e) {
    const m = e instanceof Error ? e.message : "잠시 후 다시 시도해요";
    if (onError) onError(m);
    else window.alert(m);
  }
}

/* ---------- 힘내요 버튼 ---------- */
export function CheerButton({ count, on, onClick, small }: { count: number; on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button className={`pillbtn cheer ${on ? "on" : ""}`} style={small ? { padding: "5px 10px", fontSize: 12 } : undefined} onClick={onClick} aria-pressed={on}>
      <span className="emoji">💪</span> 힘내요 <span className="n">{count}</span>
    </button>
  );
}

/* ---------- 댓글 한 줄 ---------- */
function CommentRow({ s, comment, onCheer, onMenu }: { s: CommunityStore; comment: Comment; onCheer: () => void; onMenu: () => void }) {
  const me = s.me.id;
  const author = userById(s, comment.authorId);
  const [show, setShow] = useState(false);
  if (isFlagged(comment) && !show) {
    return (
      <div className="comment">
        <button className="flagged-box" style={{ padding: "10px 12px" }} onClick={() => setShow(true)}>
          <b>검토 중인 댓글이에요</b>
          신고 {REPORT_THRESHOLD}번 이상 · 눌러서 보기
        </button>
      </div>
    );
  }
  return (
    <div className="comment">
      <div className="meta">
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{comment.authorId === me ? "나" : author.nick}</span>
        <span>·</span>
        <span>{fmtRelative(comment.createdAt)}</span>
        <button className="icon-btn more" aria-label="더보기" onClick={onMenu}><IconMore style={{ width: 15, height: 15 }} /></button>
      </div>
      <p className="text">{comment.text}</p>
      <CheerButton small count={comment.cheers.length} on={comment.cheers.includes(me)} onClick={onCheer} />
    </div>
  );
}

/* ---------- 댓글 스레드 (목록 + 입력) ---------- */
export function CommentThread({
  s,
  postId,
  onChange,
  onMenu,
  placeholder = "위로 한마디. 조언보다 '그랬구나'가 먼저예요.",
}: {
  s: CommunityStore;
  postId: string;
  onChange: (s: CommunityStore) => void;
  onMenu: (t: Target) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const comments = commentsOf(s, postId);
  const blocked = isBlocked(s.me);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    await run(onChange, () => api.addComment(postId, t));
    setBusy(false);
    setText("");
  };
  return (
    <>
      <div className="comment-list">
        {comments.length === 0 && <p className="tiny muted" style={{ margin: "6px 0 10px" }}>아직 위로가 없어요. 첫 한마디를 남겨요.</p>}
        {comments.map((cm) => (
          <CommentRow
            key={cm.id}
            s={s}
            comment={cm}
            onCheer={() => run(onChange, () => api.toggleCheer({ kind: "comment", id: cm.id }))}
            onMenu={() => onMenu({ kind: "comment", id: cm.id })}
          />
        ))}
      </div>
      {blocked ? (
        <div className="notice warn">차단된 계정은 댓글을 쓸 수 없어요.</div>
      ) : (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={1}
            maxLength={300}
            onInput={(ev) => {
              const t = ev.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
            }}
          />
          <button type="submit" className="btn" disabled={!text.trim() || busy} aria-label="보내기">
            <IconSend style={{ width: 18, height: 18 }} />
          </button>
        </form>
      )}
    </>
  );
}

/* ---------- ⋯ 메뉴: 내 글 삭제 / 신고 ---------- */
export function TargetMenuSheet({
  s,
  target,
  onClose,
  onChange,
  onReport,
  onDeleted,
}: {
  s: CommunityStore;
  target: Target | null;
  onClose: () => void;
  onChange: (s: CommunityStore) => void;
  onReport: (t: Target) => void;
  onDeleted?: (t: Target) => void;
}) {
  const item = target ? findTarget(s, target) : undefined;
  const label = target?.kind === "post" ? "이 외침" : target?.kind === "feed" ? "이 위로글" : "이 댓글";
  return (
    <Sheet open={Boolean(target && item)} onClose={onClose} title={label}>
      {target && item && (
        <div className="stack">
          {item.authorId === s.me.id ? (
            <button
              className="btn ghost"
              onClick={async () => {
                await run(onChange, () =>
                  target.kind === "post" ? api.deletePost(target.id) : target.kind === "feed" ? api.deleteFeedPost(target.id) : api.deleteComment(target.id)
                );
                onDeleted?.(target);
                onClose();
              }}
            >
              <IconTrash style={{ width: 18, height: 18 }} /> 내 글 삭제
            </button>
          ) : hasReported(s, item) ? (
            <div className="notice">이미 신고했어요. 검토 결과는 관리자가 확인해요.</div>
          ) : (
            <button
              className="btn ghost"
              onClick={() => {
                onReport(target);
                onClose();
              }}
            >
              <IconFlag style={{ width: 18, height: 18 }} /> 위로가 아니에요 · 신고하기
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>닫기</button>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- 신고 시트 ---------- */
export function ReportSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (reason: ReportReason) => void }) {
  const [reason, setReason] = useState<ReportReason>("not_comfort");
  return (
    <Sheet open={open} onClose={onClose} title="신고하기">
      <p className="tiny muted" style={{ margin: "0 0 12px" }}>
        신고가 {REPORT_THRESHOLD}번 쌓이면 글이 가려지고 관리자가 검토해요. 관리자는 작성자를 차단할 수 있어요.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        {REPORT_REASONS.map((r) => (
          <button key={r.id} type="button" className={`reason glass ${reason === r.id ? "on" : ""}`} onClick={() => setReason(r.id)}>
            <span className="radio" />
            <span>
              <b>{r.label}</b>
              <small>{r.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={() => onSubmit(reason)}>신고하기</button>
      </div>
    </Sheet>
  );
}

/* ---------- 서버 연결 실패 안내 ---------- */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="empty">
      <div className="ico">☁️</div>
      <b>서버에 연결하지 못했어요</b>
      {message}
      <div style={{ marginTop: 14 }}>
        <button className="btn sm soft" onClick={onRetry}>다시 시도</button>
      </div>
    </div>
  );
}
