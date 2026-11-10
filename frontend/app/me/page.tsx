"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Me, canUseFireworks, fetchMe } from "@/lib/auth";
import { loadGoals, loadJournal, loadMemos, loadNotifSeen, loadSchedule, markNotifSeen, streak, syncRecords, todayKey } from "@/lib/storage";
import { MyProfile, ProfilePage, ServerNotification, fetchMyProfile, fetchNotifications, fetchProfilePage, markBadgesSeen, unreadMessages, updateMyProfile } from "@/lib/social";
import { Empty, SkeletonList, TopBar, fmtRelative } from "@/components/ui";
import { useScrollMemory } from "@/lib/scroll-memory";
import { toastSuccess } from "@/lib/toast";
import { IconInbox, IconBell, IconBubble, IconCalendar, IconChevronL, IconFlag, IconMessage, IconNote, IconSettings } from "@/components/Icons";
import ProfileHeader from "@/components/ProfileHeader";
import { PointsCard } from "@/components/PointsWallet";
import { FireworkTicketCard } from "@/components/FireworkTicketSheet";
import BadgeShelf, { BadgeCelebration } from "@/components/BadgeShelf";
import ProfileSheet from "@/components/ProfileSheet";
import ProfileTabs from "@/components/ProfileTabs";
import styles from "../account-screens.module.css";
import profileStyles from "@/components/Profile.module.css";
import { route } from "@/lib/routes";

type View = "profile" | "notif";

/**
 * 나 페이지 = 남이 보는 내 프로필 + 나만 보이는 도구.
 * 위: 프로필 머리(사진, 닉네임·칭호, 위로글 · 리스너 · 리스닝) · 위로 배지 선반 · 나만 보이는 도구 줄(메시지·메모·목표·일정, 점선) · 소개 · 온기 포인트와 폭죽 이용권 한 줄
 * 아래: 콘텐츠 탭(위로글 · 외침 · 내 위로 · 저장함). 넓게 잡는다
 * 프로필 편집·공유는 설정에. 알림은 위쪽 종 아이콘. 서로 기다릴 필요 없는 요청은 동시에 보낸다.
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
  const router = useRouter();

  const reload = useCallback(async () => {
    setError(null);
    const m = await fetchMe(true);
    // 로그인하지 않았으면 이 화면은 보여 줄 게 없어 바로 로그인으로 (로그인하면 다시 여기로)
    if (!m.user) { router.replace("/auth?next=me"); return; }
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
  }, [router]);
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
                middle={
                  <>
                    <BadgeShelf earned={profile.badges} catalog={profile.badgeCatalog} />
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
                  </>
                }
              />
            ) : (
              <div className="sk-card" role="status" aria-label="프로필을 불러오고 있어요"><div className="sk-row"><div className="sk sk-circle lg" /><div className="sk-col"><div className="sk sk-line lg w60" /><div className="sk w80" /></div></div></div>
            )}

            {user && <div className={profileStyles.wallets}>
              <PointsCard key={user.id} userId={user.id} />
              {me && canUseFireworks(me) && <FireworkTicketCard key={`fireworks-${user.id}`} userId={user.id} />}
            </div>}

            {page ? <ProfileTabs data={page} /> : <div style={{ marginTop: 20 }} role="status" aria-label="내 글을 불러오고 있어요"><SkeletonList count={2} lines={2} /></div>}

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
                <Link key={n.id} href={n.postKind === "post" ? route(`/shout/${n.postId}`) : `/feed?post=${n.postId}`} className={`notif ${n.read ? "" : "unread"}`}>
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
    </>
  );
}
