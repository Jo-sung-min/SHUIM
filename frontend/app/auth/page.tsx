"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Me, fetchMe, signIn, signInWithToss, signOut, signUp, startKakaoLogin, updateNick } from "@/lib/auth";
import { IS_AIT } from "@/lib/ait";
import { Empty, Segmented, SkeletonCard, TopBar, fmtDate } from "@/components/ui";
import { toastSuccess } from "@/lib/toast";
import { hasGuestData, todayKey } from "@/lib/storage";
import { POLICY_VERSION, acceptPolicyConsent, fetchPolicyConsent, type PolicyConsent } from "@/lib/safety";
import { IconChevronL, IconChevronR, IconKakao, IconUser } from "@/components/Icons";
import styles from "../account-screens.module.css";

type Mode = "login" | "signup";

/** 가입 동의: 필수(이용약관·개인정보 처리방침, 만 14세 이상)와 선택(AI 정보 처리)을 따로 받는다 */
interface Consent { terms: boolean; age: boolean; ai: boolean }
const NO_CONSENT: Consent = { terms: false, age: false, ai: false };
const requiredConsent = (c: Consent) => c.terms && c.age;

/**
 * 가입 전 동의. [필수] 이용약관·개인정보 처리방침, [필수] 만 14세 이상(화면에서만 확인), [선택] AI 기능의 정보 처리(OpenAI·국외 이전).
 * AI 는 기본으로 꺼져 있고 고르지 않아도 가입할 수 있다 (aiDisclosureAccepted 에 고른 값을 그대로 보낸다).
 * 동의하지 않은 계정은 AI 기능을 처음 쓸 때 AI 이용 안내(/info/ai, requestAiProcessing)에서 다시 묻는다
 */
function SignupConsent({ value, onChange, disabled, note }: { value: Consent; onChange: (value: Consent) => void; disabled?: boolean; note: string }) {
  const set = (patch: Partial<Consent>) => onChange({ ...value, ...patch });
  return <section className={styles.consent} aria-labelledby="signup-consent-title">
    <h3 id="signup-consent-title">가입 전 확인해 주세요</h3>
    <label className={styles.check}><input type="checkbox" checked={value.terms} onChange={(e) => set({ terms: e.target.checked })} disabled={disabled} required /><span><strong>[필수] <Link href="/terms">이용약관</Link>에 동의하고, <Link href="/privacy">개인정보 처리방침</Link>을 확인했어요.</strong></span></label>
    <label className={styles.check}><input type="checkbox" checked={value.age} onChange={(e) => set({ age: e.target.checked })} disabled={disabled} required /><span><strong>[필수] 만 14세 이상이에요.</strong></span></label>
    <p>{note}</p>
    <label className={styles.check}><input type="checkbox" checked={value.ai} onChange={(e) => set({ ai: e.target.checked })} disabled={disabled} /><span>[선택] AI 기능을 위한 정보 처리와 국외 이전(미국 OpenAI)에 동의해요.</span></label>
    <p>선택한 AI 기능에 필요한 기록·메모·목표·일정 또는 모임 사연을 미국 OpenAI로 보내요. 제출한 사연은 나와 모임 운영자 모두 동의하고 운영자가 AI 정리를 요청할 때도 전달돼요. 건강·감정 같은 민감한 내용이 포함될 수 있어요. 동의하지 않아도 가입할 수 있고 나중에 선택을 바꿀 수 있어요. AI 답변은 의료 진단이나 치료가 아니에요. <Link href="/privacy#ai-processing">AI 정보 처리 자세히 보기</Link></p>
  </section>;
}

/** 이 기기에 로그인 전(게스트) 기록이 있을 때만: 계정으로 옮길지 고른다 (말없이 옮기지 않는다) */
function GuestImportChoice({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} /><span>이 기기에 로그인 전에 쓴 기록이 있어요. 이 계정으로 옮길게요.</span></label>;
}
type Pending = "submit" | "nick" | "logout" | "kakao" | "toss" | null;

