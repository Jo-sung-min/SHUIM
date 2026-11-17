"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmSheet, Sheet } from "@/components/ui";
import { SafetyReportSheet } from "@/components/SafetyReport";
import { IconFlag, IconLock, IconSparkle } from "@/components/Icons";
import { setUserBlocked } from "@/lib/safety";
import styles from "./PersonSafety.module.css";

/** 공간에서 고른 사람 (RemotePlayer 의 일부) 과, 그 사람이 지금 띄워 둔 풍등 소원 */
export interface SpaceSafetyTarget { id: string; pid: string; nick: string; wishes: { id: string; wish: string }[] }

type Step = "menu" | "report" | "wish" | "block";

/**
 * 3D 공간 안에서 상대를 신고·차단한다 (Play 사용자 제작 콘텐츠 정책: 앱 안 신고와 사용자 차단).
 *  - 신고: /api/safety-reports {kind:"user"} · 풍등 소원은 {kind:"space", targetId:"lantern:<id>"} 에 문구를 함께 적어 보낸다
 *    (소원은 40초 뒤 사라져 운영팀이 다시 볼 수 없다)
 *  - 차단: 기존 /api/blocks. 성공하면 onBlocked 로 이번 방문에서 바로 가리고 다시 들어가 서버에도 반영한다
 */
export default function PersonSafetySheet({ target, onClose, onBlocked }: {
  target: SpaceSafetyTarget; onClose: () => void; onBlocked: (target: SpaceSafetyTarget) => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [wish, setWish] = useState<{ id: string; wish: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const block = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await setUserBlocked(target.id, true);
      onBlocked(target);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "Error" ? cause.message : "차단하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setStep("menu");
    } finally { setBusy(false); }
  };

  return createPortal(<div className={styles.scope}>
    <Sheet open={step === "menu"} onClose={onClose} title={`${target.nick}님`}>
      <div className={styles.list} role="group" aria-label={`${target.nick}님에 대해`}>
        <button type="button" className={styles.row} aria-haspopup="dialog" onClick={() => { setError(""); setStep("report"); }}>
          <IconFlag /><span>신고하기<small>불쾌한 행동이나 이름을 운영팀에 알려요.</small></span>
        </button>
        <button type="button" className={`${styles.row} ${styles.danger}`} aria-haspopup="dialog" disabled={busy} onClick={() => { setError(""); setStep("block"); }}>
          <IconLock /><span>차단하기<small>지금부터 서로 보이지 않고, 글과 메시지도 가려져요.</small></span>
        </button>
      </div>
      {target.wishes.length > 0 && <div className={styles.wishes}>
        <h4>지금 띄운 풍등 소원</h4>
        <div className={styles.list}>
          {target.wishes.map(item => <button key={item.id} type="button" className={styles.row} aria-haspopup="dialog"
            onClick={() => { setWish(item); setStep("wish"); }}>
            <IconSparkle /><span>이 소원 신고하기<small>“{item.wish}”</small></span>
          </button>)}
        </div>
      </div>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      <p className={styles.note}>차단은 나 › 차단한 사용자에서 언제든 풀 수 있어요.</p>
    </Sheet>
    <SafetyReportSheet open={step === "report"} onClose={() => setStep("menu")} onSubmitted={onClose}
      kind="user" targetId={target.id} title={`${target.nick}님 신고`} />
    <SafetyReportSheet open={step === "wish" && wish !== null} onClose={() => setStep("menu")} onSubmitted={onClose}
      kind="space" targetId={wish ? `lantern:${wish.id}` : undefined} title="풍등 소원 신고"
      initialDetail={wish ? `소원 문구: “${wish.wish}” (${target.nick}님)\n신고 이유: ` : ""} />
    <ConfirmSheet open={step === "block"} title={`${target.nick}님을 차단할까요?`}
      message="이 공간과 다음 방문에서 서로 보이지 않고, 글과 메시지도 가려져요. 나 › 차단한 사용자에서 다시 풀 수 있어요."
      confirmLabel="차단하기" danger busy={busy} onClose={() => setStep("menu")} onConfirm={() => void block()} />
  </div>, document.body);
}
