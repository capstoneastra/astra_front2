import type { SimulationChartData } from "../../services/simulationService";

export default function SimulationChart({ chart }: { chart: SimulationChartData }) {
  const points = chart.series.filter(
    (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
  );
  if (!points.length) return <p>표시할 그래프 데이터가 없습니다.</p>;
  const minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0])),
    minY = Math.min(0, ...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1]));
  const x = (v) => 60 + ((v - minX) / (maxX - minX || 1)) * 540,
    y = (v) => 230 - ((v - minY) / (maxY - minY || 1)) * 190;
  return (
    <svg
      viewBox="0 0 640 290"
      role="img"
      aria-label={`DEMO 그래프: ${chart.xLabel}, ${chart.yLabel}`}
      style={{ width: "100%", maxHeight: 340, display: "block" }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <path d={`M60 ${40 + i * 47.5}H600`} stroke="var(--border)" />
          <text
            x="54"
            y={44 + i * 47.5}
            fill="var(--text-secondary)"
            fontSize="10"
            textAnchor="end"
          >
            {(maxY - ((maxY - minY) * i) / 4).toPrecision(3)}
          </text>
        </g>
      ))}
      <path d="M60 40V230H600" fill="none" stroke="var(--text-secondary)" />
      <polyline
        points={points.map(([a, b]) => `${x(a)},${y(b)}`).join(" ")}
        fill="none"
        stroke="var(--cyan)"
        strokeWidth="2.5"
      />
      <text x="60" y="249" fill="var(--text-secondary)" fontSize="11">
        {minX.toPrecision(3)}
      </text>
      <text
        x="600"
        y="249"
        fill="var(--text-secondary)"
        fontSize="11"
        textAnchor="end"
      >
        {maxX.toPrecision(3)}
      </text>
      <text
        x="330"
        y="275"
        fill="var(--text-secondary)"
        fontSize="12"
        textAnchor="middle"
      >
        {chart.xLabel}
      </text>
      <text x="65" y="23" fill="var(--text-secondary)" fontSize="12">
        {chart.yLabel} (참고용)
      </text>
    </svg>
  );
}
