"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Me, fetchMe, signOut } from "@/lib/auth";
import { clearAll, formatPhone, loadGoals, loadJournal, loadMemos, loadNotifSeen, loadSchedule, markNotifSeen, streak, syncRecords, todayKey } from "@/lib/storage";
import { MyProfile, ProfilePage, ServerNotification, fetchMyProfile, fetchNotifications, fetchProfilePage, markBadgesSeen, unreadMessages, updateMyProfile } from "@/lib/social";
import { uploadImage } from "@/lib/upload";
import PhotoEditor from "@/components/PhotoEditor";
import photoStyles from "@/components/PhotoEditor.module.css";
import { ConfirmSheet, Empty, Sheet, SkeletonList, TopBar, fmtRelative } from "@/components/ui";
import { useScrollMemory } from "@/lib/scroll-memory";
import { toastSuccess } from "@/lib/toast";
import { IconInbox, IconBell, IconBubble, IconCalendar, IconChevronL, IconChevronR, IconFlag, IconMessage, IconNote, IconSettings, IconShare, IconUser } from "@/components/Icons";
import ProfileHeader from "@/components/ProfileHeader";
import BadgeShelf, { BadgeCelebration, BadgeIcon } from "@/components/BadgeShelf";
import ProfileTabs from "@/components/ProfileTabs";
import { shareProfile } from "@/lib/share-profile";
import styles from "../account-screens.module.css";
import profileStyles from "@/components/Profile.module.css";

type View = "profile" | "notif";

/**
 * 나 페이지 = 남이 보는 내 프로필 + 나만 보이는 도구.
 * 위: 프로필 머리(위로글 · 리스너 · 리스닝, 칭호, 소개) · 편집/공유 · 위로 배지 선반
 * 가운데: 나만 보이는 도구 줄(메시지·메모·목표·일정, 점선)
 * 아래: 콘텐츠 탭(위로글 · 외침 · 내 위로 · 저장함)
 * 알림은 위쪽 종 아이콘. 서로 기다릴 필요 없는 요청은 동시에 보낸다.
 */
