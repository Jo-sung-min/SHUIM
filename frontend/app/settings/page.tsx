"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Me, fetchMe, signOut } from "@/lib/auth";
import { ConfirmSheet, Segmented, TopBar } from "@/components/ui";
import { IconBook, IconBriefcase, IconCalendar, IconChevronL, IconChevronR, IconFlag, IconNote, IconSettings, IconShield, IconUser } from "@/components/Icons";
import { ThemePref, loadTheme, saveTheme } from "@/lib/theme";
import { RecordKind, clearRecordKind, loadGoals, loadJournal, loadMemos, loadSchedule, syncRecords } from "@/lib/storage";
import { toastSuccess } from "@/lib/toast";
import { IS_AIT } from "@/lib/ait";
import styles from "../account-screens.module.css";

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "기기 설정" },
  { value: "light", label: "화이트" },
  { value: "dark", label: "나이트" },
];

/** 기록 관리에서 종류별로 지울 수 있는 것들 */
const RECORD_KINDS: { kind: RecordKind; label: string; obj: string; unit: string; Icon: typeof IconBook }[] = [
  { kind: "journal", label: "하루 기록", obj: "하루 기록을", unit: "일", Icon: IconBook },
  { kind: "memos", label: "메모", obj: "메모를", unit: "개", Icon: IconNote },
  { kind: "goals", label: "목표", obj: "목표를", unit: "개", Icon: IconFlag },
  { kind: "schedule", label: "일정", obj: "일정을", unit: "개", Icon: IconCalendar },
];

/**
 * 설정: 나 화면의 톱니에서 들어온다.
 * 계정(닉네임은 /auth), 화면 모드, 기록 관리(종류별 삭제), 편의 기능(차단한 사용자·서비스 안내·관리자), 맨 아래 로그아웃을 한곳에 모았다.
 * 로그인하지 않아도 열린다 — 화면 모드는 이 기기에만 저장되는 설정이라서.
 */
