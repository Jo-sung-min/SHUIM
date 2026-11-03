"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/components/ui";
import { IS_AIT } from "@/lib/ait";
import { buyFirePop, getFireCatalog, getFireOrders, restoreFirePops, FirePurchaseError, type FireCatalog, type PurchaseReceipt } from "@/lib/beach/fire-commerce";
import type { FireState, PopColor } from "@/lib/beach/net";
import styles from "./CampfireControls.module.css";

const POPS: { color: PopColor; name: string; note: string; colors: [string, string] }[] = [
  { color: "rose", name: "로즈빛", note: "따뜻한 장밋빛 저녁", colors: ["#ff779e", "#ffdc96"] },
  { color: "aurora", name: "오로라", note: "민트빛으로 흐르는 밤", colors: ["#62e0b4", "#a59bff"] },
  { color: "ocean", name: "블루 웨이브", note: "바다를 닮은 푸른 불꽃", colors: ["#64c9f5", "#e0fcff"] },
  { color: "violet", name: "라벤더", note: "보랏빛으로 쉬어가는 시간", colors: ["#bf91f5", "#ffc5dd"] },
];

function FlameIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13.2 2.8c.6 4.4-4 5.3-3.6 8.5-1.2-.6-1.9-1.7-2.1-3C3.5 12.3 4 20.6 11.9 21c7.5.4 10-7.4 5.4-12.2.2 2-1 3-1.9 3.3.8-3.8-.3-7.2-2.2-9.3Z" fill="currentColor"/><path d="M12.5 12.6c.3 2.3-2 2.8-1.8 4.5-.6-.3-1-.8-1.1-1.5-2 2.3-.6 4.1 2.3 4.3 3.1.1 3.7-3.4 1.7-5.3.1.9-.3 1.4-.7 1.5.4-1.8.1-2.5-.4-3.5Z" fill="#fff1cf"/></svg>;
}

function dateLabel(at: number) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}

