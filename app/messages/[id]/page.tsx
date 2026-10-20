"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Message, Thread, fetchThread, markThreadRead, sendMessage } from "@/lib/social";
import { TopBar } from "@/components/ui";
import { LoadError } from "@/components/CommunityUI";
import { IconChevronL, IconSend } from "@/components/Icons";

/** 1:1 대화. 5초마다 새 메시지를 가져온다. */
export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastAt = useRef(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const t = await fetchThread(id);
      setThread(t);
      lastAt.current = t.messages.length ? t.messages[t.messages.length - 1].at : 0;
      await markThreadRead(id).catch(() => {});
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했어요");
    }
  }, [id]);

  // 새 메시지만 가져오기 (폴링)
  const poll = useCallback(async () => {
    if (!thread) return;
    try {
      const t = await fetchThread(id, lastAt.current || undefined);
      if (t.messages.length) {
        setThread((cur) => (cur ? { ...cur, messages: dedupe([...cur.messages, ...t.messages]) } : cur));
        lastAt.current = t.messages[t.messages.length - 1].at;
        if (t.messages.some((m) => m.senderId !== t.otherId ? false : true)) await markThreadRead(id).catch(() => {});
      }
    } catch {
      /* 다음 폴링에 재시도 */
    }
  }, [id, thread]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = window.setInterval(poll, 5000);
    return () => window.clearInterval(t);
  }, [poll]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy || !thread) return;
    setBusy(true);
    try {
      const r = await sendMessage(thread.otherId, t);
      setThread((cur) => (cur ? { ...cur, messages: dedupe([...cur.messages, r.message]) } : cur));
      lastAt.current = r.message.at;
      setText("");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "보내지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <><TopBar title="대화" right={<Link href="/messages" className="icon-btn" aria-label="메시지함"><IconChevronL /></Link>} /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!thread) return <TopBar title="대화" />;

  const me = (m: Message) => m.senderId !== thread.otherId;
  let lastDay = "";

  return (
    <>
      <TopBar
        title={thread.other.nick}
        eyebrow={<Link href={`/u/${thread.other.id}`} style={{ textDecoration: "underline" }}>프로필 보기</Link> as unknown as string}
        right={<Link href="/messages" className="icon-btn" aria-label="메시지함"><IconChevronL /></Link>}
      />
      <div className="screen thread">
        {thread.messages.length === 0 && <p className="tiny muted" style={{ textAlign: "center", margin: "30px 0" }}>첫 메시지를 보내 봐요.</p>}
        {thread.messages.map((m) => {
          const d = new Date(m.at);
          const day = `${d.getMonth() + 1}월 ${d.getDate()}일`;
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && <div className="day-sep">{day}</div>}
              <div className={`bubble-row ${me(m) ? "me" : ""}`}>
                <div className="bubble">{m.text}</div>
                <small className="time">{`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`}{me(m) && m.readAt ? " · 읽음" : ""}</small>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        className="thread-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지"
          rows={1}
          maxLength={1000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          onInput={(ev) => {
            const t = ev.currentTarget;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
          }}
        />
        <button type="submit" className="btn" disabled={!text.trim() || busy} aria-label="보내기"><IconSend style={{ width: 18, height: 18 }} /></button>
      </form>
    </>
  );
}

function dedupe(list: Message[]): Message[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.at - b.at);
}