export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [page, setPage] = useState<ProfilePage | null>(null);
  const [view, setView] = useState<View>("profile");
  const [editing, setEditing] = useState(false);
  const [notifs, setNotifs] = useState<ServerNotification[]>([]);
  const [dmUnread, setDmUnread] = useState(0);
  const [stats, setStats] = useState({ streak: 0, memos: 0, goals: 0, today: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"clear" | "logout" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const actionInFlight = useRef(false);

  const reload = useCallback(async () => {
    setError(null);
    const m = await fetchMe(true);
    setMe(m);
    // 계정 확인 뒤로는 서로 기다리지 않는다: 기록 동기화 · 프로필 · 알림 · 메시지
    const records = syncRecords().catch(() => false).then(() => {
      const j = loadJournal();
      const t = todayKey();
      setStats({ streak: streak(j), memos: loadMemos().length, goals: loadGoals().filter((g) => !g.doneAt).length, today: loadSchedule().filter((s) => s.date === t && !s.done).length });
    });
    const prof = fetchMyProfile().then((p) => {
      setProfile(p);
      return fetchProfilePage(p.id).then(setPage);
    });
    const notif = fetchNotifications(loadNotifSeen()).then((r) => setNotifs(r.items)).catch(() => setNotifs([]));
    const dm = unreadMessages().then(setDmUnread);
    const results = await Promise.allSettled([records, prof, notif, dm]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed && failed.status === "rejected") setError(failed.reason instanceof Error ? failed.reason.message : "연결이 잠시 원활하지 않아요. 다시 시도해 주세요.");
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useScrollMemory(me !== null);

  const openNotif = () => {
    setView("notif");
    markNotifSeen();
    setNotifs((current) => current.map((notification) => ({ ...notification, read: true })));
    window.scrollTo({ top: 0 });
  };

  const runAction = async (action: "clear" | "logout", work: () => Promise<void>) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPending(action);
    setError(null);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "요청을 완료하지 못했어요."); }
    finally { actionInFlight.current = false; setPending(null); }
  };

  if (!me) return <><TopBar title="내 공간" /><div className="screen" role="status" aria-label="내 공간을 불러오고 있어요">
    <div className="sk-card"><div className="sk-row"><div className="sk sk-circle lg" /><div className="sk-col"><div className="sk sk-line lg w60" /><div className="sk w80" /></div></div></div>
    <div className="sk-grid" style={{ marginTop: 16 }}><div className="sk" /><div className="sk" /><div className="sk" /><div className="sk" /></div>
  </div></>;

  const user = me.user;
  const unread = notifs.filter((n) => !n.read).length + dmUnread;
  const nick = profile?.nick ?? user?.nick ?? "내 공간";
  const tools = [
    { href: "/messages", label: "메시지", Icon: IconMessage, n: dmUnread },
    { href: "/c/submissions", label: "사연함", Icon: IconInbox, n: 0 },
    { href: "/memo", label: "메모", Icon: IconNote, n: stats.memos },
    { href: "/goals", label: "목표", Icon: IconFlag, n: stats.goals },
    { href: "/schedule", label: "일정", Icon: IconCalendar, n: stats.today },
  ];

  const topRight = (
    <div className="row" style={{ gap: 0 }}>
      <button type="button" className="icon-btn" aria-label={unread ? `알림 ${unread}개` : "알림"} aria-pressed={view === "notif"} onClick={() => (view === "notif" ? setView("profile") : openNotif())} style={{ position: "relative" }}>
        <IconBell />
        {unread > 0 && <span className="count-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {profile && <button type="button" className="icon-btn" aria-label="프로필 공유" onClick={() => shareProfile(profile.id, profile.nick)}><IconShare /></button>}
      <Link href="/settings" className="icon-btn" aria-label="설정"><IconSettings /></Link>
    </div>
  );

  return (
    <>
      <TopBar title={view === "notif" ? "알림" : nick} right={topRight} />
      <div className="screen">
        {error && <div className={styles.error} role="alert" style={{ marginBottom: 12 }}>{error}</div>}

        {view === "profile" && (
          <>
            {profile ? (
              <ProfileHeader
                profile={profile}
                onAvatar={() => setEditing(true)}
                extra={<p className={profileStyles.meta}>연속 기록 {stats.streak}일 · 나만 보여요</p>}
                actions={
                  <>
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>프로필 편집</button>
                    <button type="button" className="btn ghost sm" onClick={() => shareProfile(profile.id, profile.nick)}>프로필 공유</button>
                  </>
                }
              />
            ) : (
              <div className="sk-card" role="status" aria-label="프로필을 불러오고 있어요"><div className="sk-row"><div className="sk sk-circle lg" /><div className="sk-col"><div className="sk sk-line lg w60" /><div className="sk w80" /></div></div></div>
            )}
            {!user && <Link href="/auth" className="btn block sm" style={{ marginTop: 10 }}>로그인 · 회원가입하고 기록 보관하기</Link>}

            {profile && <BadgeShelf earned={profile.badges} catalog={profile.badgeCatalog} />}

            {/* 나만 보이는 도구 줄 (다른 사람이 내 프로필을 열면 이 줄은 없다) */}
            <section className={profileStyles.tools} aria-label="나만 보이는 도구">
              <p className={profileStyles.toolsHead}>나만 보여요</p>
              <div className={profileStyles.toolGrid}>
                {tools.map(({ href, label, Icon, n }) => (
                  <Link key={href} href={href} className={profileStyles.tool}>
                    <Icon />
                    <span>{label}</span>
                    {n > 0 && <i>{n}</i>}
                  </Link>
                ))}
              </div>
            </section>

            {page ? <ProfileTabs data={page} /> : <div style={{ marginTop: 20 }} role="status" aria-label="내 글을 불러오고 있어요"><SkeletonList count={2} lines={2} /></div>}

            <section className={styles.group} aria-labelledby="me-settings-title" style={{ marginTop: 28 }}>
              <h2 className={styles.groupTitle} id="me-settings-title">설정</h2>
              <div className={`card ${styles.menu}`}>
                <Link href="/settings" className={styles.menuRow}><IconSettings /><span className={styles.menuLabel}><strong>설정</strong><small>계정 · 화면 모드 · 편의 기능</small></span><IconChevronR /></Link>
                {!user && <Link href="/auth" className={styles.menuRow}><IconUser /><span className={styles.menuLabel}><strong>로그인 · 회원가입</strong></span><IconChevronR /></Link>}
              </div>
            </section>
            <div className={styles.quietActions}>
              <button type="button" className="text-btn muted" disabled={pending !== null} onClick={() => setConfirmClear(true)}>{pending === "clear" ? "삭제 중…" : "기록 전체 삭제"}</button>
              {user && <button type="button" className="text-btn muted" disabled={pending !== null} onClick={() => runAction("logout", async () => { await signOut(); await reload(); })}>{pending === "logout" ? "로그아웃 중…" : "로그아웃"}</button>}
            </div>
          </>
        )}

        {view === "notif" && (
          <div className="stack" style={{ gap: 6 }}>
            <button type="button" className="text-btn muted" style={{ alignSelf: "flex-start", marginBottom: 4 }} onClick={() => setView("profile")}><IconChevronL /> 내 공간으로</button>
            {dmUnread > 0 && (
              <Link href="/messages" className="notif unread">
                <span className="avatar sm"><IconMessage style={{ width: 16, height: 16 }} /></span>
                <span className="grow"><span className="who"><b>메시지</b> 읽지 않은 메시지 {dmUnread}개</span></span>
              </Link>
            )}
            {notifs.length === 0 && dmUnread === 0 ? (
              <Empty icon={<IconBubble />} title="아직 도착한 알림이 없어요">내 이야기에 달린 위로와 답글을<br />이곳에 모아드릴게요.</Empty>
            ) : (
              notifs.map((n) => (
                <Link key={n.id} href={n.postKind === "post" ? `/shout/${n.postId}` : `/feed?post=${n.postId}`} className={`notif ${n.read ? "" : "unread"}`}>
                  <span className="avatar sm">{n.actorNick.slice(0, 1)}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="who"><b>{n.actorNick}</b>{n.kind === "comment_on_post" ? " 님이 내 글에 위로를 남겼어요" : n.kind === "reply_to_comment" ? " 님이 내 댓글에 답글을 남겼어요" : " 님이 내가 위로한 글에 답했어요"}<small>{fmtRelative(n.at)}</small></span>
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
          onSaved={(p) => { setProfile(p); setEditing(false); toastSuccess("프로필을 저장했어요"); fetchMe(true).then(setMe); fetchProfilePage(p.id).then(setPage).catch(() => undefined); }}
        />
      )}
      {profile && profile.newBadges.length > 0 && (
        <BadgeCelebration
          key={profile.newBadges.map((b) => b.id).join(",")}
          badges={profile.newBadges}
          onDone={() => { markBadgesSeen(); setProfile((cur) => (cur ? { ...cur, newBadges: [] } : cur)); }}
          onUseAsTitle={async (id) => {
            try { const p = await updateMyProfile({ titleBadge: id }); setProfile({ ...p, newBadges: [] }); toastSuccess("칭호를 달았어요"); }
            catch (e) { setError(e instanceof Error ? e.message : "칭호를 달지 못했어요"); }
          }}
        />
      )}
      <ConfirmSheet
        open={confirmClear}
        title={user ? "이 계정의 기록을 모두 지울까요?" : "이 기기의 기록을 모두 지울까요?"}
        message="기록·메모·목표·일정이 모두 사라지고 되돌릴 수 없어요."
        confirmLabel="모두 지우기"
        danger
        busy={pending === "clear"}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => runAction("clear", async () => { clearAll(); await reload(); setConfirmClear(false); })}
      />
    </>
  );
}

/* ================= 프로필 편집: 사진·닉네임·소개·칭호(공개) + 이름·전화(비공개) ================= */

function ProfileSheet({ open, profile, onClose, onSaved }: { open: boolean; profile: MyProfile; onClose: () => void; onSaved: (p: MyProfile) => void }) {
  const [nick, setNick] = useState(profile.nick);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState(profile.avatarUrl ?? "");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(formatPhone(profile.phone));
  const [titleBadge, setTitleBadge] = useState(profile.titleBadge ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [editingPhoto, setEditingPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const uploadedPhoto = useRef<{ file: File; url: string } | null>(null);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; uploadController.current?.abort(); };
  }, []);
  const digits = phone.replace(/\D/g, "");
  const phoneOk = digits.length === 0 || (digits.length >= 10 && digits.length <= 11);

  const pickFile = (file: File | undefined) => {
    if (!file || savingRef.current) return;
    setError(null);
    setEditingPhoto(file);
  };

  const save = async () => {
    if (savingRef.current || editingPhoto || !phoneOk || nick.trim().length < 2) return;
    savingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      let avatarUrl = avatar;
      if (photo) {
        if (uploadedPhoto.current?.file === photo) avatarUrl = uploadedPhoto.current.url;
        else {
          const controller = new AbortController();
          uploadController.current = controller;
          setUploading(0);
          const result = await uploadImage(photo, { onProgress: setUploading, signal: controller.signal });
          avatarUrl = result.url;
          uploadedPhoto.current = { file: photo, url: result.url };
          setUploading(null);
        }
      }
      const saved = await updateMyProfile({ nick: nick.trim(), bio, avatarUrl: avatarUrl || null, name, phone: digits, titleBadge });
      if (mountedRef.current) onSaved(saved);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error && e.name === "AbortError" ? "사진 전송을 취소했어요. 편집한 사진은 그대로 있어요." : e instanceof Error ? e.message : "저장하지 못했어요. 작성한 내용은 그대로 있어요.");
    } finally {
      uploadController.current = null;
      savingRef.current = false;
      if (mountedRef.current) { setUploading(null); setBusy(false); }
    }
  };

  return (
    <>
    <div inert={Boolean(editingPhoto)} aria-hidden={Boolean(editingPhoto)}>
    <Sheet open={open} onClose={() => { if (!savingRef.current && !editingPhoto) onClose(); }} title="프로필 수정">
      <div className="stack" aria-busy={busy || uploading !== null}>
        <section className={photoStyles.profilePhoto} aria-label="프로필 사진">
          <div className={photoStyles.profilePhotoPreview}>
            {photoPreview || avatar ? <img src={photoPreview || avatar} alt="프로필 사진 미리보기" /> : nick.slice(0, 1)}
          </div>
          <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} aria-label="프로필 사진 선택" onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
          <div className={photoStyles.profilePhotoActions}>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => pickerRef.current?.click()}>사진 선택</button>
            {photo && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditingPhoto(photo)}>다시 편집</button>}
            {(photo || avatar) && <button type="button" className="text-btn muted" disabled={busy} onClick={() => { setPhoto(null); setAvatar(""); uploadedPhoto.current = null; }}>사진 삭제</button>}
          </div>
          <p className={photoStyles.profilePhotoNote}>{photo ? "저장을 누르면 새 사진이 적용돼요." : "사진·닉네임·소개는 다른 사람에게 보여요."}</p>
          {uploading !== null && <><progress className={photoStyles.progress} value={uploading} max={100} aria-label="프로필 사진 전송 진행률" /><p className={photoStyles.profilePhotoNote} role="status">사진을 보내고 있어요 · {uploading}%</p><button type="button" className="text-btn" onClick={() => uploadController.current?.abort()}>전송 취소</button></>}
        </section>
        <div className="field"><label htmlFor="profile-nick">닉네임</label><input id="profile-nick" value={nick} disabled={busy} onChange={(e) => setNick(e.target.value)} maxLength={12} placeholder="2~12자" autoComplete="nickname" /></div>
        <div className="field">
          <label htmlFor="profile-bio">소개</label>
          <textarea id="profile-bio" value={bio} disabled={busy} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="나를 소개하는 짧은 한마디" style={{ minHeight: 80 }} />
          <span className="tiny muted" style={{ textAlign: "right" }}>{bio.length}/160</span>
        </div>
        <div className="field">
          <span className={profileStyles.fieldLabel} id="profile-title-label">칭호</span>
          {profile.badges.length === 0 ? (
            <span className="tiny muted">위로 배지를 얻으면 닉네임 옆에 칭호로 달 수 있어요.</span>
          ) : (
            <div className="chips wrap" role="radiogroup" aria-labelledby="profile-title-label">
              <button type="button" role="radio" aria-checked={titleBadge === ""} className={`chip ${titleBadge === "" ? "on" : ""}`} disabled={busy} onClick={() => setTitleBadge("")}>칭호 없음</button>
              {profile.badges.map((b) => (
                <button key={b.id} type="button" role="radio" aria-checked={titleBadge === b.id} className={`chip ${titleBadge === b.id ? "on" : ""}`} disabled={busy} onClick={() => setTitleBadge(b.id)}>
                  <span className={profileStyles.chipIco}><BadgeIcon id={b.id} /></span>{b.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="field"><label htmlFor="profile-name">이름 (나만 보기)</label><input id="profile-name" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" autoComplete="name" /></div>
        <div className="field">
          <label htmlFor="profile-phone">전화번호 (나만 보기)</label>
          <input id="profile-phone" value={phone} disabled={busy} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" autoComplete="tel" />
          {!phoneOk && <span className="form-error">숫자 10~11자리로 입력해요.</span>}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn ghost" disabled={busy || uploading !== null} onClick={onClose}>취소</button>
        <button type="button" className="btn" disabled={!phoneOk || busy || uploading !== null || nick.trim().length < 2} onClick={save}>{uploading !== null ? `사진 전송 중 ${uploading}%` : busy ? "저장 중…" : "저장"}</button>
      </div>
    </Sheet>
    </div>
    {editingPhoto && <PhotoEditor file={editingPhoto} aspectRatio={1} allowAspectChange={false} onClose={() => setEditingPhoto(null)} onSave={(edited) => { setPhoto(edited); uploadedPhoto.current = null; setEditingPhoto(null); }} />}
    </>
  );
}