export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [theme, setTheme] = useState<ThemePref>("system"); // 서버 렌더와 맞추려고 기본값으로 시작해 마운트 후 읽는다
  const [counts, setCounts] = useState<Record<RecordKind, number> | null>(null);
  const [clearing, setClearing] = useState<RecordKind | null>(null);
  useEffect(() => {
    setTheme(loadTheme());
    fetchMe().then(setMe).catch(() => setMe(null));
    // 서버 기록을 먼저 맞춘 뒤 센다 (실패해도 이 기기 기록으로)
    syncRecords().catch(() => false).then(() => setCounts({ journal: Object.keys(loadJournal()).length, memos: loadMemos().length, goals: loadGoals().length, schedule: loadSchedule().length }));
  }, []);
  const user = me?.user ?? null;
  const clearingInfo = RECORD_KINDS.find((k) => k.kind === clearing);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const router = useRouter();
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try { await signOut(); router.replace("/"); }
    catch (e) { setLogoutError(e instanceof Error ? e.message : "로그아웃하지 못했어요."); setLoggingOut(false); }
  };

  return (
    <>
      <TopBar title="설정" right={<Link href="/me" className="icon-btn" aria-label="내 공간으로"><IconChevronL /></Link>} />
      <div className="screen">
        <section className={styles.group} aria-labelledby="settings-account-title" style={{ marginTop: 4 }}>
          <h2 className={styles.groupTitle} id="settings-account-title">계정</h2>
          <div className={`card ${styles.menu}`}>
            {user ? (
              <Link href="/auth" className={styles.menuRow}><IconUser /><span className={styles.menuLabel}><strong>{user.nick}</strong><small>{user.email ?? "카카오로 연결된 계정"} · 닉네임 변경</small></span><IconChevronR /></Link>
            ) : (
              <Link href="/auth" className={styles.menuRow}><IconUser /><span className={styles.menuLabel}><strong>{me ? "로그인 · 회원가입" : "계정"}</strong><small>{me ? "기록을 보관하고 다른 기기에서도 이어서 봐요" : "확인하고 있어요…"}</small></span><IconChevronR /></Link>
            )}
          </div>
        </section>

        {/* 앱인토스 미니앱은 라이트 모드만 써서 화면 모드를 고르지 않는다 */}
        {!IS_AIT && <section className={styles.group} aria-labelledby="settings-theme-title">
          <h2 className={styles.groupTitle} id="settings-theme-title">화면 모드</h2>
          <Segmented value={theme} onChange={(v) => { setTheme(v); saveTheme(v); }} options={THEME_OPTIONS} />
          <p className={styles.mutedNote} style={{ marginTop: 8 }}>이 기기에만 저장돼요.</p>
        </section>}

        <section className={styles.group} aria-labelledby="settings-records-title">
          <h2 className={styles.groupTitle} id="settings-records-title">기록 관리</h2>
          <div className={`card ${styles.menu}`}>
            {RECORD_KINDS.map(({ kind, label, unit, Icon }) => (
              <div key={kind} className={styles.menuRow}>
                <Icon />
                <span className={styles.menuLabel}><strong>{label}</strong><small>{counts ? `${counts[kind]}${unit}` : "확인하고 있어요…"}</small></span>
                <button type="button" className="text-btn danger" disabled={!counts || counts[kind] === 0} onClick={() => setClearing(kind)}>지우기</button>
              </div>
            ))}
          </div>
          <p className={styles.mutedNote} style={{ marginTop: 8 }}>{user ? "이 계정의 기록에서 지워져요." : "이 기기의 기록에서 지워져요."}</p>
        </section>

        <section className={styles.group} aria-labelledby="settings-tools-title">
          <h2 className={styles.groupTitle} id="settings-tools-title">편의 기능</h2>
          <div className={`card ${styles.menu}`}>
            <Link href="/blocks" className={styles.menuRow}><IconShield /><span className={styles.menuLabel}><strong>차단한 사용자</strong></span><IconChevronR /></Link>
            <Link href="/info" className={styles.menuRow}><IconNote /><span className={styles.menuLabel}><strong>서비스 안내</strong><small>개인정보 · 이용약관 · 도움과 문의 · 계정 및 데이터 삭제</small></span><IconChevronR /></Link>
            {me?.admin && <Link href="/admin" className={styles.menuRow}><IconSettings /><span className={styles.menuLabel}><strong>관리자 화면</strong></span><IconChevronR /></Link>}
          </div>
        </section>

        {/* 운영자의 부업 추천 사이트(부추). 개인 공간(나 페이지)과 성격이 달라 설정 맨 아래에 둔다. 새 탭으로 연다.
            앱인토스 미니앱은 자사 서비스로 보내는 링크를 둘 수 없어 뺀다 */}
        {!IS_AIT && <section className={styles.group} aria-labelledby="settings-more-title">
          <h2 className={styles.groupTitle} id="settings-more-title">더 보기</h2>
          <div className={`card ${styles.menu}`}>
            <a href="https://www.buchu.co.kr" target="_blank" rel="noopener noreferrer" className={styles.menuRow}><IconBriefcase /><span className={styles.menuLabel}><strong>부업하러 가기</strong><small>부업추천 부추 · buchu.co.kr</small></span><IconChevronR /></a>
          </div>
        </section>}

        {/* 인스타처럼 계속 로그인된 채로 쓰고, 로그아웃은 설정 맨 아래에만 */}
        {user && <section className={styles.group} aria-label="로그아웃">
          <div className={`card ${styles.menu}`}>
            <button type="button" className={styles.menuRow} disabled={loggingOut} onClick={logout}><span className={styles.menuLabel}><strong className={styles.dangerText}>{loggingOut ? "로그아웃 중…" : "로그아웃"}</strong><small>{user.nick}</small></span></button>
          </div>
          {logoutError && <p className={styles.error} role="alert" style={{ marginTop: 8 }}>{logoutError}</p>}
        </section>}
      </div>
      <ConfirmSheet
        open={clearing !== null}
        title={`${clearingInfo?.obj ?? "기록을"} 모두 지울까요?`}
        message="지운 기록은 되돌릴 수 없어요."
        confirmLabel="지우기"
        danger
        onClose={() => setClearing(null)}
        onConfirm={() => {
          if (!clearing) return;
          clearRecordKind(clearing);
          setCounts((c) => (c ? { ...c, [clearing]: 0 } : c));
          toastSuccess(`${clearingInfo?.obj ?? "기록을"} 지웠어요`);
          setClearing(null);
        }}
      />
    </>
  );
}
