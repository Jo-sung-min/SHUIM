"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Me, fetchMe, signIn, signOut, signUp, startKakaoLogin, updateNick } from "@/lib/auth";
import { Empty, Segmented, SkeletonCard, TopBar, fmtDate } from "@/components/ui";
import { toastSuccess } from "@/lib/toast";
import { todayKey } from "@/lib/storage";
import { POLICY_VERSION, acceptPolicyConsent, fetchPolicyConsent, type PolicyConsent } from "@/lib/safety";
import { IconChevronL, IconChevronR, IconKakao, IconNote, IconShield, IconUser } from "@/components/Icons";
import styles from "../account-screens.module.css";

type Mode = "login" | "signup";
type Pending = "submit" | "nick" | "logout" | "kakao" | null;

export default function AuthPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [nick, setNick] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const pendingRef = useRef(false);
  const navigatingRef = useRef(false);
  const [editNick, setEditNick] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [aiAccepted, setAiAccepted] = useState(false);
  const [kakaoSignup, setKakaoSignup] = useState(false);
  const [policy, setPolicy] = useState<PolicyConsent | null>(null);
  const busy = pending !== null;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "signup") setMode("signup");
    if (q.get("provider") === "kakao") setKakaoSignup(true);
    if (q.get("error") === "kakao") {
      setError("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
      window.history.replaceState(null, "", "/auth");
    }
    fetchMe(true).then(setMe);
    fetchPolicyConsent().then(setPolicy).catch(() => setError("가입 안내를 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요."));
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      navigatingRef.current = false;
      pendingRef.current = false;
      setPending(null);
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  const run = async (action: Exclude<Pending, null>, work: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(action);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 완료하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (!navigatingRef.current) {
        pendingRef.current = false;
        setPending(null);
      }
    }
  };

  const submit = () => run("submit", async () => {
    if (mode === "signup" && !termsAccepted) {
      setError("이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.");
      return;
    }
    const result = mode === "signup"
      ? await signUp(email, nick, password, { signupConsentVersion: POLICY_VERSION, aiDisclosureAccepted: aiAccepted })
      : await signIn(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigatingRef.current = true;
    router.push(new URLSearchParams(window.location.search).get("next") === "delete" ? "/account-deletion" : "/");
  });

  const back = <Link href="/me" className="icon-btn" aria-label="내 공간으로"><IconChevronL /></Link>;

  if (!me) return <><TopBar title="계정" right={back} /><div className="screen" role="status" aria-label="계정을 확인하고 있어요"><SkeletonCard lines={2} head /><div style={{ height: 16 }} /><SkeletonCard lines={3} /></div></>;

  if (!me.configured) return <><TopBar title="계정" right={back} /><div className="screen"><Empty icon={<IconUser />} title="계정을 준비하고 있어요" action={<button type="button" className="btn ghost" disabled={busy} onClick={() => run("submit", async () => { setMe(await fetchMe(true)); })}>{busy ? "확인 중…" : "다시 확인"}</button>}>잠시 후 다시 연결해 주세요.</Empty></div></>;

  if (me.user) {
    const user = me.user;
    return <>
      <TopBar title="계정 설정" right={back} />
      <div className="screen">
        <section className={`card ${styles.accountCard}`}>
          <span className={styles.accountAvatar} aria-hidden="true">{user.nick.slice(0, 1)}</span>
          <div><h2>{user.nick}</h2><p>{user.email ?? "카카오로 연결된 계정"}</p><p>{fmtDate(todayKey(new Date(user.createdAt)), false)}부터 함께했어요</p></div>
        </section>
        <section className={styles.group} aria-labelledby="account-profile-title">
          <h2 className={styles.groupTitle} id="account-profile-title">내 정보</h2>
          <div className="card">
            {editNick === null ? <div className="row"><span className="grow"><span className="tiny muted">닉네임</span><br /><b>{user.nick}</b></span><button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditNick(user.nick)}>변경</button></div> : <form className="stack" onSubmit={(e) => { e.preventDefault(); run("nick", async () => {
              const message = await updateNick(editNick.trim());
              if (message) { setError(message); return; }
              setMe(await fetchMe(true));
              setEditNick(null);
              toastSuccess("닉네임을 바꿨어요");
            }); }}>
              <div className="field"><label htmlFor="account-nick">닉네임</label><input id="account-nick" value={editNick} onChange={(e) => setEditNick(e.target.value)} minLength={2} maxLength={12} disabled={busy} required autoFocus autoComplete="nickname" /></div>
              <div className="row"><button type="button" className="btn ghost grow" disabled={busy} onClick={() => { setEditNick(null); setError(null); }}>취소</button><button type="submit" className="btn grow" disabled={busy || editNick.trim().length < 2}>{pending === "nick" ? "저장 중…" : "저장"}</button></div>
            </form>}
          </div>
        </section>
        <section className={styles.group} aria-labelledby="account-manage-title">
          <h2 className={styles.groupTitle} id="account-manage-title">관리</h2>
          <div className={`card ${styles.menu}`}>
            <Link href="/blocks" className={styles.menuRow}><IconShield /><span className={styles.menuLabel}><strong>차단한 사용자</strong></span><IconChevronR /></Link>
            {me.admin && <Link href="/admin" className={styles.menuRow}><IconUser /><span className={styles.menuLabel}><strong>관리자 화면</strong></span><IconChevronR /></Link>}
            <Link href="/info" className={styles.menuRow}><IconNote /><span className={styles.menuLabel}><strong>서비스 안내</strong><small>이용약관 · 개인정보 · 계정 및 데이터 삭제</small></span><IconChevronR /></Link>
          </div>
        </section>
        <p className={styles.mutedNote}>로그인한 기록은 다른 기기에서도 이어서 볼 수 있어요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={`btn ghost block ${styles.logout}`} disabled={busy} onClick={() => run("logout", async () => { await signOut(); navigatingRef.current = true; router.push("/"); })}>{pending === "logout" ? "로그아웃 중…" : "로그아웃"}</button>
      </div>
    </>;
  }

  return <>
    <TopBar title="소로우" right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
    <div className="screen">
      <section className={styles.intro}>
        <div className={styles.brandMark} aria-hidden="true" />
        <h2>{mode === "signup" ? <>당신의 하루를<br />함께 기록해요.</> : <>다시 만나서 반가워요.<br />오늘도, 소로우.</>}</h2>
        <p>{mode === "signup" ? (kakaoSignup ? "카카오로 처음 방문하셨네요. 가입 안내를 확인해 주세요." : "이 기기에 쓴 기록도 새 계정으로 이어져요.") : "소중한 기록과 나를 위한 작은 위로를 이어가요."}</p>
      </section>
      <Segmented value={mode} onChange={(value) => { if (!busy) { setMode(value); setKakaoSignup(false); setError(null); } }} options={[{ value: "login", label: "로그인" }, { value: "signup", label: "회원가입" }]} />
      <form className={`stack ${styles.form}`} onSubmit={(e) => { e.preventDefault(); submit(); }} aria-busy={pending === "submit"}>
        <fieldset disabled={busy}>
          {!kakaoSignup && <>
          <div className="field"><label htmlFor="auth-email">이메일</label><input id="auth-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" required /></div>
          {mode === "signup" && <div className="field"><label htmlFor="auth-nick">닉네임</label><input id="auth-nick" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" placeholder="나를 부를 이름, 2~12자" minLength={2} maxLength={12} required /></div>}
          <div className="field"><label htmlFor="auth-password">비밀번호</label><input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상 입력해 주세요" minLength={mode === "signup" ? 6 : undefined} required /></div>
          </>}
          {mode === "signup" && <section className={styles.consent} aria-labelledby="signup-consent-title">
            <h3 id="signup-consent-title">가입 전 확인해 주세요</h3>
            <label className={styles.check}><input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required /><span><strong>[필수] <Link href="/terms">이용약관</Link>에 동의하고<br /><Link href="/privacy">개인정보 처리방침</Link>을 확인했어요.</strong></span></label>
            <p>계정 정보는 가입과 로그인에 사용해요. 로그인하면 기록을 보관하고 다른 기기에서도 이어서 볼 수 있어요. 입력하는 내용에 민감한 정보가 포함되지 않도록 확인해 주세요.</p>
            <label className={styles.check}><input type="checkbox" checked={aiAccepted} onChange={(e) => setAiAccepted(e.target.checked)} /><span><strong>[선택] AI 기능의 정보 처리에 동의해요.</strong></span></label>
            <p>AI 기능을 요청하면 관련 기록·메모·목표·일정과 위로 요청 내용을 소로우가 받아 Anthropic의 AI 서비스 Claude에 전달해 답변을 만들어요. 분석에는 전체 메모가 포함될 수 있어요. AI 답변은 의료 진단이나 치료가 아니에요. 동의하지 않아도 가입할 수 있고, AI를 사용할 때 따로 선택할 수 있어요. <Link href="/privacy#ai-processing">AI 정보 처리 자세히 보기</Link></p>
          </section>}
        </fieldset>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!kakaoSignup && <button type="submit" className="btn block" disabled={busy || (mode === "signup" && !termsAccepted)}>{pending === "submit" ? (mode === "signup" ? "가입하는 중…" : "로그인하는 중…") : mode === "signup" ? "동의하고 가입하기" : "로그인"}</button>}
      </form>
      {me.kakao && <>
        {!kakaoSignup && <div className="or-line"><span>또는</span></div>}
        <button type="button" className="btn block kakao" disabled={busy || (mode === "signup" && (!termsAccepted || !policy))} onClick={() => run("kakao", async () => {
          if (mode === "signup") {
            if (!termsAccepted || !policy) return;
            const saved = await acceptPolicyConsent({ signupConsentVersion: POLICY_VERSION, aiDisclosureAccepted: aiAccepted, expectedUserId: policy.userId });
            setPolicy(saved);
          }
          navigatingRef.current = true;
          startKakaoLogin();
        })}><IconKakao />{pending === "kakao" ? "카카오로 연결 중…" : mode === "signup" ? "동의하고 카카오로 가입하기" : "카카오로 로그인"}</button>
        <p className={styles.mutedNote}>{mode === "signup" ? "동의한 내용은 가입 정보와 함께 저장해요." : "처음 이용하는 경우 가입 안내를 확인한 뒤 시작해요."}</p>
      </>}
      <nav className={styles.support} aria-label="서비스 안내"><Link href="/info">서비스 안내와 개인정보 보호<IconChevronR /></Link></nav>
    </div>
  </>;
}
