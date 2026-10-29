"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { shoutCatById } from "@/lib/community";
import {
  CircleDetail, CircleMember, Submission, decideSubmission, draftSubmission, fetchCircle, fetchMembers, fetchQueue, memberAction, updateCircle,
} from "@/lib/circles";
import { LoadError } from "@/components/CommunityUI";
import { Empty, SkeletonList, TopBar, fmtRelative } from "@/components/ui";
import { IconAlert, IconChevronL, IconInbox, IconSparkle, IconUsers } from "@/components/Icons";
import { showToast } from "@/lib/toast";
import styles from "../../circle.module.css";

type Tab = "queue" | "members" | "settings";
type QueueStatus = "pending" | "held" | "done";

/**
 * 소로우지기 화면. 검토 큐(위기 신호 먼저) — AI 로 다듬기 → 고쳐서 게시·보류·반려, 익명 답장.
 * 보낸 사람은 여기에도 나오지 않는다. 멤버 승인·내보내기, 공지·소개·가입 방식.
 */
export default function CircleAdminPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [c, setC] = useState<CircleDetail | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await fetchCircle(slug);
      if (!d.me.keeper) throw new Error("소로우지기만 볼 수 있어요");
      setC(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);

  const back = <button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>;
  if (loadError) return <><TopBar title="소로우지기" right={back} /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!c) return <><TopBar title="소로우지기" right={back} /><div className="screen" role="status" aria-label="불러오고 있어요"><SkeletonList count={3} lines={3} /></div></>;

  return (
    <>
      <TopBar title="소로우지기" eyebrow={c.name} right={back} />
      <div className={`screen ${styles.plain}`}>
        <nav className="ul-tabs" aria-label="소로우지기 메뉴" style={{ position: "relative" }}>
          {(["queue", "members", "settings"] as const).map((t) => (
            <a key={t} href={`#${t}`} className={tab === t ? "on" : ""} aria-current={tab === t ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab(t); }}>
              {t === "queue" ? `사연 검토${c.pendingCount ? ` ${c.pendingCount}` : ""}` : t === "members" ? `멤버${c.waitingMembers ? ` · 대기 ${c.waitingMembers}` : ""}` : "설정"}
            </a>
          ))}
        </nav>
        {tab === "queue" ? <Queue slug={c.slug} onCount={load} /> : tab === "members" ? <Members slug={c.slug} owner={c.me.role === "owner"} onCount={load} /> : <Settings c={c} onSaved={setC} />}
      </div>
    </>
  );
}

function Queue({ slug, onCount }: { slug: string; onCount: () => void }) {
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [list, setList] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setList(null);
    setError(null);
    fetchQueue(slug, status).then(setList).catch((e) => setError(e instanceof Error ? e.message : "연결 실패"));
  }, [slug, status]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className={styles.kinds} role="radiogroup" aria-label="검토 상태">
        {(["pending", "held", "done"] as const).map((st) => (
          <button key={st} type="button" role="radio" aria-checked={status === st} className={styles.kind} onClick={() => setStatus(st)}>
            {st === "pending" ? "기다리는 사연" : st === "held" ? "보류" : "처리한 사연"}
          </button>
        ))}
      </div>
      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : list === null ? (
        <SkeletonList count={2} lines={4} />
      ) : list.length === 0 ? (
        <Empty icon={<IconInbox />} title={status === "pending" ? "기다리는 사연이 없어요" : "아직 없어요"}>
          멤버가 사연을 보내면 여기에 모여요. 보낸 사람은 소로우지기에게도 보이지 않아요.
        </Empty>
      ) : (
        <div className={styles.subs}>
          {list.map((sub) => (
            <QueueItem key={sub.id} slug={slug} sub={sub} onDone={(next) => { if (status === "pending") setList(next); else load(); onCount(); }} />
          ))}
        </div>
      )}
    </>
  );
}

