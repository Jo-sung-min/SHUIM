"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SHOUT_CATEGORIES, ShoutCat } from "@/lib/community";
import { CircleDetail, Draft, fetchCircle, personalInfoHints, previewSubmission, sendSubmission } from "@/lib/circles";
import { hasCrisisSignal } from "@/lib/crisis";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { LoadError } from "@/components/CommunityUI";
import { SkeletonList, TopBar } from "@/components/ui";
import { IconChevronL, IconSparkle } from "@/components/Icons";
import styles from "../../circle.module.css";
import shout from "../../../shout/shout.module.css";

const MAX = 1200;

/**
 * 사연 보내기. 실명·연락처처럼 보이는 것을 바로 알려 주고, AI 로 다듬고 가린 미리보기를 볼 수 있다.
 * 보낸 사연은 소로우지기가 검토해 '#번호'로 올린다 (게시 시각은 10~90분 늦춰져 보낸 시각으로 짐작할 수 없다).
 */
export default function SubmitPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [c, setC] = useState<CircleDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cat, setCat] = useState<ShoutCat>("misfortune");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ crisis: boolean } | null>(null);

  useEffect(() => {
    fetchCircle(slug).then(setC).catch((e) => setLoadError(e instanceof Error ? e.message : "연결 실패"));
  }, [slug]);

  const hints = useMemo(() => personalInfoHints(text), [text]);
  const back = <button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>;

  if (loadError) return <><TopBar title="사연 보내기" right={back} /><div className="screen"><LoadError message={loadError} onRetry={() => location.reload()} /></div></>;
  if (!c) return <><TopBar title="사연 보내기" right={back} /><div className="screen" role="status" aria-label="불러오고 있어요"><SkeletonList count={1} lines={4} /></div></>;

  if (c.me.status !== "active") {
    return (
      <>
        <TopBar title="사연 보내기" right={back} />
        <div className={`screen ${styles.locked}`}>
          <b>멤버만 사연을 보낼 수 있어요</b>
          {c.name}에 먼저 가입해 주세요.
          <Link href={`/c/${c.slug}`} className="btn" style={{ marginTop: 8 }}>{c.name}로 가기</Link>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <>
        <TopBar title="사연을 보냈어요" right={back} />
        <div className={`screen ${styles.locked}`}>
          <b>소로우지기가 읽고 다듬어 올려 줄 거예요</b>
          보낸 사람이 누구인지는 소로우지기도 몰라요. 게시되면 내 사연함에서 #번호를 확인할 수 있어요.
          {done.crisis && (
            <p className="notice warn" style={{ textAlign: "left", marginTop: 8 }}>
              많이 힘든 마음이 느껴져요. 지금 바로 이야기할 곳이 필요하다면 자살예방상담전화 109 (24시간)에 전화해 주세요.
            </p>
          )}
          <div className={styles.actions} style={{ width: "100%" }}>
            <Link href="/c/submissions" className="btn">내 사연함</Link>
            <Link href={`/c/${c.slug}`} className="btn ghost">{c.name}로</Link>
          </div>
        </div>
      </>
    );
  }

  const preview = async () => {
    if (previewing || text.trim().length < 5) return;
    setPreviewing(true);
    setError(null);
    try {
      setDraft(await previewSubmission(c.slug, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "미리보기를 만들지 못했어요");
    } finally {
      setPreviewing(false);
    }
  };
  const send = async (body: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendSubmission(c.slug, cat, body);
      setDone({ crisis: r.crisis || hasCrisisSignal(body) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "보내지 못했어요");
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title={`${c.name}에 사연 보내기`} right={back} />
      <div className={`screen ${styles.plain}`}>
        <div className={styles.form}>
          <div className={shout.cats} role="radiogroup" aria-label="카테고리" style={{ flexWrap: "wrap" }}>
            {SHOUT_CATEGORIES.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={cat === k.id} className={shout.cat} onClick={() => setCat(k.id)}>
                <ShoutCatIcon id={k.id} />{k.label}
              </button>
            ))}
          </div>

          <label className={styles.field}>
            <span className="sr-only">사연</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, MAX)); setDraft(null); }}
              placeholder={"어떤 일이 있었나요? 편하게 털어놓아 주세요.\n실명·학번·연락처는 쓰지 않는 게 좋아요."}
              maxLength={MAX}
            />
            <span className={styles.count}>{text.length}/{MAX}</span>
          </label>

          {hints.length > 0 && (
            <div className={styles.warnBox} role="status">
              확인해 주세요 · <b>{hints.join(", ")}</b><br />나나 다른 사람이 드러날 수 있어요. ‘다듬어 보기’를 누르면 가려서 보여 줘요.
            </div>
          )}

          {draft && (
            <div className="stack">
              <div className={styles.previewHead}>
                <span>{draft.source === "ai" ? "AI 가 다듬은 사연" : "가린 사연"}</span>
                {draft.masked.length > 0 && <span className={`${styles.pill} ${styles.ok}`}>가림: {draft.masked.join(", ")}</span>}
              </div>
              <div className={styles.preview}>{draft.text}</div>
            </div>
          )}

          {error && <div className="notice warn" role="alert">{error}</div>}

          <div className="stack">
            {draft ? (
              <>
                <button className="btn block" disabled={busy} onClick={() => send(draft.text)}>{busy ? "보내는 중…" : "다듬은 사연으로 보내기"}</button>
                <button className="btn ghost block" disabled={busy} onClick={() => send(text)}>내가 쓴 그대로 보내기</button>
              </>
            ) : (
              <>
                <button className="btn soft block" disabled={previewing || text.trim().length < 5} onClick={preview}>
                  <IconSparkle />{previewing ? "다듬는 중…" : "다듬어 보기 (실명·연락처 가리기)"}
                </button>
                <button className="btn block" disabled={busy || text.trim().length < 5} onClick={() => send(text)}>{busy ? "보내는 중…" : "사연 보내기"}</button>
              </>
            )}
          </div>
          <p className={styles.sub} style={{ margin: 0 }}>
            소로우지기가 검토한 뒤 ‘{c.name} #{c.postCount + 1}’처럼 올라가요. 게시 시각은 일부러 조금 늦춰서, 보낸 시각으로 누구인지 짐작할 수 없어요.
          </p>
        </div>
      </div>
    </>
  );
}
