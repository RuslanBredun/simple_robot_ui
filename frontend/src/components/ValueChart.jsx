import React from 'react';

const WIDTH = 720;
const HEIGHT = 260;
const PLOT = { left: 68, right: 18, top: 12, bottom: 42 };
const COLORS = ['#56a8ff', '#ffb454', '#62d3a3', '#c78cff'];
const X_TICKS = [60, 45, 30, 15, 0];

function axisBounds(values) {
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    min -= padding;
    max += padding;
  } else {
    const padding = (max - min) * 0.12;
    min -= padding;
    max += padding;
  }
  return { min, max };
}

function formatTick(value) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function ValueChart({ title, unit, series }) {
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const allValues = series.flatMap((item) => item.values.map((point) => point.value));
  const { min, max } = axisBounds(allValues);
  const y = (value) => PLOT.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
  const now = Date.now();
  const x = (timestamp) => PLOT.left + Math.max(0, Math.min(60, (timestamp - now) / 1000 + 60)) / 60 * plotWidth;
  const yTicks = Array.from({ length: 5 }, (_, index) => min + (max - min) * (index / 4));
  const hasPoints = allValues.length > 0;

  return <section className="chart panel">
    <div className="line chart-heading">
      <div>
        <div className="tag">{title}</div>
        <div className="muted">Останні 60 секунд · 5 вимірювань/с · {unit}</div>
      </div>
    </div>
    <svg
      className="chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${title}, шкала значень ${unit}, час за останні 60 секунд`}
    >
      {yTicks.map((tick, index) => {
        const lineY = y(tick);
        return <g key={`y-${index}`}>
          <line x1={PLOT.left} y1={lineY} x2={WIDTH - PLOT.right} y2={lineY} className="gridline" />
          <text x={PLOT.left - 10} y={lineY + 4} className="axis-label y-label" textAnchor="end">{formatTick(tick)}</text>
        </g>;
      })}
      {X_TICKS.map((tick) => {
        const tickX = PLOT.left + ((60 - tick) / 60) * plotWidth;
        return <g key={`x-${tick}`}>
          <line x1={tickX} y1={PLOT.top + plotHeight} x2={tickX} y2={PLOT.top + plotHeight + 5} className="axis-tick" />
          <text x={tickX} y={HEIGHT - 9} className="axis-label x-label" textAnchor="middle">
            {tick === 0 ? 'Зараз' : `−${tick} с`}
          </text>
        </g>;
      })}
      <line x1={PLOT.left} y1={PLOT.top} x2={PLOT.left} y2={PLOT.top + plotHeight} className="axis-line" />
      <line x1={PLOT.left} y1={PLOT.top + plotHeight} x2={WIDTH - PLOT.right} y2={PLOT.top + plotHeight} className="axis-line" />
      {series.map((item, index) => {
        if (!item.values.length) return null;
        const coordinates = item.values.map((point) =>
          `${x(point.at)},${y(point.value)}`
        ).join(' ');
        return <polyline
          key={item.name}
          points={coordinates}
          fill="none"
          stroke={COLORS[index % COLORS.length]}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />;
      })}
    </svg>
    {!hasPoints && <p className="muted chart-empty">Очікування даних телеметрії…</p>}
    <div className="legend">{series.map((item, index) => {
      const value = item.values.at(-1)?.value;
      return <span key={item.name} style={{ color: COLORS[index % COLORS.length] }}>
        {item.name}: {value === undefined ? '—' : Number(value).toFixed(2)}
      </span>;
    })}</div>
  </section>;
}
