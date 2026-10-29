"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { shoutCatById } from "@/lib/community";
import { SUBMISSION_STATUS, Submission, fetchMySubmissions } from "@/lib/circles";
import { LoadError } from "@/components/CommunityUI";
import { Empty, SkeletonList, TopBar, fmtRelative } from "@/components/ui";
import { IconChevronL, IconChevronR, IconInbox } from "@/components/Icons";
import styles from "../circle.module.css";

/** 내 사연함: 보낸 사연의 상태, 보류·반려 사유, 소로우지기의 익명 답장, 게시된 #번호 */
export default function MySubmissionsPage() {
  const router = useRouter();
  const [list, setList] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    fetchMySubmissions().then(setList).catch((e) => setError(e instanceof Error ? e.message : "연결 실패"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const back = <button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>;
  const now = Date.now();
  return (
    <>
      <TopBar title="내 사연함" right={back} />
      <div className={`screen ${styles.list}`}>
        <p className={styles.sub}>내가 보낸 사연은 나만 볼 수 있어요. 소로우지기도 누가 보냈는지 몰라요.</p>
        {error ? (
          <LoadError message={error} onRetry={load} />
        ) : list === null ? (
          <div role="status" aria-label="불러오고 있어요"><SkeletonList count={3} lines={3} /></div>
        ) : list.length === 0 ? (
          <Empty icon={<IconInbox />} title="아직 보낸 사연이 없어요" action={<Link href="/c/home" className="btn ghost">내 소로우로</Link>}>
            소로우에 가입하면 사연을 보낼 수 있어요.
          </Empty>
        ) : (
          <div className={styles.subs}>
            {list.map((sub) => {
              const waitingPublish = sub.status === "published" && sub.publishAt && sub.publishAt > now;
              return (
                <article key={sub.id} className={styles.subCard}>
                  <div className={styles.subHead}>
                    <b style={{ color: "var(--text)" }}>{sub.circle}</b>
                    <span className={`${styles.pill} ${sub.status === "published" ? styles.ok : sub.status === "rejected" ? styles.warn : ""}`}>
                      {sub.postNo ? `#${sub.postNo} ` : ""}{waitingPublish ? "곧 게시돼요" : SUBMISSION_STATUS[sub.status]}
                    </span>
                    <span className={styles.pill}>{shoutCatById(sub.cat).label}</span>
                    <time>{fmtRelative(sub.createdAt)}</time>
                  </div>
                  <p className={styles.subText} style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sub.text}</p>
                  {sub.reason && <p className={styles.subNote}><b>{sub.status === "held" ? "보류 사유" : "반려 사유"}</b>{sub.reason}</p>}
                  {sub.reply && <p className={styles.subNote}><b>소로우지기의 답장</b>{sub.reply}</p>}
                  {sub.postId && !waitingPublish && (
                    <div className={styles.subActions}>
                      <Link href={`/shout/${sub.postId}`} className="btn ghost sm">게시된 사연 보기<IconChevronR /></Link>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
