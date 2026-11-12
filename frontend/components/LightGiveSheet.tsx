"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CommunityStore, LIGHT_CHOICES, api, fmtLight } from "@/lib/community";
import { giftRequests } from "@/lib/light";
import type { Light } from "@/lib/use-light";
import { showToast, toastSuccess } from "@/lib/toast";
import { Sheet } from "./ui";
import { IconLight } from "./Icons";
import styles from "./Light.module.css";

/** 빛을 받을 글 (받는 사람은 서버가 글에서 찾는다. nick 은 문구용) */
export interface LightTarget { postId: string; nick: string }

/**
 * 빛 주기 시트. 1·3·5·10빛 가운데 골라 광장 글에 건넨다.
 * 잔액·하루 한도는 서버가 판단하고, 여기서는 가진 빛보다 큰 양만 미리 막는다.
 */
export default function LightGiveSheet({ target, light, onClose, onGiven }: {
  target: LightTarget | null;
  light: Light;
  onClose: () => void;
  /** 건넨 뒤의 최신 커뮤니티 상태 (순위·글의 빛이 반영돼 있다) */
  onGiven: (store: CommunityStore) => void;
}) {
  const [amount, setAmount] = useState(LIGHT_CHOICES[0]);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const requests = useMemo(() => giftRequests(), []);
  const open = Boolean(target);
  const { state, refresh } = light;
  const wallet = state.kind === "ready" ? state.wallet : null;
  const balance = wallet?.balance ?? 0;

  // 시트가 열릴 때 지갑을 읽는다 (이미 읽은 화면에서는 조용히 최신으로)
  useEffect(() => {
    if (open) void refresh(state.kind === "ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열릴 때 한 번만
  }, [open]);
  // 가진 빛보다 큰 양이 골라져 있으면 줄 수 있는 가장 큰 양으로
  useEffect(() => {
    if (!wallet || amount <= wallet.balance) return;
    const fit = [...LIGHT_CHOICES].reverse().find((n) => n <= wallet.balance);
    if (fit) setAmount(fit);
  }, [wallet, amount]);

  const give = async () => {
    if (!target || !wallet || locked.current || amount > balance) return;
    locked.current = true;
    setBusy(true);
    try {
      const store = await api.giveLight(target.postId, amount, requests.idFor(target.postId, amount));
      requests.done();
      onGiven(store);
      toastSuccess(`${target.nick} 님에게 ${fmtLight(amount)}을 건넸어요`);
      onClose();
      void refresh(true);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "잠시 후 다시 시도해요");
      void refresh(true); // 한도·잔액이 바뀌었을 수 있다
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={() => { if (!locked.current) onClose(); }} title={target ? `${target.nick} 님에게 빛 주기` : "빛 주기"}>
      {state.kind === "guest" ? (
        <>
          <p className={styles.sheetNote}>로그인하면 빛을 모으고 건넬 수 있어요.</p>
          <div className="sheet-actions">
            <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
            <Link href="/auth?next=fund" className="btn">로그인하기</Link>
          </div>
        </>
      ) : state.kind === "error" ? (
        <>
          <p className={styles.sheetNote} role="alert">{state.message}</p>
          <div className="sheet-actions">
            <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
            <button type="button" className="btn" onClick={() => void refresh()}>다시 시도</button>
          </div>
        </>
      ) : !wallet ? (
        <p className={styles.sheetNote} role="status">내 빛을 확인하고 있어요…</p>
      ) : (
        <>
          <p className={styles.sheetBalance}><IconLight aria-hidden="true" />내 빛 <b>{balance.toLocaleString("ko-KR")}</b></p>
          {balance === 0 ? (
            <>
              <p className={styles.sheetNote}>{wallet.dailyClaimed ? "오늘은 건넬 빛이 없어요. 내일 다시 받을 수 있어요." : "오늘의 빛을 먼저 받아 주세요."}</p>
              <div className="sheet-actions">
                <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
                {!wallet.dailyClaimed && (
                  <button type="button" className="btn" disabled={light.claiming} aria-busy={light.claiming} onClick={() => void light.claim()}>
                    오늘의 빛 받기 +{wallet.dailyLight}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.choices} role="radiogroup" aria-label="건넬 빛">
                {LIGHT_CHOICES.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={amount === n} className={`chip ${amount === n ? "on" : ""}`} disabled={n > balance || busy} onClick={() => setAmount(n)}>
                    {fmtLight(n)}
                  </button>
                ))}
              </div>
              <p className={styles.sheetHint}>같은 분께는 하루 {fmtLight(wallet.perPersonDaily)}까지 건넬 수 있어요.</p>
              <div className="sheet-actions">
                <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>취소</button>
                <button type="button" className="btn" disabled={busy || amount > balance} aria-busy={busy} onClick={() => void give()}>
                  {busy ? "건네는 중…" : `${fmtLight(amount)} 주기`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
