"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Me, fetchMe } from "@/lib/auth";
import { Segmented, TopBar } from "@/components/ui";
import { IconBriefcase, IconChevronL, IconChevronR, IconNote, IconSettings, IconShield, IconUser } from "@/components/Icons";
import { ThemePref, loadTheme, saveTheme } from "@/lib/theme";
import { IS_AIT } from "@/lib/ait";
import styles from "../account-screens.module.css";

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "기기 설정" },
  { value: "light", label: "화이트" },
  { value: "dark", label: "나이트" },
];

/**
 * 설정: 나 화면의 톱니(와 "설정" 행)에서 들어온다.
 * 계정(닉네임·로그아웃은 /auth), 화면 모드, 편의 기능(차단한 사용자·서비스 안내·관리자)을 한곳에 모았다.
 * 로그인하지 않아도 열린다 — 화면 모드는 이 기기에만 저장되는 설정이라서.
 */
export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [theme, setTheme] = useState<ThemePref>("system"); // 서버 렌더와 맞추려고 기본값으로 시작해 마운트 후 읽는다
  useEffect(() => {
    setTheme(loadTheme());
    fetchMe().then(setMe).catch(() => setMe(null));
  }, []);
  const user = me?.user ?? null;

  return (
    <>
      <TopBar title="설정" right={<Link href="/me" className="icon-btn" aria-label="내 공간으로"><IconChevronL /></Link>} />
      <div className="screen">
        <section className={styles.group} aria-labelledby="settings-account-title" style={{ marginTop: 4 }}>
          <h2 className={styles.groupTitle} id="settings-account-title">계정</h2>
          <div className={`card ${styles.menu}`}>
            {user ? (
              <Link href="/auth" className={styles.menuRow}><IconUser /><span className={styles.menuLabel}><strong>{user.nick}</strong><small>{user.email ?? "카카오로 연결된 계정"} · 닉네임 변경 · 로그아웃</small></span><IconChevronR /></Link>
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
      </div>
    </>
  );
}
