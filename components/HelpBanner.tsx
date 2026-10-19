import { HELP_LINES } from "@/lib/crisis";

export default function HelpBanner({ alert = false }: { alert?: boolean }) {
  return (
    <aside className={`help ${alert ? "alert" : ""}`} role={alert ? "alert" : undefined}>
      {alert ? (
        <div>
          <b>오늘 기록에서 많이 힘든 마음이 느껴져요.</b> 혼자 견디지 않아도 괜찮아요. 지금 바로 이야기할 수 있는 곳이 있어요.
        </div>
      ) : (
        <div>마음이 너무 무거운 날엔 혼자 견디지 말고 연락해요.</div>
      )}
      <div className="help-lines">
        {HELP_LINES.map((h) => (
          <span key={h.tel}>
            {h.name} <a href={`tel:${h.tel}`}>{h.tel}</a> <span className="muted">· {h.desc}</span>
          </span>
        ))}
      </div>
    </aside>
  );
}
