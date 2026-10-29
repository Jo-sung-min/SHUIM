"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConversationSummary, fetchConversations } from "@/lib/social";
import { Empty, LoadError, SkeletonList, TopBar, fmtRelative } from "@/components/ui";
import { IconChevronL, IconMessage, IconUser } from "@/components/Icons";
import { useScrollMemory } from "@/lib/scroll-memory";
import { route } from "@/lib/routes";

/** 메시지함: 대화 목록 */
export default function MessagesPage() {
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setList((await fetchConversations()).conversations);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했어요");
    }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000); // 새 대화·읽지 않은 수 갱신
    return () => window.clearInterval(t);
  }, [load]);
  useScrollMemory(list !== null);

  if (loadError) return <><TopBar title="메시지" /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!list) return <><TopBar title="메시지" right={<Link href="/me" className="icon-btn" aria-label="나로"><IconChevronL /></Link>} /><div className="screen" role="status" aria-label="대화를 불러오고 있어요"><SkeletonList count={4} lines={1} /></div></>;

  return (
    <>
      <TopBar title="메시지" eyebrow={list.length ? `${list.length}개의 대화` : undefined} right={<Link href="/me" className="icon-btn" aria-label="나로"><IconChevronL /></Link>} />
      <div className="screen">
        {list.length === 0 ? (
          <Empty icon={<IconMessage />} title="아직 대화가 없어요" action={<Link href="/shout" className="btn ghost">외침 둘러보기</Link>}>
            외침이나 피드에서 닉네임을 누르면 그 사람 프로필에서 메시지를 보낼 수 있어요.
          </Empty>
        ) : (
          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            {list.map((c) => (
              <Link key={c.id} href={route(`/messages/${c.id}`)} className={`conv ${c.unread ? "unread" : ""}`}>
                <span className="avatar sm" style={c.other.avatarUrl ? { backgroundImage: `url(${c.other.avatarUrl})` } : undefined}>
                  {!c.other.avatarUrl && (c.other.nick ? c.other.nick.slice(0, 1) : <IconUser />)}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row" style={{ justifyContent: "space-between" }}>
                    <b>{c.other.nick}</b>
                    <small className="muted">{c.lastAt ? fmtRelative(c.lastAt) : ""}</small>
                  </span>
                  <span className="last">{c.lastText ? `${c.lastFromMe ? "나: " : ""}${c.lastText}` : "대화를 시작해요"}</span>
                </span>
                {c.unread > 0 && <span className="n">{c.unread}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
