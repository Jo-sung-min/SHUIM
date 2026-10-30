"use client";

import TitleChip from "./TitleChip";
import { useEffect, useRef, useState } from "react";
import {
  Comment,
  CommunityStore,
  REPORT_REASONS,
  REPORT_THRESHOLD,
  ReportReason,
  Target,
  api,
  findTarget,
  repliesOf,
  topCommentsOf,
  hasReported,
  isBlocked,
  isFlagged,
  userById,
} from "@/lib/community";
import Link from "next/link";
import { Sheet, fmtRelative } from "./ui";
export { LoadError } from "./ui";
import { IconFlag, IconMore, IconSend, IconTrash } from "./Icons";
import CheerFlame from "./CheerFlame";
import { showToast, tick, toastSuccess } from "@/lib/toast";
import { route } from "@/lib/routes";

/** 변경 결과(최신 store)를 화면에 반영하고, 실패하면 알림 */
export async function run(onChange: (s: CommunityStore) => void, fn: () => Promise<CommunityStore>, onError?: (m: string) => void) {
  try {
    onChange(await fn());
    return true;
  } catch (e) {
    const m = e instanceof Error ? e.message : "잠시 후 다시 시도해요";
    if (onError) onError(m);
    else showToast(m);
    return false;
  }
}

/* ---------- 선 아이콘 액션 (테두리 없음, 아이콘 + 숫자) ---------- */
export function LineAction({ icon, label, onClick, on, vertical, ariaLabel }: { icon: React.ReactNode; label?: React.ReactNode; onClick: () => void | Promise<unknown>; on?: boolean; vertical?: boolean; ariaLabel: string }) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const activate = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try { await onClick(); }
    catch (error) { showToast(error instanceof Error ? error.message : "잠시 후 다시 시도해요"); }
    finally { locked.current = false; setBusy(false); }
  };
  return (
    <button type="button" className={`lact ${vertical ? "v" : ""} ${on ? "on" : ""}`} onClick={activate} disabled={busy} aria-busy={busy} aria-pressed={on} aria-label={ariaLabel}>
      <span className="ico">{icon}</span>
      {label !== undefined && <span className="lbl">{label}</span>}
    </button>
  );
}

/* ---------- 힘내요: 선 하트 → 누르면 3D 하트가 튀어나온다 ---------- */
export function CheerButton({ count, on, onClick, small, vertical }: { count: number; on: boolean; onClick: () => void | Promise<unknown>; small?: boolean; vertical?: boolean }) {
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(false), 900);
    return () => clearTimeout(t);
  }, [burst]);
  return (
    <LineAction
      vertical={vertical}
      on={on}
      ariaLabel="힘내요"
      icon={<CheerFlame on={on} burst={burst} size={vertical ? 30 : small ? 18 : 22} />}
      label={count}
      onClick={() => {
        if (!on) { setBurst(true); tick(); }
        return onClick();
      }}
    />
  );
}

/* ---------- 댓글 한 줄 ---------- */
/** 답글 대상: 어느 댓글(최상위)에, 누구에게 */
export interface ReplyTarget { parentId: string; nick: string }

/**
 * 댓글 한 줄. 최상위 댓글이면 아래에 "답글 달기"와 답글 목록(접기/펼치기)이 붙는다.
 * 답글(대댓글) 줄에서 "답글 달기"를 누르면 같은 부모 댓글에 그 사람 앞으로 답글이 달린다 (인스타그램처럼 한 단계만).
 */