function QueueItem({ slug, sub, onDone }: { slug: string; sub: Submission; onDone: (next: Submission[]) => void }) {
  const open = sub.status === "pending" || sub.status === "held";
  const [text, setText] = useState(sub.aiDraft ?? sub.text);
  const [masked, setMasked] = useState<string[]>([]);
  const [reply, setReply] = useState(sub.reply ?? "");
  const [reason, setReason] = useState(sub.reason ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const cat = shoutCatById(sub.cat);

  const draft = async () => {
    setBusy("draft");
    try {
      const d = await draftSubmission(slug, sub.id);
      setText(d.text);
      setMasked(d.masked);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "다듬지 못했어요");
    } finally {
      setBusy(null);
    }
  };
  const decide = async (action: "publish" | "hold" | "reject") => {
    if (action === "reject" && !reason.trim()) { showToast("반려 사유를 적어 주세요. 보낸 사람에게 보여요"); return; }
    setBusy(action);
    try {
      const next = await decideSubmission(slug, sub.id, { action, text: action === "publish" ? text : undefined, reason: action !== "publish" ? reason : undefined, reply: reply || undefined });
      showToast(action === "publish" ? "게시했어요. 잠시 뒤 사연이 올라가요" : action === "hold" ? "보류했어요" : "반려했어요");
      onDone(next);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "처리하지 못했어요");
      setBusy(null);
    }
  };

  return (
    <article className={styles.subCard} data-crisis={sub.crisis ? "" : undefined}>
      <div className={styles.subHead}>
        {sub.crisis && <span className={`${styles.pill} ${styles.warn}`}><IconAlert aria-hidden="true" style={{ width: 14, height: 14 }} />위기 신호</span>}
        <span className={styles.pill}>{cat.label}</span>
        {sub.postNo && <span className={`${styles.pill} ${styles.ok}`}>#{sub.postNo} 게시</span>}
        {sub.status === "rejected" && <span className={styles.pill}>반려</span>}
        {sub.status === "held" && <span className={styles.pill}>보류</span>}
        <time>{fmtRelative(sub.createdAt)}</time>
      </div>
      {sub.crisis && open && (
        <p className={styles.subNote}><b>먼저 살펴 주세요</b>위험한 마음이 담긴 사연일 수 있어요. 게시 여부와 별개로 따뜻한 답장과 함께 109(자살예방상담전화)를 알려 주세요.</p>
      )}
      {!open ? (
        <>
          <p className={styles.subText}>{sub.text}</p>
          {sub.reason && <p className={styles.subNote}><b>사유</b>{sub.reason}</p>}
          {sub.reply && <p className={styles.subNote}><b>답장</b>{sub.reply}</p>}
        </>
      ) : (
        <div className={styles.editor}>
          {sub.aiDraft || masked.length ? null : <p className={styles.subText} style={{ marginTop: 0 }}>{sub.text}</p>}
          <button type="button" className="btn soft sm" disabled={busy !== null} onClick={draft}><IconSparkle />{busy === "draft" ? "다듬는 중…" : "AI 로 다듬고 가리기"}</button>
          {masked.length > 0 && <span className={`${styles.pill} ${styles.ok}`}>가림: {masked.join(", ")}</span>}
          <label className={styles.field}>
            <span>게시할 사연 (고칠 수 있어요)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1200))} maxLength={1200} />
          </label>
          <label className={styles.field}>
            <span>보낸 사람에게 익명 답장 (선택)</span>
            <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={300} placeholder="예: 용기 내 줘서 고마워요" />
          </label>
          <label className={styles.field}>
            <span>보류·반려 사유 (보낸 사람에게 보여요)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="예: 특정인이 드러날 수 있어요" />
          </label>
          <div className={styles.subActions}>
            <button className="btn sm" disabled={busy !== null || !text.trim()} onClick={() => decide("publish")}>{busy === "publish" ? "게시하는 중…" : "게시"}</button>
            {sub.status !== "held" && <button className="btn ghost sm" disabled={busy !== null} onClick={() => decide("hold")}>보류</button>}
            <button className="btn ghost danger sm" disabled={busy !== null} onClick={() => decide("reject")}>반려</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Members({ slug, owner, onCount }: { slug: string; owner: boolean; onCount: () => void }) {
  const [list, setList] = useState<CircleMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    fetchMembers(slug).then(setList).catch((e) => setError(e instanceof Error ? e.message : "연결 실패"));
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (m: CircleMember, action: "approve" | "remove" | "keeper" | "unkeeper") => {
    setBusy(m.userId);
    try {
      setList(await memberAction(slug, m.userId, action));
      onCount();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "처리하지 못했어요");
    } finally {
      setBusy(null);
    }
  };
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!list) return <SkeletonList count={4} lines={1} />;
  if (list.length === 0) return <Empty icon={<IconUsers />} title="아직 멤버가 없어요" />;
  return (
    <div>
      <p className={styles.sub}>멤버 목록과 사연은 이어지지 않아요. 누가 어떤 사연을 보냈는지는 여기서도 알 수 없어요.</p>
      {list.map((m) => (
        <div key={m.userId} className={styles.member}>
          <b>
            {m.nick}
            {m.role === "owner" && <span className={styles.pill}>연 사람</span>}
            {m.role === "keeper" && <span className={styles.pill}>소로우지기</span>}
            {m.verified && <span className={`${styles.pill} ${styles.ok}`}>인증</span>}
            {m.status === "pending" && <span className={`${styles.pill} ${styles.warn}`}>승인 대기</span>}
          </b>
          {m.role !== "owner" && (
            <div className={styles.memberBtns}>
              {m.status === "pending" && <button className="btn sm" disabled={busy === m.userId} onClick={() => act(m, "approve")}>승인</button>}
              {owner && m.status === "active" && (
                <button className="btn ghost sm" disabled={busy === m.userId} onClick={() => act(m, m.role === "keeper" ? "unkeeper" : "keeper")}>{m.role === "keeper" ? "지기 해제" : "지기로"}</button>
              )}
              {(owner || m.role === "member") && <button className="btn ghost danger sm" disabled={busy === m.userId} onClick={() => act(m, "remove")}>{m.status === "pending" ? "거절" : "내보내기"}</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Settings({ c, onSaved }: { c: CircleDetail; onSaved: (c: CircleDetail) => void }) {
  const owner = c.me.role === "owner";
  const org = c.kind === "school" || c.kind === "company";
  const [notice, setNotice] = useState(c.notice);
  const [intro, setIntro] = useState(c.intro);
  const [busy, setBusy] = useState(false);
  const save = async (input: Parameters<typeof updateCircle>[1], done = "저장했어요") => {
    setBusy(true);
    try {
      onSaved(await updateCircle(c.slug, input));
      showToast(done);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span>공지 한 줄</span>
        <input value={notice} onChange={(e) => setNotice(e.target.value)} maxLength={200} placeholder="예: 특정인을 저격하는 사연은 올리지 않아요" />
      </label>
      {owner && (
        <label className={styles.field}>
          <span>소개</span>
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={200} style={{ minHeight: 96 }} />
        </label>
      )}
      <button className="btn block" disabled={busy} onClick={() => save(owner ? { notice, intro } : { notice })}>저장</button>

      {owner && (
        <>
          <div className={styles.field}>
            <span>사연 공개</span>
            <div className={styles.seg} role="radiogroup" aria-label="사연 공개 범위">
              <button type="button" role="radio" aria-checked={c.visibility === "public"} className={styles.opt} disabled={busy} onClick={() => save({ visibility: "public" })}>모두에게</button>
              <button type="button" role="radio" aria-checked={c.visibility === "members"} className={styles.opt} disabled={busy} onClick={() => save({ visibility: "members" })}>멤버에게만</button>
            </div>
          </div>
          {!org && (
            <div className={styles.field}>
              <span>가입 방식</span>
              <div className={styles.seg} role="radiogroup" aria-label="가입 방식">
                {(["open", "approve", "invite"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={c.joinMode === m} className={styles.opt} disabled={busy} onClick={() => save({ joinMode: m })}>
                    {m === "open" ? "누구나" : m === "approve" ? "승인 후" : "초대 코드"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {c.joinMode === "invite" && c.inviteCode && (
            <div className={styles.field}>
              <span>초대 코드</span>
              <div className={styles.devCode}><b>{c.inviteCode}</b></div>
              <button className="btn ghost sm" disabled={busy} onClick={() => save({ regenerateInvite: true }, "새 초대 코드를 만들었어요")}>새 코드 만들기</button>
            </div>
          )}
          {org && (
            <p className={styles.sub} style={{ margin: 0 }}>
              @{c.domain} 메일로 인증한 사람만 멤버가 돼요.{c.verified ? " 인증 소로우예요." : " 나도 이 메일로 인증하면 ‘인증 소로우’ 표시가 붙고, 멤버 10명이 넘으면 둘러보기에 나와요."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
