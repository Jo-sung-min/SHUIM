"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronL, IconSparkle } from "@/components/Icons";
import { POLICY_VERSION, acceptPolicyConsent, fetchPolicyConsent, type PolicyConsent } from "@/lib/safety";
import styles from "@/components/ServiceInfo.module.css";

export default function AiPreferencesPage() {
  const router = useRouter();
  const [consent, setConsent] = useState<PolicyConsent | null>(null);
  const [terms, setTerms] = useState(false);
  const [ai, setAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const saveLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await fetchPolicyConsent();
      setConsent(current);
      setTerms(current.signupAccepted);
      setAi(current.aiAccepted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "설정을 확인하지 못했어요.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next === "/" || next === "/summary") setReturnTo(next);
    void load();
  }, [load]);

  const save = async () => {
    if (saveLock.current || !terms || !consent) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await acceptPolicyConsent({ signupConsentVersion: POLICY_VERSION, aiDisclosureAccepted: ai, expectedUserId: consent.userId });
      setConsent(saved);
      if (ai && returnTo) { router.replace(returnTo); return; }
      setMessage(ai ? "AI 이용 동의를 저장했어요. 이제 요청할 때마다 다시 묻지 않아요." : "AI 이용 동의를 해제했어요. 기록과 다른 기능은 계속 사용할 수 있어요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "설정을 저장하지 못했어요.");
    } finally { saveLock.current = false; setSaving(false); }
  };

  return <>
    <header className={styles.header}>
      <Link href={returnTo ?? "/info"} className={styles.back} aria-label={returnTo ? "이전 화면으로" : "서비스 안내로"}><IconChevronL /></Link>
      <h1>AI 이용 안내</h1>
    </header>
    <main className={`${styles.main} consent-page`}>
      <div className="consent-intro">
        <span className="icon-btn" aria-hidden="true"><IconSparkle /></span>
        <h2>내 마음을 읽는 AI,<br />내가 선택하는 정보.</h2>
        <p>AI 기능을 누르면 필요한 기록을 보내 나를 돌아볼 글을 만들어요. 아래 내용을 확인하고 사용 여부를 선택해 주세요.</p>
      </div>
      <section className="card" aria-label="AI 정보 처리 안내">
        <dl className="consent-facts">
          <div><dt>어떤 정보가 전달되나요?</dt><dd>선택한 기록의 날짜·점수·메모, 관련 메모·목표·일정을 소로우가 받아 Anthropic의 AI 서비스 Claude에 전달해요. 메모 점검에는 전체 메모 중 최대 300개가 포함될 수 있어요.</dd></div>
          <div><dt>왜 사용하나요?</dt><dd>브리핑, 칭찬, 자기 돌봄, 메모 점검과 기록 흐름 정리에 사용해요. 비밀번호나 1:1 대화 내용은 현재 AI 요청에 포함하지 않아요.</dd></div>
          <div><dt>알아두면 좋아요</dt><dd>해외 AI 제공업체의 서비스를 이용해 정보를 처리해요. 답변은 틀릴 수 있으며 의료 진단·치료를 대신하지 않아요. 민감한 개인정보나 다른 사람의 개인정보는 입력하지 말아 주세요.</dd></div>
        </dl>
        <p className="consent-help">정보 처리와 보관에 관한 자세한 내용은 <Link href="/privacy#ai-processing" style={{ textDecoration: "underline" }}>개인정보 처리방침</Link>에서 확인할 수 있어요.</p>
      </section>

      {loading ? <div role="status" aria-label="이용 설정을 확인하고 있어요" style={{ display: "grid", gap: 8, padding: "16px 0" }}><div className="sk sk-block" /><div className="sk sk-block" /></div> : consent && <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {!consent.signupAccepted && <label className="consent-choice">
          <input type="checkbox" checked={terms} disabled={saving} onChange={(event) => setTerms(event.target.checked)} />
          <span><strong>[필수]</strong> <Link href="/terms">이용약관</Link>에 동의하고 <Link href="/privacy">개인정보 처리방침</Link>을 확인했어요.</span>
        </label>}
        <label className="consent-choice">
          <input type="checkbox" checked={ai} disabled={saving} onChange={(event) => { setAi(event.target.checked); setMessage(""); }} />
          <span><strong>[선택]</strong> AI 응답 생성을 위해 위의 기록을 Anthropic에 전달해 처리하는 것에 동의해요.</span>
        </label>
        <p className="consent-help">동의하지 않아도 기록과 커뮤니티를 이용할 수 있어요. 동의 후에는 AI 요청 때마다 확인창이 뜨지 않으며, 이 화면에서 언제든 해제할 수 있어요. 해제하면 이후 AI 요청부터 전송하지 않아요.</p>
        <button className="btn block" type="submit" disabled={!terms || saving} aria-busy={saving}>{saving ? "저장하는 중…" : returnTo && ai ? "동의하고 돌아가기" : "선택 저장하기"}</button>
      </form>}
      {error && <div className="inline-error" role="alert"><p>{error}</p><button className="text-btn" type="button" onClick={() => void load()} disabled={loading || saving}>설정 다시 불러오기</button></div>}
      {message && <p className="consent-status" role="status">{message}</p>}
      <Link href="/info" className="btn ghost block" style={{ marginTop: 12 }}>서비스 안내</Link>
    </main>
  </>;
}
