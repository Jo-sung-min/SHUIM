"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProfilePage, fetchProfilePage, sendMessage } from "@/lib/social";
import { api } from "@/lib/community";
import { LoadError, Sheet, TopBar } from "@/components/ui";
import { IconChevronL, IconMessage, IconShare } from "@/components/Icons";
import { useScrollMemory } from "@/lib/scroll-memory";
import BlockUser from "@/components/BlockUser";
import SafetyReport from "@/components/SafetyReport";
import ProfileHeader from "@/components/ProfileHeader";
import BadgeShelf from "@/components/BadgeShelf";
import ProfileTabs from "@/components/ProfileTabs";
import { shareProfile } from "@/lib/share-profile";
import { showToast, toastSuccess } from "@/lib/toast";
import { route, useRouteParam } from "@/lib/routes";

/**
 * 공개 프로필: 누구나 볼 수 있다. 머리(위로글 · 리스너 · 리스닝) · 칭호 · 위로 배지 · 콘텐츠 탭.
 * 다른 사람이면 리스닝하기 · 메시지, 내 프로필이면 나 페이지로.
 */
export default function PublicProfilePage() {
  const id = useRouteParam("id");
  const router = useRouter();
  const [data, setData] = useState<ProfilePage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dm, setDm] = useState(false);
  const [following, setFollowing] = useState(false);
  const followLocked = useRef(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchProfilePage(id));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했어요");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useScrollMemory(data !== null, `/u/${id}`); // 미니앱은 모든 프로필이 /u/_ 라 id 로 나눈다

  const back = <button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>;
  if (loadError) return <><TopBar title="프로필" right={back} /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!data) return <><TopBar title="프로필" right={back} /><div className="screen" role="status" aria-label="프로필을 불러오고 있어요">
    <div className="sk-row"><div className="sk sk-circle lg" /><div className="sk-col"><div className="sk sk-line lg w60" /><div className="sk w80" /></div></div>
    <div className="sk sk-block" style={{ marginTop: 16 }} />
    <div className="sk-tiles" style={{ marginTop: 16 }}><div className="sk" /><div className="sk" /><div className="sk" /></div>
  </div></>;

  const { profile: p, isMe } = data;

  const follow = async () => {
    if (followLocked.current) return;
    followLocked.current = true;
    setFollowing(true);
    try {
      const was = p.isFollowing;
      await api.toggleFollow(p.id);
      await load();
      toastSuccess(was ? "리스닝을 그만했어요" : `이제 ${p.nick}님의 이야기를 들어요`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "잠시 후 다시 시도해요");
    } finally {
      followLocked.current = false;
      setFollowing(false);
    }
  };

  return (
    <>
      <TopBar title={p.nick} right={back} />
      <div className="screen">
        <ProfileHeader
          profile={p}
          actions={isMe ? (
            <>
              <Link href="/me" className="btn ghost sm">내 공간으로</Link>
              <button type="button" className="btn ghost sm" onClick={() => shareProfile(p.id, p.nick)}><IconShare style={{ width: 16, height: 16 }} /> 프로필 공유</button>
            </>
          ) : (
            <>
              <button type="button" className={`btn sm ${p.isFollowing ? "ghost" : ""}`} onClick={follow} disabled={following} aria-busy={following} aria-pressed={p.isFollowing}>
                {following ? "변경 중…" : p.isFollowing ? "리스닝 중" : p.followsMe ? "나도 리스닝" : "리스닝"}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setDm(true)} disabled={p.blocked}>
                <IconMessage style={{ width: 16, height: 16 }} /> 메시지
              </button>
            </>
          )}
        />
        {!isMe && <div className="row" style={{ gap: 20, marginTop: 12 }}><BlockUser userId={p.id} /><SafetyReport kind="user" targetId={p.id} /></div>}

        <BadgeShelf earned={p.badges} />
        <ProfileTabs data={data} />
      </div>

      <DmSheet key={dm ? "open" : "closed"} open={dm} toNick={p.nick} onClose={() => setDm(false)} onSend={async (text) => {
        const r = await sendMessage(p.id, text);
        setDm(false);
        router.push(route(`/messages/${r.conversationId}`));
      }} />
    </>
  );
}

function DmSheet({ open, toNick, onClose, onSend }: { open: boolean; toNick: string; onClose: () => void; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={open} onClose={() => { if (!locked.current) onClose(); }} title={`${toNick} 님에게`}>
      <div className="stack">
        <div className="field">
          <textarea autoFocus value={text} disabled={busy} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="첫 메시지. 위로든 안부든." style={{ minHeight: 120 }} />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" disabled={busy} onClick={onClose}>취소</button>
        <button
          className="btn"
          disabled={!text.trim() || busy}
          aria-busy={busy}
          onClick={async () => {
            if (!text.trim() || locked.current) return;
            locked.current = true;
            setBusy(true);
            setError(null);
            try {
              await onSend(text.trim());
            } catch (e) {
              setError(e instanceof Error ? e.message : "보내지 못했어요");
            } finally {
              locked.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? "보내는 중…" : "보내기"}
        </button>
      </div>
    </Sheet>
  );
}
