"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Me, fetchMe, signOut } from "@/lib/auth";
import { clearAll, formatPhone, loadGoals, loadJournal, loadMemos, loadNotifSeen, loadSchedule, markNotifSeen, seedSampleData, streak, todayKey } from "@/lib/storage";
import { Notification, fetchCommunity, listNotifications } from "@/lib/community";
import { MyProfile, fetchMyProfile, unreadMessages, updateMyProfile } from "@/lib/social";
import { uploadAvailable, uploadImage } from "@/lib/upload";
import { HELP_LINES } from "@/lib/crisis";
import { Segmented, Sheet, TopBar, fmtRelative } from "@/components/ui";
import { IconCalendar, IconCoin, IconFlag, IconMessage, IconNote, IconSettings, IconShield, IconTrophy, IconUser } from "@/components/Icons";

type View = "profile" | "notif";

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [view, setView] = useState<View>("profile");
  const [editing, setEditing] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [dmUnread, setDmUnread] = useState(0);
  const [stats, setStats] = useState({ streak: 0, memos: 0, goals: 0, today: 0 });
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const m = await fetchMe(true);
    setMe(m);
    const j = loadJournal();
    const t = todayKey();
    setStats({ streak: streak(j), memos: loadMemos().length, goals: loadGoals().filter((g) => !g.doneAt).length, today: loadSchedule().filter((s) => s.date === t && !s.done).length });
    try {
      const [p, c, u] = await Promise.all([fetchMyProfile(), fetchCommunity(), unreadMessages()]);
      setProfile(p);
      setNotifs(listNotifications(c, loadNotifSeen()));
      setDmUnread(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "서버에 연결하지 못했어요");
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const openNotif = () => {
    setView("notif");
    markNotifSeen();
  };

  if (!me) return <TopBar title="나" />;

  const user = me.user;
  const unread = notifs.filter((n) => !n.read).length;
  const nick = profile?.nick ?? user?.nick ?? "나";
  const tiles = [
    { href: "/messages", label: "메시지", Icon: IconMessage, n: dmUnread },
    { href: "/memo", label: "메모", Icon: IconNote, n: stats.memos },
    { href: "/goals", label: "목표", Icon: IconFlag, n: stats.goals },
    { href: "/schedule", label: "일정", Icon: IconCalendar, n: stats.today },
    { href: "/ranking", label: "랭킹", Icon: IconTrophy },
    { href: "/fund", label: "모금", Icon: IconCoin },
    { href: "/auth", label: user ? "계정" : "로그인", Icon: IconUser },
    ...(me.admin ? [{ href: "/admin", label: "관리자", Icon: IconShield }] : []),
  ];

  return (
    <>
      <TopBar title={nick} right={<Link href="/auth" className="icon-btn" aria-label="계정 설정"><IconSettings /></Link>} />
      <div className="screen">
        <div className="profile">
          <button className="avatar xl" aria-label="프로필 수정" onClick={() => setEditing(true)} style={profile?.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}>
            {!profile?.avatarUrl && (nick !== "나" ? nick.slice(0, 1) : <IconUser />)}
          </button>
          <div className="profile-stats">
            <div><b>{profile?.stats.feedPosts ?? 0}</b><small>위로글</small></div>
            <div><b>{profile?.stats.followers ?? 0}</b><small>팔로워</small></div>
            <div><b>{stats.streak}</b><small>연속</small></div>
          </div>
        </div>
        <div className="profile-bio">
          {profile?.isCreator && <span className="badge">크리에이터</span>}
          <p className={profile?.bio ? "" : "muted"}>{profile?.bio || "소개를 적어 보세요."}</p>
          <div className="profile-info" style={{ margin: "6px 0 0" }}>
            <span>{profile?.name || "이름 없음"}</span><span>·</span>
            <span>{profile?.phone ? formatPhone(profile.phone) : "전화번호 없음"}</span>
            <button className="text-btn" onClick={() => setEditing(true)}>프로필 수정</button>
          </div>
        </div>
        {error && <div className="notice warn" style={{ marginTop: 10 }}>{error}</div>}
        {profile && (
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Link href={`/u/${profile.id}`} className="btn ghost sm" style={{ flex: 1 }}>내 공개 프로필 보기</Link>
            {!user && <Link href="/auth" className="btn sm" style={{ flex: 1 }}>로그인 · 회원가입</Link>}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Segmented value={view} onChange={(v) => (v === "notif" ? openNotif() : setView("profile"))} options={[{ value: "profile", label: "내 공간" }, { value: "notif", label: unread ? `알림 ${unread}` : "알림" }]} />
        </div>

        {view === "profile" && (
          <>
            <div className="me-grid">
              {tiles.map(({ href, label, Icon, n }) => (
                <Link key={href} href={href} className="me-tile">
                  <span className="ico"><Icon /></span>
                  <span className="lbl">{label}</span>
                  {typeof n === "number" && n > 0 && <span className="n">{n}</span>}
                </Link>
              ))}
            </div>
            <div className="help-mini">{HELP_LINES.map((h) => <a key={h.tel} href={`tel:${h.tel}`}>{h.name} <b>{h.tel}</b></a>)}</div>
            <div className="row" style={{ justifyContent: "center", gap: 14, marginTop: 24 }}>
              <button className="text-btn muted" onClick={() => { seedSampleData(); reload(); }}>샘플 채우기</button>
              <span className="tiny" style={{ color: "var(--border)" }}>|</span>
              <button className="text-btn muted" onClick={() => { if (!window.confirm("이 기기의 기록·메모·목표·일정을 지울까요? 되돌릴 수 없어요.")) return; clearAll(); reload(); }}>전체 삭제</button>
              {user && (<><span className="tiny" style={{ color: "var(--border)" }}>|</span><button className="text-btn muted" onClick={async () => { await signOut(); reload(); }}>로그아웃</button></>)}
            </div>
          </>
        )}

        {view === "notif" && (
          <div className="stack" style={{ marginTop: 12, gap: 6 }}>
            {dmUnread > 0 && (
              <Link href="/messages" className="notif unread">
                <span className="avatar sm"><IconMessage style={{ width: 16, height: 16 }} /></span>
                <span className="grow"><span className="who"><b>메시지</b> 읽지 않은 메시지 {dmUnread}개</span></span>
              </Link>
            )}
            {notifs.length === 0 && dmUnread === 0 ? (
              <div className="empty"><div className="ico">🔔</div><b>아직 알림이 없어요</b>외침에 글을 쓰거나 위로 댓글을 남기면 답이 왔을 때 여기 모여요.</div>
            ) : (
              notifs.map((n) => (
                <Link key={n.id} href={`${n.postKind === "post" ? "/shout" : "/feed"}?post=${n.postId}`} className={`notif ${n.read ? "" : "unread"}`}>
                  <span className="avatar sm">{n.actorNick.slice(0, 1)}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="who"><b>{n.actorNick}</b>{n.kind === "comment_on_post" ? " 님이 내 글에 위로를 남겼어요" : " 님이 내가 위로한 글에 답했어요"}<small>{fmtRelative(n.at)}</small></span>
                    <span className="msg">{n.text}</span>
                    <span className="ctx"><IconMessage style={{ width: 12, height: 12 }} /> {n.postText.slice(0, 40)}{n.postText.length > 40 ? "…" : ""}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {profile && (
        <ProfileSheet
          key={editing ? "open" : "closed"}
          open={editing}
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(p) => { setProfile(p); setEditing(false); fetchMe(true).then(setMe); }}
        />
      )}
    </>
  );
}

/* ================= 프로필 편집: 사진·닉네임·소개(공개) + 이름·전화(비공개) ================= */

function ProfileSheet({ open, profile, onClose, onSaved }: { open: boolean; profile: MyProfile; onClose: () => void; onSaved: (p: MyProfile) => void }) {
  const [nick, setNick] = useState(profile.nick);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState(profile.avatarUrl ?? "");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(formatPhone(profile.phone));
  const [canUpload, setCanUpload] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) uploadAvailable().then(setCanUpload);
  }, [open]);
  const digits = phone.replace(/\D/g, "");
  const phoneOk = digits.length === 0 || (digits.length >= 10 && digits.length <= 11);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(0);
    try {
      const r = await uploadImage(file, setUploading);
      setAvatar(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드하지 못했어요");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateMyProfile({ nick, bio, avatarUrl: avatar || null, name, phone: digits }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="프로필">
      <div className="stack">
        <div className="field">
          <label>사진 · 닉네임 · 소개는 다른 사람에게 보여요</label>
          <div className="avatar-pick">
            <span className="avatar lg" style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}>{!avatar && nick.slice(0, 1)}</span>
            <div className="stack" style={{ gap: 6, flex: 1 }}>
              {canUpload && (
                <label className={`btn ghost sm upload-btn ${uploading !== null ? "busy" : ""}`} style={{ margin: 0 }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading !== null} onChange={(e) => pickFile(e.target.files?.[0])} />
                  {uploading === null ? "📷 사진 올리기" : `올리는 중… ${uploading}%`}
                </label>
              )}
              <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder={canUpload ? "또는 사진 주소 (https://…)" : "사진 주소 (https://…)"} />
              {avatar && <button type="button" className="text-btn muted" style={{ alignSelf: "flex-start", padding: 0 }} onClick={() => setAvatar("")}>사진 지우기</button>}
            </div>
          </div>
        </div>
        <div className="field"><label>닉네임</label><input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={12} placeholder="2~12자" /></div>
        <div className="field">
          <label>소개</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="어떤 사람인지, 어떤 글을 쓰는지 한두 줄" style={{ minHeight: 80 }} />
          <span className="tiny muted" style={{ textAlign: "right" }}>{bio.length}/160</span>
        </div>
        <div className="field"><label>이름 (나만 봄)</label><input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" autoComplete="name" /></div>
        <div className="field">
          <label>전화번호 (나만 봄)</label>
          <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" autoComplete="tel" />
          {!phoneOk && <span className="tiny" style={{ color: "var(--down)" }}>숫자 10~11자리로 입력해요.</span>}
        </div>
        {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" disabled={!phoneOk || busy || uploading !== null || nick.trim().length < 2} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
      </div>
    </Sheet>
  );
}
