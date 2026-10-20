"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Account, accountCount, currentUser, signIn, signOut, signUp, updateNick } from "@/lib/auth";
import { Hero, Segmented, TopBar, fmtDate } from "@/components/ui";
import { todayKey } from "@/lib/storage";
import { IconChevronL } from "@/components/Icons";

type Mode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [me, setMe] = useState<Account | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [nick, setNick] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editNick, setEditNick] = useState<string | null>(null);

  useEffect(() => {
    setMe(currentUser());
    setMode(accountCount() === 0 ? "signup" : "login");
  }, []);

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

  if (me === undefined) return <TopBar title="계정" />;

  if (me) {
    const created = new Date(me.createdAt);
    return (
      <>
        <TopBar title="내 계정" eyebrow={me.email} right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
        <div className="screen">
          <Hero
            label={me.role === "admin" ? "관리자" : "회원"}
            title={`${me.nick} 님`}
            sub={`${fmtDate(todayKey(created), false)} 가입 · 기록·메모·목표·일정은 이 계정 이름으로 따로 저장돼요.`}
            stats={[me.role === "admin" ? "관리자 권한" : "일반 회원"]}
          />
          <div className="section-title"><span>닉네임</span></div>
          <section className="card">
            {editNick === null ? (
              <div className="row">
                <b className="grow" style={{ fontSize: 16 }}>{me.nick}</b>
                <button className="text-btn" onClick={() => setEditNick(me.nick)}>변경</button>
              </div>
            ) : (
              <div className="stack">
                <div className="field">
                  <input value={editNick} onChange={(e) => setEditNick(e.target.value)} maxLength={12} autoFocus />
                </div>
                {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
                <div className="sheet-actions" style={{ marginTop: 0 }}>
                  <button className="btn ghost" onClick={() => { setEditNick(null); setError(null); }}>취소</button>
                  <button
                    className="btn"
                    onClick={() => {
                      const err = updateNick(editNick);
                      if (err) setError(err);
                      else {
                        setMe(currentUser());
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

          {me.role === "admin" && (
            <>
              <div className="section-title"><span>관리</span></div>
              <Link href="/admin" className="card row" style={{ padding: "14px 16px" }}>
                <span className="grow">
                  <b style={{ fontSize: 15 }}>관리자 화면</b>
                  <div className="tiny muted">신고 검토 · 유저 차단 · AI 프롬프트 관리</div>
                </span>
              </Link>
            </>
          )}

          <div className="notice" style={{ marginTop: 20 }}>
            프로토타입이라 계정은 이 기기 안에만 저장돼요. 다른 기기와 동기화하려면 서버가 필요해요.
          </div>

          <button
            className="btn ghost block"
            style={{ marginTop: 16 }}
            onClick={() => {
              signOut();
              router.push("/");
            }}
          >
            로그아웃
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={mode === "signup" ? "회원가입" : "로그인"} eyebrow="마음 가속도" right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
      <div className="screen">
        <Hero
          label="계정"
          title={mode === "signup" ? "나만의 기록을 시작해요" : "다시 돌아왔어요"}
          sub={mode === "signup" ? "가입하면 지금까지 이 기기에 쓴 기록을 그대로 가져와요. 첫 번째 계정은 관리자가 돼요." : "계정별로 기록·메모·목표·일정이 따로 저장돼요."}
        />
        <div style={{ marginTop: 12 }}>
          <Segmented
            value={mode}
            onChange={(m) => { setMode(m); setError(null); }}
            options={[
              { value: "login", label: "로그인" },
              { value: "signup", label: "회원가입" },
            ]}
          />
        </div>
        <form
          className="card stack"
          style={{ marginTop: 12, gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="field">
            <label>이메일</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>닉네임</label>
              <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="2~12자" maxLength={12} required />
            </div>
          )}
          <div className="field">
            <label>비밀번호</label>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              required
            />
          </div>
          {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
          <button type="submit" className="btn block" disabled={busy}>
            {busy ? "잠시만요…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}
          </button>
        </form>
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>
          프로토타입: 계정과 비밀번호(해시)는 이 기기의 브라우저에만 저장돼요.
        </p>
      </div>
    </>
  );
}
