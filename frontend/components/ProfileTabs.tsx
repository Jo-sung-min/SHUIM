"use client";

import { useState } from "react";
import Link from "next/link";
import type { ProfilePage } from "@/lib/social";
import { shoutCatById } from "@/lib/community";
import type { ShoutCat } from "@/lib/community-core";
import { stripHighlights } from "@/lib/highlight";
import { Empty, fmtRelative } from "./ui";
import { ShoutCatIcon } from "./CategoryIcon";
import { IconBookmark, IconBubble, IconFilm, IconFist, IconMessage } from "./Icons";
import styles from "./Profile.module.css";
import { route } from "@/lib/routes";

type Tab = "feed" | "shout" | "comfort" | "saved";

/**
 * 콘텐츠 탭: 위로글(3열 그리드) · 외침 · 내 위로(남긴 위로 댓글, 원글은 앞부분만) · 저장함(본인만).
 * 숫자는 각 탭의 글 수만 (내가 위로한 횟수를 따로 세어 보여 주지 않는다).
 */
export default function ProfileTabs({ data }: { data: ProfilePage }) {
  const [tab, setTab] = useState<Tab>("feed");
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "feed", label: "위로글", n: data.feed.length },
    { id: "shout", label: "외침", n: data.shout.length },
    { id: "comfort", label: data.isMe ? "내 위로" : "위로" },
    ...(data.isMe && data.saved ? [{ id: "saved" as Tab, label: "저장함" }] : []),
  ];
  const grid = (items: ProfilePage["feed"], emptyTitle: string, emptyIcon: React.ReactNode) =>
    items.length === 0 ? (
      <Empty icon={emptyIcon} title={emptyTitle} />
    ) : (
      <div className="profile-grid">
        {items.map((f) => (
          <Link key={f.id} href={`/feed?post=${f.id}`} className={`profile-cell bg-${f.bg} ${f.image ? "has-img" : ""}`} style={f.image ? { backgroundImage: `url(${f.image})` } : undefined}>
            <span className="t">{f.title ?? stripHighlights(f.text).split("\n")[0]}</span>
            <span className="c"><IconFist /> {f.cheers}</span>
          </Link>
        ))}
      </div>
    );

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="프로필 콘텐츠">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`ptab-${t.id}`} aria-selected={tab === t.id} aria-controls={`ppanel-${t.id}`} className={styles.tab} onClick={() => setTab(t.id)}>
            {t.label}{t.n !== undefined && <small>{t.n}</small>}
          </button>
        ))}
      </div>
      <div className={styles.panel} role="tabpanel" id={`ppanel-${tab}`} aria-labelledby={`ptab-${tab}`}>
        {tab === "feed" && grid(data.feed, "아직 위로글이 없어요", <IconFilm />)}

        {tab === "shout" &&
          (data.shout.length === 0 ? (
            <Empty icon={<IconBubble />} title="아직 외침이 없어요" />
          ) : (
            <div className={styles.list}>
              {data.shout.map((s) => {
                const c = shoutCatById(s.cat as ShoutCat);
                return (
                  <Link key={s.id} href={route(`/shout/${s.id}`)} className="card post" style={{ display: "block" }}>
                    <div className="post-head"><span className="cat"><ShoutCatIcon id={c.id} /> {c.label}</span><span>·</span><span>{fmtRelative(s.createdAt)}</span><span className="inline-fist" style={{ marginLeft: "auto" }}><IconFist /> {s.cheers}</span></div>
                    <p className="post-text" style={{ marginBottom: 0 }}>{s.text}</p>
                  </Link>
                );
              })}
            </div>
          ))}

        {tab === "comfort" &&
          (data.comments.length === 0 ? (
            <Empty icon={<IconMessage />} title={data.isMe ? "아직 남긴 위로가 없어요" : "아직 남긴 위로가 없어요"}>
              {data.isMe ? "외침에 한마디 남기면 여기에 모여요." : undefined}
            </Empty>
          ) : (
            <div className={styles.list}>
              {data.comments.map((c) => (
                <Link key={c.id} href={c.postKind === "post" ? route(`/shout/${c.postId}`) : `/feed?post=${c.postId}`} className={styles.comfort}>
                  <span className={styles.comfortCtx}><IconBubble aria-hidden /> {c.postSnippet}</span>
                  <p className={styles.comfortText}>{stripHighlights(c.text)}</p>
                  <span className={styles.comfortFoot}><span className="inline-fist"><IconFist /> {c.cheers}</span><span>{fmtRelative(c.createdAt)}</span></span>
                </Link>
              ))}
            </div>
          ))}

        {tab === "saved" && data.saved && grid(data.saved, "저장한 위로글이 아직 없어요", <IconBookmark />)}
      </div>
    </>
  );
}
