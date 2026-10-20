"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ProfilePage, fetchProfilePage, sendMessage } from "@/lib/social";
import { api, shoutCatById } from "@/lib/community";
import type { ShoutCat } from "@/lib/community-core";
import { Empty, Segmented, Sheet, TopBar, fmtRelative } from "@/components/ui";
import { LoadError } from "@/components/CommunityUI";
import { IconChevronL, IconMessage, IconUser } from "@/components/Icons";

type Tab = "feed" | "shout";

/** 공개 프로필: 누구나 볼 수 있고, 팔로우·메시지 보내기 가능 */
export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ProfilePage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [dm, setDm] = useState(false);

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

  if (loadError) return <><TopBar title="프로필" right={<button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>} /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!data) return <TopBar title="프로필" />;

  const { profile: p, isMe } = data;

  const follow = async () => {
    try {
      await api.toggleFollow(p.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "잠시 후 다시 시도해요");
    }
  };

  return (
    <>
      <TopBar title={p.nick} right={<button className="icon-btn" onClick={() => router.back()} aria-label="뒤로"><IconChevronL /></button>} />
      <div className="screen">
        <div className="profile">
          <span className="avatar xl" style={p.avatarUrl ? { backgroundImage: `url(${p.avatarUrl})` } : undefined}>
            {!p.avatarUrl && (p.nick ? p.nick.slice(0, 1) : <IconUser />)}
          </span>
          <div className="profile-stats">
            <div><b>{p.stats.feedPosts}</b><small>위로글</small></div>
            <div><b>{p.stats.followers}</b><small>팔로워</small></div>
            <div><b>{p.stats.cheers}</b><small>힘내요</small></div>
          </div>
        </div>
        <div className="profile-bio">
          {p.isCreator && <span className="badge">크리에이터</span>}
          {p.bio ? <p>{p.bio}</p> : p.creatorBio ? <p>{p.creatorBio}</p> : <p className="muted">소개가 아직 없어요.</p>}
          {p.blocked && <p className="tiny" style={{ color: "var(--down)" }}>신고 누적으로 차단된 사용자예요.</p>}
        </div>

        {isMe ? (
          <Link href="/me" className="btn ghost block sm" style={{ marginTop: 10 }}>내 프로필 수정</Link>
        ) : (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className={`btn block sm ${p.isFollowing ? "ghost" : ""}`} style={{ flex: 1 }} onClick={follow}>{p.isFollowing ? "팔로잉" : "팔로우"}</button>
            <button className="btn soft block sm" style={{ flex: 1 }} onClick={() => setDm(true)} disabled={p.blocked}>
              <IconMessage style={{ width: 16, height: 16 }} /> 메시지
            </button>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Segmented value={tab} onChange={setTab} options={[{ value: "feed", label: `위로글 ${data.feed.length}` }, { value: "shout", label: `외침 ${data.shout.length}` }]} />
        </div>

        {tab === "feed" &&
          (data.feed.length === 0 ? (
            <Empty icon="🎞️" title="아직 위로글이 없어요" />
          ) : (
            <div className="profile-grid">
              {data.feed.map((f) => (
                <Link key={f.id} href={`/feed?post=${f.id}`} className={`profile-cell bg-${f.bg} ${f.image ? "has-img" : ""}`} style={f.image ? { backgroundImage: `url(${f.image})` } : undefined}>
                  <span className="t">{f.title ?? f.text.split("\n")[0]}</span>
                  <span className="c">💪 {f.cheers}</span>
                </Link>
              ))}
            </div>
          ))}

        {tab === "shout" &&
          (data.shout.length === 0 ? (
            <Empty icon="📣" title="아직 외침이 없어요" />
          ) : (
            <div className="stack" style={{ marginTop: 12 }}>
              {data.shout.map((s) => {
                const c = shoutCatById(s.cat as ShoutCat);
                return (
                  <Link key={s.id} href={`/shout?post=${s.id}`} className="card post" style={{ display: "block" }}>
                    <div className="post-head"><span className="cat">{c.emoji} {c.label}</span><span>·</span><span>{fmtRelative(s.createdAt)}</span><span style={{ marginLeft: "auto" }}>💪 {s.cheers}</span></div>
                    <p className="post-text" style={{ marginBottom: 0 }}>{s.text}</p>
                  </Link>
                );
              })}
            </div>
          ))}
      </div>

      <DmSheet key={dm ? "open" : "closed"} open={dm} toNick={p.nick} onClose={() => setDm(false)} onSend={async (text) => {
        const r = await sendMessage(p.id, text);
        setDm(false);
        router.push(`/messages/${r.conversationId}`);
      }} />
    </>
  );
}

function DmSheet({ open, toNick, onClose, onSend }: { open: boolean; toNick: string; onClose: () => void; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title={`${toNick} 님에게`}>
      <div className="stack">
        <div className="field">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="첫 메시지. 위로든 안부든." style={{ minHeight: 120 }} />
        </div>
        {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button
          className="btn"
          disabled={!text.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSend(text);
            } catch (e) {
              setError(e instanceof Error ? e.message : "보내지 못했어요");
            } finally {
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