function remaining(until: number, now: number) {
  const minutes = Math.max(0, Math.ceil((until - now) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
}

interface Props {
  communityId: string;
  communityName: string;
  userId: string;
  fire: FireState;
  near: boolean;
  disconnected: boolean;
  onAddWood: (requestId: string) => Promise<FireState>;
  onFireChange: (fire: FireState) => void;
  onOpenChange: (open: boolean) => void;
  onCheckoutChange: (active: boolean) => void;
}

export default function ArchivedFirePopControls(props: Props) {
  const { communityId, communityName, userId, fire, near, disconnected, onAddWood, onFireChange, onOpenChange, onCheckoutChange } = props;
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<PopColor>("aurora");
  const [catalog, setCatalog] = useState<FireCatalog | null>(null);
  const [orders, setOrders] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [woodBusy, setWoodBusy] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [woodNotice, setWoodNotice] = useState("");
  const alive = useRef(true);
  const woodAttempt = useRef<string | null>(null);
  const woodInFlight = useRef(false);
  const buying = useRef(false);
  const purchaseAttempt = useRef<{ color: PopColor; id: string } | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeFireRef = useRef(onFireChange);
  changeFireRef.current = onFireChange;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (cooldownTimer.current) clearTimeout(cooldownTimer.current); };
  }, []);

  const refresh = useCallback(async (recover: boolean) => {
    setLoading(true); setError("");
    try {
      const [next, purchases] = await Promise.all([getFireCatalog(communityId), getFireOrders(communityId)]);
      if (!alive.current) return;
      setCatalog(next); setOrders(purchases);
      changeFireRef.current(next.fire);
      if (recover && IS_AIT && next.available) {
        const restored = await restoreFirePops({ communityId, userId, catalog: next, orders: purchases });
        if (!alive.current) return;
        if (restored.length) {
          changeFireRef.current(restored[restored.length - 1].fire);
          setNotice("결제한 불씨팝을 다시 연결했어요.");
          setOrders(await getFireOrders(communityId));
        }
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "불씨팝을 불러오지 못했어요. 다시 시도해 주세요.");
    } finally { if (alive.current) setLoading(false); }
  }, [communityId, userId]);

  const showShop = () => { setOpen(true); onOpenChange(true); void refresh(false); };
  const closeShop = () => { if (buying.current) return; setOpen(false); onOpenChange(false); setError(""); };

  const addWood = async () => {
    if (woodInFlight.current || cooling || !near || disconnected || fire.logs >= fire.maxLogs) return;
    woodInFlight.current = true; setWoodBusy(true); setWoodNotice("");
    woodAttempt.current ??= crypto.randomUUID();
    try {
      const next = await onAddWood(woodAttempt.current);
      if (!alive.current) return;
      onFireChange(next); woodAttempt.current = null;
      setWoodNotice("장작 한 개를 넣었어요."); setCooling(true);
      cooldownTimer.current = setTimeout(() => { if (alive.current) { setCooling(false); setWoodNotice(""); } }, 3100);
    } catch (cause) {
      if (alive.current) setWoodNotice(cause instanceof Error ? cause.message : "장작을 넣지 못했어요. 다시 시도해 주세요.");
      // Preserve the request ID: a lost response must not add a second piece of wood.
    } finally { woodInFlight.current = false; if (alive.current) setWoodBusy(false); }
  };

  const purchase = async () => {
    if (buying.current || !catalog?.available || loading || disconnected) return;
    buying.current = true; setBusy(true); setError(""); setNotice("");
    if (!purchaseAttempt.current || purchaseAttempt.current.color !== chosen) purchaseAttempt.current = { color: chosen, id: crypto.randomUUID() };
    try {
      const result = await buyFirePop({ communityId, color: chosen, userId, requestId: purchaseAttempt.current.id, onCheckoutChange });
      if (!alive.current || !result) return;
      if (!result.verified) throw new Error("결제 확인이 끝나지 않았어요. 구매 내역에서 다시 확인해 주세요.");
      onFireChange(result.fire);
      setNotice(result.startsAt > result.fire.serverTime + 1000 ? `${dateLabel(result.startsAt)}부터 24시간 예약됐어요.` : "불씨팝이 켜졌어요. 지금부터 24시간 함께해요.");
      purchaseAttempt.current = null;
      setOrders(await getFireOrders(communityId));
    } catch (cause) {
      if (cause instanceof FirePurchaseError && cause.retryWithNewRequest) purchaseAttempt.current = null;
      if (alive.current) setError(cause instanceof Error ? cause.message : "결제를 마치지 못했어요. 다시 확인해 주세요.");
    } finally { buying.current = false; if (alive.current) setBusy(false); }
  };

  const active = POPS.find((pop) => pop.color === fire.color);
  const selected = POPS.find((pop) => pop.color === chosen)!;
  const now = fire.serverTime;
  const start = Math.max(now, fire.queueEndsAt ?? now);
  const paid = orders.filter((order) => order.status === "PAID" && (order.expiresAt ?? 0) > now);
  const woodLabel = woodBusy ? "장작 넣는 중…" : cooling ? "장작을 넣었어요" : fire.logs >= fire.maxLogs ? "장작이 가득해요" : "장작 넣기";

  return <>
    <div className={styles.controls}>
      <button type="button" className={styles.fireButton} onClick={showShop} aria-label={`모닥불과 불씨팝, 장작 ${fire.logs}개`}>
        <span className={styles.fireIcon}><FlameIcon /></span>
        <span><strong>{active?.name ?? "모닥불"}</strong><small>장작 {fire.logs} / {fire.maxLogs}{active && fire.colorExpiresAt ? ` · ${remaining(fire.colorExpiresAt, now)}` : " · 불씨팝"}</small></span>
      </button>
      {near && <button type="button" className={styles.woodButton} onClick={() => void addWood()} disabled={woodBusy || cooling || disconnected || fire.logs >= fire.maxLogs}>
        <span aria-hidden="true">＋</span>{woodLabel}<small>무료</small>
      </button>}
    </div>
    {woodNotice && <p className={styles.woodNotice} role="status">{woodNotice}</p>}
    {open && createPortal(<Sheet open={open} onClose={closeShop} title="모닥불 · 불씨팝">
      <div className={styles.shop}>
        <section className={styles.fuel}>
          <div><span className={styles.eyebrow}>{communityName}의 모닥불</span><h4>{fire.logs ? "장작을 더하면, 온기도 커져요" : "작은 불씨에 온기를 더해요"}</h4><p>장작은 무료예요. 10분마다 한 개씩 타들어가요.</p></div>
          <div className={styles.fuelMeter} aria-label={`장작 ${fire.logs}개, 최대 ${fire.maxLogs}개`}>{Array.from({ length: fire.maxLogs }, (_, index) => <span key={index} data-lit={index < fire.logs} />)}</div>
          <div className={styles.fuelBottom}><span>{fire.logs} / {fire.maxLogs}개</span><button type="button" onClick={() => void addWood()} disabled={!near || woodBusy || cooling || disconnected || fire.logs >= fire.maxLogs}>{near ? woodLabel : "모닥불 가까이에서 넣을 수 있어요"}</button></div>
          {woodNotice && <p role="status">{woodNotice}</p>}
        </section>

        <div className={styles.shopHeading}><span className={styles.eyebrow}>하루를 물들이는 작은 불씨</span><h4>우리의 밤에 색을 더해요</h4><p>불씨팝 1개 · 1,000원 · 사용 시작부터 24시간</p></div>
        <div className={styles.products} role="radiogroup" aria-label="불씨팝 색상">
          {POPS.map((pop) => <button type="button" key={pop.color} role="radio" aria-checked={chosen === pop.color} className={styles.product} data-selected={chosen === pop.color} disabled={busy} onClick={() => { setChosen(pop.color); setError(""); }} style={{ "--pop-a": pop.colors[0], "--pop-b": pop.colors[1] } as CSSProperties}>
            <span className={styles.popArt} aria-hidden="true"><span /><i /><FlameIcon /></span>
            <span className={styles.productName}>{pop.name}<span aria-hidden="true">{chosen === pop.color ? "✓" : "○"}</span></span>
            <small>{pop.note}</small>
          </button>)}
        </div>

        <div className={styles.orderSummary}>
          <div><span>{selected.name} 불씨팝 1개</span><strong>1,000원</strong></div>
          <p>{start > now + 1000 ? `${dateLabel(start)}부터 24시간 예약돼요.` : "결제 확인 후 이 해변에 바로 켜져요."}<br />멤버 모두에게 같은 색으로 보여요. 자동 결제는 없어요.</p>
          {start > now + 1000 && <small>먼저 구매한 불씨팝이 끝난 뒤 순서대로 켜져요. 예약 시각은 결제 완료 시 확정돼요.</small>}
          {fire.logs === 0 && <small>지금은 불씨만 남아 있어요. 장작을 넣으면 색 불꽃이 피어나요.</small>}
        </div>
        {loading && <p className={styles.status} role="status">구매 정보를 확인하고 있어요…</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.success} role="status">{notice}</p>}
        {catalog && !catalog.available && <p className={styles.status}>{catalog.reason || "불씨팝 결제를 준비하고 있어요. 장작은 지금도 무료로 넣을 수 있어요."}</p>}
        <button type="button" className={styles.buy} disabled={busy || loading || !catalog?.available || disconnected} onClick={() => void purchase()}>{busy ? "결제 확인 중…" : catalog?.available ? "1,000원 결제하기" : "불씨팝 판매 준비 중"}</button>
        <div className={styles.links}><button type="button" disabled={busy || loading} onClick={() => void refresh(true)}>구매 내역 다시 확인</button><a href="/info#info-support" target="_blank" rel="noreferrer">결제 문의</a></div>
        {paid.length > 0 && <section className={styles.purchases}><h4>내 불씨팝</h4>{paid.map((order) => <div key={order.orderId}><span><strong>{POPS.find((pop) => pop.color === order.color)?.name ?? "불씨팝"}</strong><small>{order.startsAt && order.expiresAt ? `${dateLabel(order.startsAt)} ~ ${dateLabel(order.expiresAt)}` : "사용 시간을 확인하고 있어요"}</small></span><b>{(order.startsAt ?? 0) > now ? "예약" : "사용 중"}</b></div>)}</section>}
      </div>
    </Sheet>, document.body)}
  </>;
}
