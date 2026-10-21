"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Me, completeOAuthLogin, fetchMe, fetchProviders, signIn, signOut, signUp, updateNick } from "@/lib/auth";
import { Hero, Segmented, TopBar, fmtDate } from "@/components/ui";
import { todayKey } from "@/lib/storage";
import { IconChevronL } from "@/components/Icons";

type Mode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [nick, setNick] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editNick, setEditNick] = useState<string | null>(null);
  const [kakao, setKakao] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("oauth") === "kakao") {
      // 카카오에서 돌아온 직후: 세션은 이미 있고, 게스트 기록만 계정으로 옮긴 뒤 홈으로
      completeOAuthLogin().then((m) => {
        if (m.user) router.replace("/");
        else {
          setMe(m);
          setError("카카오 로그인을 완료하지 못했어요. 다시 시도해요.");
        }
      });
      return;
    }
    const oauthError = q.get("oauthError");
    if (oauthError) {
      setError(
        oauthError === "cancelled" ? "카카오 로그인을 취소했어요." :
        oauthError === "not_configured" ? "카카오 로그인이 아직 설정되지 않았어요." :
        "카카오 로그인에 실패했어요. 잠시 후 다시 시도해요."
      );
      window.history.replaceState(null, "", "/auth");
    }
    fetchProviders().then((p) => setKakao(p.kakao));
    fetchMe(true).then((m) => {
      setMe(m);
      if (!m.user && m.admin) setMode("signup"); // 아직 계정이 없는 데모 상태면 가입부터
    });
  }, [router]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = mode === "signup" ? await signUp(email, nick, password) : await signIn(email, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push("/");
  };

  if (!me) return <TopBar title="계정" />;

  if (!me.configured) {
    return (
      <>
        <TopBar title="계정" right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
        <div className="screen"><div className="notice warn">서버에 DB_URL이 설정되지 않아 계정 기능을 쓸 수 없어요.</div></div>
      </>
    );
  }

  if (me.user) {
    const u = me.user;
    return (
      <>
        <TopBar title="내 계정" eyebrow={u.email ?? ""} right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
        <div className="screen">
          <Hero label={me.admin ? "관리자" : "회원"} title={`${u.nick} 님`} sub={`${fmtDate(todayKey(new Date(u.createdAt)), false)} 가입`} stats={[me.admin ? "관리자 권한" : "일반 회원"]} />
          <div className="section-title"><span>닉네임</span></div>
          <section className="card">
            {editNick === null ? (
              <div className="row"><b className="grow" style={{ fontSize: 16 }}>{u.nick}</b><button className="text-btn" onClick={() => setEditNick(u.nick)}>변경</button></div>
            ) : (
              <div className="stack">
                <div className="field"><input value={editNick} onChange={(e) => setEditNick(e.target.value)} maxLength={12} autoFocus /></div>
                {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
                <div className="sheet-actions" style={{ marginTop: 0 }}>
                  <button className="btn ghost" onClick={() => { setEditNick(null); setError(null); }}>취소</button>
                  <button
                    className="btn"
                    onClick={async () => {
                      const err = await updateNick(editNick);
                      if (err) setError(err);
                      else {
                        setMe(await fetchMe(true));
                        setEditNick(null);
                        setError(null);
                      }
                    }}
                  >
                    저장
                  </button>
                </div>
              </div>
            )}
          </section>
          {me.admin && (
            <>
              <div className="section-title"><span>관리</span></div>
              <Link href="/admin" className="card row" style={{ padding: "14px 16px" }}>
                <span className="grow"><b style={{ fontSize: 15 }}>관리자 화면</b><div className="tiny muted">신고 검토 · 유저 차단 · AI 프롬프트 관리</div></span>
              </Link>
            </>
          )}
          <div className="notice" style={{ marginTop: 20 }}>로그인한 동안의 기록·메모·목표·일정은 서버에 저장되어 다른 기기에서도 이어져요.</div>
          <button className="btn ghost block" style={{ marginTop: 16 }} onClick={async () => { await signOut(); router.push("/"); }}>로그아웃</button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={mode === "signup" ? "회원가입" : "로그인"} eyebrow="마음 가속도" right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
      <div className="screen">
        <Hero label="계정" title={mode === "signup" ? "나만의 기록을 시작해요" : "다시 돌아왔어요"} sub={mode === "signup" ? "가입하면 지금까지 이 기기에 쓴 기록을 그대로 가져와요. 첫 번째 계정은 관리자가 돼요." : undefined} />
        <div style={{ marginTop: 12 }}>
          <Segmented value={mode} onChange={(m) => { setMode(m); setError(null); }} options={[{ value: "login", label: "로그인" }, { value: "signup", label: "회원가입" }]} />
        </div>
        {kakao && (
          <div style={{ marginTop: 12 }}>
            <a className="btn block kakao" href={`/api/auth/oauth/kakao?return=${encodeURIComponent("/auth?oauth=kakao")}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path fill="currentColor" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.7 1.8 5.1 4.5 6.5l-1 3.7c-.1.3.2.5.5.4l4.4-2.9c.5.1 1 .1 1.6.1 5.5 0 10-3.5 10-7.8S17.5 3 12 3Z" /></svg>
              카카오로 시작하기
            </a>
            <div className="or-line"><span>또는 이메일로</span></div>
          </div>
        )}
        <form className="card stack" style={{ marginTop: 12, gap: 14 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="field"><label>이메일</label><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
          {mode === "signup" && <div className="field"><label>닉네임</label><input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="2~12자" maxLength={12} required /></div>}
          <div className="field"><label>비밀번호</label><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상" required /></div>
          {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
          <button type="submit" className="btn block" disabled={busy}>{busy ? "잠시만요…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}</button>
        </form>
      </div>
    </>
  );
}
