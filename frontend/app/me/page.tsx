"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Me, fetchMe, signOut } from "@/lib/auth";
import { clearAll, formatPhone, loadGoals, loadJournal, loadMemos, loadNotifSeen, loadSchedule, markNotifSeen, streak, syncRecords, todayKey } from "@/lib/storage";
import { Notification, fetchCommunity, listNotifications } from "@/lib/community";
import { MyProfile, fetchMyProfile, unreadMessages, updateMyProfile } from "@/lib/social";
import { uploadImage } from "@/lib/upload";
import PhotoEditor from "@/components/PhotoEditor";
import photoStyles from "@/components/PhotoEditor.module.css";
import { ConfirmSheet, Empty, Segmented, Sheet, TopBar, fmtRelative } from "@/components/ui";
import { useScrollMemory } from "@/lib/scroll-memory";
import { toastSuccess } from "@/lib/toast";
import { IconCalendar, IconCoin, IconFlag, IconMessage, IconNote, IconSettings, IconShield, IconTrophy, IconUser, IconChevronR, IconBubble } from "@/components/Icons";
import styles from "../account-screens.module.css";

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
  const [pending, setPending] = useState<"clear" | "logout" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const actionInFlight = useRef(false);

  const reload = useCallback(async () => {
    setError(null);
    const m = await fetchMe(true);
    setMe(m);
    await syncRecords();
    const j = loadJournal();
    const t = todayKey();
    setStats({ streak: streak(j), memos: loadMemos().length, goals: loadGoals().filter((g) => !g.doneAt).length, today: loadSchedule().filter((s) => s.date === t && !s.done).length });
    try {
      const [p, c, u] = await Promise.all([fetchMyProfile(), fetchCommunity(), unreadMessages()]);
      setProfile(p);
      setNotifs(listNotifications(c, loadNotifSeen()));
      setDmUnread(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결이 잠시 원활하지 않아요. 다시 시도해 주세요.");
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useScrollMemory(me !== null);

  const openNotif = () => {
    setView("notif");
    markNotifSeen();
    setNotifs((current) => current.map((notification) => ({ ...notification, read: true })));
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
  const unread = notifs.filter((n) => !n.read).length;
  const nick = profile?.nick ?? user?.nick ?? "나";
  const tiles = [
    { href: "/messages", label: "메시지", Icon: IconMessage, n: dmUnread },
    { href: "/memo", label: "메모", Icon: IconNote, n: stats.memos },
    { href: "/goals", label: "목표", Icon: IconFlag, n: stats.goals },
    { href: "/schedule", label: "일정", Icon: IconCalendar, n: stats.today },
  ];

  return (
    <>
      <TopBar title="내 공간" right={<Link href="/auth" className="icon-btn" aria-label="계정 설정"><IconSettings /></Link>} />
      <div className="screen">
        <section className={`card ${styles.profileCard}`} aria-label="내 프로필">
        <div className={styles.profileTop}>
          <button type="button" className="avatar xl" disabled={!profile} aria-label="프로필 사진과 정보 수정" onClick={() => setEditing(true)} style={profile?.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}>
            {!profile?.avatarUrl && (nick !== "나" ? nick.slice(0, 1) : <IconUser />)}
          </button>
          <div className="grow">
            {profile?.isCreator && <span className="badge">크리에이터</span>}
            <h2>{nick === "나" ? "나만의 공간" : nick}</h2>
            <p>{profile?.bio || "나를 알아가는 작은 기록들"}</p>
            {profile && <button type="button" className={`text-btn ${styles.profileEdit}`} onClick={() => setEditing(true)}>프로필 수정</button>}
          </div>
        </div>
          <div className={styles.profileMetrics}>
            <div><b>{profile?.stats.feedPosts ?? 0}</b><small>위로글</small></div>
            <div><b>{profile?.stats.followers ?? 0}</b><small>팔로워</small></div>
            <div><b>{stats.streak}<span className="tiny">일</span></b><small>연속 기록</small></div>
          </div>
        {profile && (
          <div className={styles.profileActions}>
            <Link href={`/u/${profile.id}`} className="btn ghost sm">공개 프로필</Link>
            {!user && <Link href="/auth" className="btn sm">로그인 · 회원가입</Link>}
          </div>
        )}
        </section>
        {error && <div className={styles.error} role="alert">{error}</div>}

        <Segmented value={view} onChange={(v) => (v === "notif" ? openNotif() : setView("profile"))} options={[{ value: "profile", label: "모아보기" }, { value: "notif", label: unread ? `알림 ${unread}` : "알림" }]} />

        {view === "profile" && (
          <>
            <div className={styles.utilityGrid}>
              {tiles.map(({ href, label, Icon, n }) => (
                <Link key={href} href={href} className="me-tile">
                  <span className="ico"><Icon /></span>
                  <span className="lbl">{label}</span>
                  {typeof n === "number" && n > 0 && <span className="n">{n}</span>}
                </Link>
              ))}
            </div>
            <section className={styles.group} aria-labelledby="me-together-title">
              <h2 className={styles.groupTitle} id="me-together-title">함께하는 소로우</h2>
              <div className={`card ${styles.menu}`}>
                <Link href="/ranking" className={styles.menuRow}><IconTrophy /><span className={styles.menuLabel}><strong>따뜻한 마음 랭킹</strong></span><IconChevronR /></Link>
                <Link href="/fund" className={styles.menuRow}><IconCoin /><span className={styles.menuLabel}><strong>함께하는 모금</strong></span><IconChevronR /></Link>
              </div>
            </section>
            <section className={styles.group} aria-labelledby="me-settings-title">
              <h2 className={styles.groupTitle} id="me-settings-title">설정과 안내</h2>
              <div className={`card ${styles.menu}`}>
                <Link href="/auth" className={styles.menuRow}><IconUser /><span className={styles.menuLabel}><strong>{user ? "계정 설정" : "로그인 · 회원가입"}</strong></span><IconChevronR /></Link>
                <Link href="/blocks" className={styles.menuRow}><IconShield /><span className={styles.menuLabel}><strong>차단한 사용자</strong></span><IconChevronR /></Link>
                <Link href="/info" className={styles.menuRow}><IconNote /><span className={styles.menuLabel}><strong>서비스 안내</strong><small>개인정보 · 이용약관 · 도움과 문의</small></span><IconChevronR /></Link>
                {me.admin && <Link href="/admin" className={styles.menuRow}><IconSettings /><span className={styles.menuLabel}><strong>관리자 화면</strong></span><IconChevronR /></Link>}
              </div>
            </section>
            <div className={styles.quietActions}>
              <button type="button" className="text-btn muted" disabled={pending !== null} onClick={() => setConfirmClear(true)}>{pending === "clear" ? "삭제 중…" : "기록 전체 삭제"}</button>
              {user && <button type="button" className="text-btn muted" disabled={pending !== null} onClick={() => runAction("logout", async () => { await signOut(); await reload(); })}>{pending === "logout" ? "로그아웃 중…" : "로그아웃"}</button>}
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
              <Empty icon={<IconBubble />} title="아직 도착한 알림이 없어요">내 이야기에 달린 위로와 답글을<br />이곳에 모아드릴게요.</Empty>
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
          onSaved={(p) => { setProfile(p); setEditing(false); toastSuccess("프로필을 저장했어요"); fetchMe(true).then(setMe); }}
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

/* ================= 프로필 편집: 사진·닉네임·소개(공개) + 이름·전화(비공개) ================= */

function ProfileSheet({ open, profile, onClose, onSaved }: { open: boolean; profile: MyProfile; onClose: () => void; onSaved: (p: MyProfile) => void }) {
  const [nick, setNick] = useState(profile.nick);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState(profile.avatarUrl ?? "");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(formatPhone(profile.phone));
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
      const saved = await updateMyProfile({ nick: nick.trim(), bio, avatarUrl: avatarUrl || null, name, phone: digits });
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