export function CommentRow({ s, comment, onCheer, onMenu, onReply, replies, onReplyCheer, onReplyMenu }: {
  s: CommunityStore; comment: Comment; onCheer: () => void | Promise<unknown>; onMenu: () => void;
  onReply?: (target: ReplyTarget) => void;
  replies?: Comment[];
  onReplyCheer?: (reply: Comment) => void | Promise<unknown>;
  onReplyMenu?: (reply: Comment) => void;
}) {
  const me = s.me.id;
  const author = userById(s, comment.authorId);
  const [show, setShow] = useState(false);
  const [openReplies, setOpenReplies] = useState(false);
  const parentId = comment.parentId ?? comment.id;
  const nick = comment.authorId === me ? "나" : author.nick;
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
  const list = replies ?? [];
  // 방금(몇 초 안에) 내가 남긴 댓글은 한 번 물들었다 가라앉는다
  const justAdded = comment.authorId === me && Math.abs(Date.now() - comment.createdAt) < 8000;
  return (
    <>
      <div className={`comment${justAdded ? " just-added" : ""}`}>
        <div className="meta">
          <Link href={route(`/u/${comment.authorId}`)} style={{ color: "var(--text)", fontWeight: 600 }}>{nick}</Link>
          <TitleChip title={author.title} small />
          <span>·</span>
          <span>{fmtRelative(comment.createdAt)}</span>
          <button className="icon-btn more" aria-label="더보기" onClick={onMenu}><IconMore style={{ width: 15, height: 15 }} /></button>
        </div>
        <p className="text">{comment.text}</p>
        <div className="acts">
          <CheerButton small count={comment.cheers.length} on={comment.cheers.includes(me)} onClick={onCheer} />
          {onReply && <button type="button" className="reply-btn" onClick={() => onReply({ parentId, nick: author.nick })}>답글 달기</button>}
        </div>
      </div>
      {list.length > 0 && (
        <>
          <button type="button" className="replies-toggle" aria-expanded={openReplies} onClick={() => setOpenReplies((v) => !v)}>
            {openReplies ? "답글 숨기기" : `답글 ${list.length}개 보기`}
          </button>
          {openReplies && (
            <div className="replies">
              {list.map((r) => (
                <CommentRow
                  key={r.id}
                  s={s}
                  comment={r}
                  onCheer={() => onReplyCheer?.(r)}
                  onMenu={() => onReplyMenu?.(r)}
                  onReply={onReply}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
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
  const comments = topCommentsOf(s, postId);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  return (
    <>
      <div className="comment-list">
        {comments.length === 0 && <p className="tiny muted" style={{ margin: "6px 0 10px" }}>아직 위로가 없어요. 첫 한마디를 남겨요.</p>}
        {comments.map((cm) => (
          <CommentRow
            key={cm.id}
            s={s}
            comment={cm}
            replies={repliesOf(s, cm.id)}
            onCheer={() => run(onChange, () => api.toggleCheer({ kind: "comment", id: cm.id }))}
            onMenu={() => onMenu({ kind: "comment", id: cm.id })}
            onReply={setReplyTo}
            onReplyCheer={(r) => run(onChange, () => api.toggleCheer({ kind: "comment", id: r.id }))}
            onReplyMenu={(r) => onMenu({ kind: "comment", id: r.id })}
          />
        ))}
      </div>
      <CommentComposer s={s} postId={postId} onChange={onChange} placeholder={placeholder} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
    </>
  );
}

/* ---------- 댓글 입력창 (스레드 아래, 또는 외침 글 화면 하단 고정) ---------- */
export function CommentComposer({
  s,
  postId,
  onChange,
  placeholder = "위로 한마디. 조언보다 '그랬구나'가 먼저예요.",
  className,
  replyTo,
  onCancelReply,
}: {
  s: CommunityStore;
  postId: string;
  onChange: (s: CommunityStore) => void;
  placeholder?: string;
  className?: string;
  /** 있으면 이 댓글의 답글로 올라간다 (입력창 위에 "○○ 님에게 답글" 띠) */
  replyTo?: ReplyTarget | null;
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const blocked = isBlocked(s.me);
  // 답글 대상이 정해지면 바로 입력할 수 있게 포커스
  useEffect(() => { if (replyTo) field.current?.focus(); }, [replyTo]);
  const submit = async () => {
    const t = text.trim();
    if (!t || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const saved = await run(onChange, () => api.addComment(postId, t, replyTo?.parentId));
      if (saved) {
        setText("");
        onCancelReply?.();
        if (field.current) field.current.style.height = "auto";
        toastSuccess(replyTo ? "답글을 남겼어요" : "위로를 남겼어요");
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      {blocked ? (
        <div className={`notice warn ${className ?? ""}`}>차단된 계정은 댓글을 쓸 수 없어요.</div>
      ) : (
        <form
          className={`composer ${replyTo ? "replying" : ""} ${className ?? ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {replyTo && (
            <div className="reply-bar">
              <span><b>{replyTo.nick}</b> 님에게 답글 남기는 중</span>
              <button type="button" onClick={onCancelReply} aria-label="답글 취소">취소</button>
            </div>
          )}
          <textarea
            ref={field}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            placeholder={replyTo ? `${replyTo.nick} 님에게 답글…` : placeholder}
            rows={1}
            maxLength={300}
            onInput={(ev) => {
              const t = ev.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
            }}
          />
          <button type="submit" className="btn" disabled={!text.trim() || busy} aria-busy={busy} aria-label={busy ? "댓글 보내는 중" : "보내기"}>
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
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const item = target ? findTarget(s, target) : undefined;
  const label = target?.kind === "post" ? "이 외침" : target?.kind === "feed" ? "이 위로글" : "이 댓글";
  return (
    <Sheet open={Boolean(target && item)} onClose={() => { if (!locked.current) onClose(); }} title={label}>
      {target && item && (
        <div className="stack">
          {item.authorId === s.me.id ? (
            <button
              className="btn ghost danger"
              disabled={busy}
              aria-busy={busy}
              onClick={async () => {
                if (locked.current) return;
                locked.current = true;
                setBusy(true);
                try {
                  const deleted = await run(onChange, () =>
                    target.kind === "post" ? api.deletePost(target.id) : target.kind === "feed" ? api.deleteFeedPost(target.id) : api.deleteComment(target.id)
                  );
                  if (deleted) { onDeleted?.(target); onClose(); }
                } finally { locked.current = false; setBusy(false); }
              }}
            >
              <IconTrash style={{ width: 18, height: 18 }} /> {busy ? "삭제하는 중…" : "내 글 삭제"}
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
          <button className="btn ghost" disabled={busy} onClick={onClose}>닫기</button>
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

