"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fetchMe } from "@/lib/auth";
import { confirmWebFirePop, type PurchaseResult } from "@/lib/beach/fire-commerce";
import styles from "./payment.module.css";

const NAMES = { rose: "로즈빛", aurora: "오로라", ocean: "블루 웨이브", violet: "라벤더" };
const when = (value: number) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);

export default function BeachPaymentPage() {
  return <Suspense fallback={<main className={styles.page}><div className={styles.card} role="status">결제 결과를 확인하고 있어요…</div></main>}><PaymentResult /></Suspense>;
}

function PaymentResult() {
  const search = useSearchParams();
  const communityId = search.get("communityId") ?? "";
  const orderId = search.get("orderId") ?? "";
  const paymentKey = search.get("paymentKey") ?? "";
  const amount = search.get("amount") ?? "";
  const failed = search.get("result") === "failed" || search.has("code");
  const cancelled = ["PAY_PROCESS_CANCELED", "USER_CANCEL"].includes(search.get("code") ?? "");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let current = true;
    setResult(null);
    setError("");
    setNeedsLogin(false);
    if (failed) {
      setError(cancelled ? "결제를 취소했어요." : "결제를 마치지 못했어요. 결제 내역을 확인한 뒤 다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    setBusy(true);
    void (async () => {
      const account = await fetchMe(true);
      if (!current) return;
      if (!account.configured) throw new Error("계정 연결을 확인하지 못했어요. 연결 상태를 확인한 뒤 다시 눌러 주세요.");
      if (!account.user) {
        if (current) setNeedsLogin(true);
        throw new Error("구매한 계정으로 로그인한 뒤 이 화면에서 다시 확인해 주세요.");
      }
      const verified = await confirmWebFirePop({ communityId, userId: account.user.id, orderId, paymentKey, amount });
      if (current) setResult(verified);
    })().catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : "결제 결과를 확인하지 못했어요. 다시 구매하지 말고 구매 내역을 확인해 주세요.");
    }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [communityId, orderId, paymentKey, amount, failed, cancelled, attempt]);

  const back = communityId ? `/beach?communityId=${encodeURIComponent(communityId)}` : "/c/home";
  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="payment-title">
      <p className={styles.eyebrow}>소로우 바닷가 · 불씨팝</p>
      <div className={`${styles.mark} ${result ? styles.confirmed : ""}`} aria-hidden="true">{result ? "✓" : busy ? "· · ·" : "↗"}</div>
      <h1 id="payment-title">{busy ? "구매를 확인하고 있어요" : result ? "구매를 확인했어요" : cancelled ? "다음에 함께해요" : "구매 확인이 필요해요"}</h1>
      <div role={error ? "alert" : "status"} aria-live="polite">
        {busy && <p className={styles.message}>결제 내역을 확인하고 있어요. 잠시만 기다려 주세요.</p>}
        {error && <p className={styles.message}>{error}</p>}
        {result && <>
          <p className={styles.message}>{NAMES[result.color]} 불씨팝을 우리 해변에서 함께 즐겨요.</p>
          <dl className={styles.receipt}>
            <div><dt>결제 금액</dt><dd>1,000원</dd></div>
            <div><dt>시작</dt><dd>{when(result.startsAt)}</dd></div>
            <div><dt>종료</dt><dd>{when(result.expiresAt)}</dd></div>
            <div><dt>이용 시간</dt><dd>24시간</dd></div>
          </dl>
          {result.startsAt > Date.now() + 60_000 && <p className={styles.note}>앞선 불씨팝이 끝나면 차례로 시작해요.</p>}
        </>}
      </div>
      <div className={styles.actions}>
        {!busy && !result && !failed && <button type="button" className={styles.primary} onClick={() => setAttempt((value) => value + 1)}>다시 확인</button>}
        {needsLogin && <a href="/auth" target="_blank" rel="noopener noreferrer" className={styles.secondary}>로그인하기</a>}
        {!busy && !result && !cancelled && <Link href="/info#info-support" className={styles.secondary}>결제 문의</Link>}
        <Link href={back} className={result ? styles.primary : styles.secondary}>바닷가로 돌아가기</Link>
      </div>
      {!busy && !result && !cancelled && <p className={styles.note}>이미 결제됐다면 다시 구매하지 말고 바닷가의 구매 내역을 확인해 주세요.</p>}
    </section>
  </main>;
}