export default function AuthPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [nick, setNick] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordsMatch = confirmPassword !== "" && password === confirmPassword;
  const passwordMismatch = confirmPassword !== "" && !passwordsMatch;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const pendingRef = useRef(false);
  const navigatingRef = useRef(false);
  const [editNick, setEditNick] = useState<string | null>(null);
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const termsAccepted = requiredConsent(consent);
  /** 게스트 기록이 있는지, 옮길지 (고르지 않았으면 가입은 옮기기, 로그인은 옮기지 않기를 보여 준다) */
  const [guestData, setGuestData] = useState(false);
  const [adoptChoice, setAdoptChoice] = useState<boolean | null>(null);
  const [kakaoSignup, setKakaoSignup] = useState(false);
  const [tossSignup, setTossSignup] = useState(false);
  const [policy, setPolicy] = useState<PolicyConsent | null>(null);
  const busy = pending !== null;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "signup") setMode("signup");
    if (q.get("provider") === "kakao") setKakaoSignup(true);
    const kakaoFailed = q.get("error") === "kakao";
    if (kakaoFailed) window.history.replaceState(null, "", "/auth");
    setGuestData(hasGuestData());
    fetchMe(true).then((m) => {
      setMe(m);
      // 로그인 직후 뒤로 가기로 카카오 콜백에 다시 들르면 서버는 실패로 돌려보내지만, 이미 로그인돼 있으면 실패가 아니다
      if (kakaoFailed && !m.user) setError("카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.");
    });
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

  const adoptGuest = guestData && (adoptChoice ?? mode === "signup");
  const submit = () => run("submit", async () => {
    if (kakaoSignup || (mode === "signup" && !passwordsMatch)) return;
    if (mode === "signup" && !termsAccepted) {
      setError("이용약관·개인정보 처리방침 동의와 만 14세 이상 확인이 필요해요.");
      return;
    }
    const result = mode === "signup"
      ? await signUp(email, nick, password, { signupConsentVersion: POLICY_VERSION, aiDisclosureAccepted: consent.ai }, { adoptGuest })
      : await signIn(email, password, { adoptGuest });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigatingRef.current = true;
    router.push(afterLogin());
  });

  const back = <Link href="/settings" className="icon-btn" aria-label="설정으로"><IconChevronL /></Link>;
  /** 로그인 뒤 갈 곳: ?next= 는 정해 둔 값만 받는다 (delete → 계정 삭제, me → 나 화면) */
  const afterLogin = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    return next === "delete" ? "/account-deletion" : next === "me" ? "/me" : next === "points" ? "/points" : next === "fund" ? "/fund" : "/";
  };

  /** 미니앱: 토스 로그인만. 처음이면 서버가 동의를 요구하고, 동의를 저장한 뒤 한 번 더 부른다 */
  const tossStart = () => run("toss", async () => {
    if (tossSignup) {
      if (!termsAccepted || !policy) return;
      setPolicy(await acceptPolicyConsent({ signupConsentVersion: POLICY_VERSION, aiDisclosureAccepted: consent.ai, expectedUserId: policy.userId }));
    }
    const result = await signInWithToss({ adoptGuest });
    if (!result.ok) {
      if (result.consentRequired && !tossSignup) setTossSignup(true);
      else setError(result.error);
      return;
    }
    navigatingRef.current = true;
    router.push(afterLogin());
  });

  if (!me) return <><TopBar title="계정" right={back} /><div className="screen" role="status" aria-label="계정을 확인하고 있어요"><SkeletonCard lines={2} head /><div style={{ height: 16 }} /><SkeletonCard lines={3} /></div></>;

  if (!me.configured) return <><TopBar title="계정" right={back} /><div className="screen"><Empty icon={<IconUser />} title="계정을 준비하고 있어요" action={<button type="button" className="btn ghost" disabled={busy} onClick={() => run("submit", async () => { setMe(await fetchMe(true)); })}>{busy ? "확인 중…" : "다시 확인"}</button>}>잠시 후 다시 연결해 주세요.</Empty></div></>;

  if (me.user) {
    const user = me.user;
    return <>
      <TopBar title="계정" right={back} />
      <div className="screen">
        <section className={`card ${styles.accountCard}`}>
          <span className={styles.accountAvatar} aria-hidden="true">{user.nick.slice(0, 1)}</span>
          <div><h2>{user.nick}</h2><p>{user.email ?? (IS_AIT ? "토스로 연결된 계정" : "카카오로 연결된 계정")}</p><p>{fmtDate(todayKey(new Date(user.createdAt)), false)}부터 함께했어요</p></div>
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
        {/* 차단한 사용자·서비스 안내·관리자 화면은 설정(/settings)으로 옮겼다 */}
        <p className={styles.mutedNote}>로그인한 기록은 다른 기기에서도 이어서 볼 수 있어요. 계정 및 데이터 삭제는 <Link href="/info">서비스 안내</Link>에서.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={`btn ghost block ${styles.logout}`} disabled={busy} onClick={() => run("logout", async () => { await signOut(); navigatingRef.current = true; router.push("/"); })}>{pending === "logout" ? "로그아웃 중…" : "로그아웃"}</button>
        <p className={styles.mutedNote}>로그아웃하면 이 기기에 저장된 내 기록 사본도 지워요. 서버에 보관된 기록은 다시 로그인하면 볼 수 있어요.</p>
      </div>
    </>;
  }

  // 미니앱은 토스 로그인 외 로그인 방식을 둘 수 없다. 첫 화면에 서비스 소개를 보여 주고, 로그인 창을 저절로 띄우지 않는다 (출시 체크리스트)
  if (IS_AIT) return <>
    <TopBar title="소로우" right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
    <div className="screen">
      <section className={styles.intro}>
        <div className={styles.brandMark} aria-hidden="true" />
        <h2>마음을 기록하고,<br />익명으로 위로를 나눠요.</h2>
        <p>{tossSignup ? "토스로 처음 오셨네요. 가입 안내를 확인해 주세요." : "하루의 마음을 적으면 흐름을 보여 주고, 털어놓은 고민에는 다른 사람들이 위로를 남겨요. 토스로 시작하면 기록을 보관하고 다른 기기에서도 이어서 볼 수 있어요."}</p>
      </section>
      {guestData && <GuestImportChoice checked={adoptGuest} onChange={setAdoptChoice} disabled={busy} />}
      {tossSignup && <SignupConsent value={consent} onChange={setConsent} disabled={busy} note="토스에서는 사용자를 구분하는 값만 받고, 이름·연락처 같은 정보는 받지 않아요. 입력하는 내용에 민감한 정보가 포함되지 않도록 확인해 주세요." />}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!me.toss && <p className={styles.mutedNote} role="status">지금은 토스 로그인을 준비하고 있어요. 잠시 후 다시 시도해 주세요.</p>}
      <button type="button" className="btn block" disabled={busy || !me.toss || (tossSignup && (!termsAccepted || !policy))} aria-busy={pending === "toss"} onClick={tossStart}>
        {pending === "toss" ? "토스로 연결 중…" : tossSignup ? "동의하고 토스로 시작하기" : "토스로 시작하기"}
      </button>
      <p className={styles.mutedNote}>로그인하지 않아도 기록은 이 기기에 저장돼요.</p>
      <nav className={styles.support} aria-label="서비스 안내"><Link href="/info">서비스 안내와 개인정보 보호<IconChevronR /></Link></nav>
    </div>
  </>;

  return <>
    <TopBar title="소로우" right={<Link href="/" className="icon-btn" aria-label="홈으로"><IconChevronL /></Link>} />
    <div className="screen">
      <section className={styles.intro}>
        <div className={styles.brandMark} aria-hidden="true" />
        <h2>{mode === "signup" ? <>당신의 하루를<br />함께 기록해요.</> : <>다시 만나서 반가워요.<br />오늘도, 소로우.</>}</h2>
        <p>{mode === "signup" ? (kakaoSignup ? "카카오로 처음 방문하셨네요. 가입 안내를 확인해 주세요." : "이 기기에 쓴 기록도 새 계정으로 옮길 수 있어요.") : "소중한 기록과 나를 위한 작은 위로를 이어가요."}</p>
      </section>
      <Segmented value={mode} onChange={(value) => {
        if (busy) return;
        if (value !== mode) setConfirmPassword("");
        setMode(value);
        setKakaoSignup(false);
        setError(null);
      }} options={[{ value: "login", label: "로그인" }, { value: "signup", label: "회원가입" }]} />
      <form className={`stack ${styles.form}`} onSubmit={(e) => { e.preventDefault(); submit(); }} aria-busy={pending === "submit"}>
        <fieldset disabled={busy}>
          {!kakaoSignup && <>
          <div className="field"><label htmlFor="auth-email">이메일</label><input id="auth-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 주소" required /></div>
          {mode === "signup" && <div className="field"><label htmlFor="auth-nick">닉네임</label><input id="auth-nick" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" placeholder="나를 부를 이름, 2~12자" minLength={2} maxLength={12} required /></div>}
          <div className="field"><label htmlFor="auth-password">비밀번호</label><input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상 입력해 주세요" minLength={mode === "signup" ? 6 : undefined} required /></div>
          {mode === "signup" && <div className="field">
            <label htmlFor="auth-confirm-password">비밀번호 확인</label>
            <input id="auth-confirm-password" type="password" autoComplete="new-password" required
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호를 한 번 더 입력해 주세요"
              aria-invalid={passwordMismatch} aria-describedby={passwordMismatch ? "auth-password-mismatch" : undefined} />
            {passwordMismatch && <p id="auth-password-mismatch" className={styles.error} role="status">비밀번호가 일치하지 않아요.</p>}
          </div>}
          </>}
          {guestData && <GuestImportChoice checked={adoptGuest} onChange={setAdoptChoice} />}
          {mode === "signup" && <SignupConsent value={consent} onChange={setConsent} note="계정 정보는 가입과 로그인에 사용해요. 로그인하면 기록을 보관하고 다른 기기에서도 이어서 볼 수 있어요. 입력하는 내용에 민감한 정보가 포함되지 않도록 확인해 주세요." />}
        </fieldset>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!kakaoSignup && <button type="submit" className="btn block" disabled={busy || (mode === "signup" && (!termsAccepted || !passwordsMatch))}>{pending === "submit" ? (mode === "signup" ? "가입하는 중…" : "로그인하는 중…") : mode === "signup" ? "동의하고 가입하기" : "로그인"}</button>}
      </form>
      {me.kakao && <>
        {!kakaoSignup && <div className="or-line"><span>또는</span></div>}
        <button type="button" className="btn block kakao" disabled={busy || (mode === "signup" && (!termsAccepted || !policy))} onClick={() => run("kakao", async () => {
          if (mode === "signup") {
            if (!termsAccepted || !policy) return;
            const saved = await acceptPolicyConsent({ signupConsentVersion: POLICY_VERSION, aiDisclosureAccepted: consent.ai, expectedUserId: policy.userId });
            setPolicy(saved);
          }
          navigatingRef.current = true;
          const next = afterLogin();
          startKakaoLogin({ adoptGuest, returnTo: next === "/" ? undefined : next });
        })}><IconKakao />{pending === "kakao" ? "카카오로 연결 중…" : mode === "signup" ? "동의하고 카카오로 가입하기" : "카카오로 로그인"}</button>
        <p className={styles.mutedNote}>{mode === "signup" ? "동의한 내용은 가입 정보와 함께 저장해요." : "처음 이용하는 경우 가입 안내를 확인한 뒤 시작해요."}</p>
      </>}
      <nav className={styles.support} aria-label="서비스 안내"><Link href="/info">서비스 안내와 개인정보 보호<IconChevronR /></Link></nav>
    </div>
  </>;
}
