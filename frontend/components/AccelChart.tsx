"use client";

import type { Point } from "@/lib/accel";

interface Props {
  points: Point[];
  color: string;
}

const W = 480;
const PAD_L = 30;
const PAD_R = 8;
const LEVEL_H = 110;
const ACCEL_H = 120;
const GAP = 22;
const LABEL_H = 18;
const H = LEVEL_H + GAP + ACCEL_H + LABEL_H;

/**
 * 위: 위치(그날 점수) 라인 / 아래: 가속도(직전 대비 변화) 막대.
 * 같은 데이터를 두 관점으로 나눠 보여줘서 "변화"가 눈에 먼저 들어오게.
 */
export default function AccelChart({ points, color }: Props) {
  const n = points.length;
  const innerW = W - PAD_L - PAD_R;
  const step = innerW / Math.max(n, 1);
  const x = (i: number) => PAD_L + step * i + step / 2;

  // 위치: -5 ~ +5
  const yLevel = (v: number) => 24 + ((5 - v) / 10) * (LEVEL_H - 32);
  // 가속도: 실제 데이터 범위에 맞춰 대칭 스케일 (최소 ±3)
  const maxA = Math.max(3, ...points.map((p) => Math.abs(p.accel ?? 0)));
  const accelTop = LEVEL_H + GAP;
  const accelMid = accelTop + ACCEL_H / 2;
  const aScale = (ACCEL_H / 2 - 6) / maxA;

  const linePts = points
    .map((p, i) => (p.level === null ? null : `${x(i)},${yLevel(p.level)}`))
    .filter(Boolean) as string[];

  const barW = Math.max(4, Math.min(22, step * 0.55));
  const labelEvery = n > 14 ? Math.ceil(n / 7) : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="점수와 가속도 그래프">
      {/* 위치 영역 */}
      <text x={0} y={12} fontSize={12} fill="var(--text-2)">위치</text>
      <line x1={PAD_L} x2={W - PAD_R} y1={yLevel(0)} y2={yLevel(0)} stroke="var(--border)" strokeDasharray="3 4" />
      {[5, -5].map((v) => (
        <text key={v} x={PAD_L - 6} y={yLevel(v) + 4} fontSize={11} fill="var(--text-2)" textAnchor="end">
          {v > 0 ? `+${v}` : v}
        </text>
      ))}
      {linePts.length > 1 && (
        <polyline points={linePts.join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((p, i) =>
        p.level === null ? null : (
          <circle key={`l${i}`} cx={x(i)} cy={yLevel(p.level)} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2}>
            <title>{`${p.date} · 점수 ${p.level}`}</title>
          </circle>
        )
      )}

      {/* 가속도 영역 */}
      <text x={0} y={accelTop + 2} fontSize={12} fill="var(--text-2)">변화</text>
      <line x1={PAD_L} x2={W - PAD_R} y1={accelMid} y2={accelMid} stroke="var(--zero)" />
      {points.map((p, i) => {
        if (p.accel === null) return null;
        const h = Math.abs(p.accel) * aScale;
        const up = p.accel >= 0;
        if (p.accel === 0) {
          return <circle key={`a${i}`} cx={x(i)} cy={accelMid} r={2.5} fill="var(--zero)"><title>{`${p.date} · 변화 없음`}</title></circle>;
        }
        return (
          <rect
            key={`a${i}`}
            x={x(i) - barW / 2}
            y={up ? accelMid - h : accelMid}
            width={barW}
            height={Math.max(h, 2)}
            rx={3}
            fill={up ? "var(--up)" : "var(--down)"}
          >
            <title>{`${p.date} · 변화 ${up ? "+" : ""}${p.accel}`}</title>
          </rect>
        );
      })}

      {/* 날짜 라벨 */}
      {points.map((p, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text key={`d${i}`} x={x(i)} y={H - 4} fontSize={11} fill="var(--text-2)" textAnchor="middle">
            {p.date.slice(5).replace("-", "/")}
          </text>
        ) : null
      )}
    </svg>
  );
}
