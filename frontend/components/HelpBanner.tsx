import { HELP_LINES } from "@/lib/crisis";

function Lines() {
  return (
    <div className="help-lines">
      {HELP_LINES.map((h) => (
        <span key={h.tel}>
          {h.name} <a href={`tel:${h.tel}`}>{h.tel}</a> <span className="muted">· {h.desc}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * 도움 연락처. 평소에는 화면 맨 아래 접힌 한 줄(누르면 펼침),
 * 글에서 위험 신호가 보이면(alert) 안전을 위해 그 자리에 펼친 채로 보여 준다.
 */
export default function HelpBanner({ alert = false }: { alert?: boolean }) {
  if (alert) {
    return (
      <aside className="help alert" role="alert">
        <div>
          <b>오늘 기록에서 많이 힘든 마음이 느껴져요.</b> 혼자 견디지 않아도 괜찮아요. 지금 바로 이야기할 수 있는 곳이 있어요.
        </div>
        <Lines />
      </aside>
    );
  }
  return (
    <details className="help-fold">
      <summary>도움이 필요할 때</summary>
      <aside className="help">
        <div>마음이 너무 무거운 날엔 혼자 견디지 말고 연락해요.</div>
        <Lines />
      </aside>
    </details>
  );
}
