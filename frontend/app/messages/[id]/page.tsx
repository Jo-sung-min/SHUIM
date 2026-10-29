"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Message, Thread, fetchThread, markThreadRead, sendMessage } from "@/lib/social";
import { Empty, LoadError, TopBar } from "@/components/ui";
import { IconChevronL, IconMessage, IconSend } from "@/components/Icons";
import BlockUser from "@/components/BlockUser";
import SafetyReport from "@/components/SafetyReport";
import { showToast } from "@/lib/toast";
import { route, useRouteParam } from "@/lib/routes";

/** 1:1 대화. 5초마다 새 메시지를 가져온다. */
export default function ThreadPage() {
  const id = useRouteParam("id");
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastAt = useRef(0);
  const sendLocked = useRef(false);

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
    if (!t || sendLocked.current || !thread) return;
    sendLocked.current = true;
    setBusy(true);
    try {
      const r = await sendMessage(thread.otherId, t);
      setThread((cur) => (cur ? { ...cur, messages: dedupe([...cur.messages, r.message]) } : cur));
      lastAt.current = r.message.at;
      setText("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "보내지 못했어요");
    } finally {
      sendLocked.current = false;
      setBusy(false);
    }
  };

  if (loadError) return <><TopBar title="대화" right={<Link href="/messages" className="icon-btn" aria-label="메시지함"><IconChevronL /></Link>} /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!thread) return <><TopBar title="대화" right={<Link href="/messages" className="icon-btn" aria-label="메시지함"><IconChevronL /></Link>} /><div className="screen thread" role="status" aria-label="대화를 불러오고 있어요">
    <div className="sk" style={{ height: 44, width: "60%", borderRadius: 16 }} />
    <div className="sk" style={{ height: 44, width: "50%", borderRadius: 16, marginLeft: "auto", marginTop: 8 }} />
    <div className="sk" style={{ height: 64, width: "70%", borderRadius: 16, marginTop: 8 }} />
  </div></>;

  const me = (m: Message) => m.senderId !== thread.otherId;
  let lastDay = "";

  return (
    <>
      <TopBar
        title={thread.other.nick}
        eyebrow={<Link href={route(`/u/${thread.other.id}`)} style={{ textDecoration: "underline" }}>프로필 보기</Link>}
        right={<Link href="/messages" className="icon-btn" aria-label="메시지함"><IconChevronL /></Link>}
      />
      <div className="screen thread">
        <div className="row" style={{ gap: 20, marginBottom: 16 }}><BlockUser userId={thread.otherId} /><SafetyReport kind="user" targetId={thread.otherId} /></div>
        {thread.messages.length === 0 && <Empty icon={<IconMessage />} title="아직 메시지가 없어요">첫 메시지를 보내 봐요.</Empty>}
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
                {!me(m) && <SafetyReport kind="message" targetId={m.id} />}
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
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지"
          rows={1}
          maxLength={1000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
        <button type="submit" className="btn" disabled={!text.trim() || busy} aria-busy={busy} aria-label={busy ? "메시지 보내는 중" : "보내기"}><IconSend style={{ width: 18, height: 18 }} /></button>
      </form>
    </>
  );
}

function dedupe(list: Message[]): Message[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.at - b.at);
}
