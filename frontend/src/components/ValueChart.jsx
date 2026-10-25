import React from 'react';
import { nearestSample } from '../diagnostics.js';

const WIDTH = 720;
const HEIGHT = 260;
const PLOT = { left: 68, right: 18, top: 12, bottom: 42 };
const COLORS = ['#56a8ff', '#ffb454', '#62d3a3', '#c78cff'];

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

export function ValueChart({
  title,
  unit,
  series,
  timeRange = 60,
  endAt = Date.now(),
  cursorRatio,
  onCursorChange,
}) {
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const startAt = endAt - timeRange * 1000;
  const visibleSeries = series.map((item) => ({
    ...item,
    values: item.values.filter((point) => point.at >= startAt && point.at <= endAt),
  }));
  const allValues = visibleSeries.flatMap((item) => item.values.map((point) => point.value));
  const { min, max } = axisBounds(allValues);
  const y = (value) => PLOT.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
  const x = (timestamp) => PLOT.left + ((timestamp - startAt) / (timeRange * 1000)) * plotWidth;
  const yTicks = Array.from({ length: 5 }, (_, index) => min + (max - min) * (index / 4));
  const timeTicks = Array.from({ length: 5 }, (_, index) => timeRange * index / 4);
  const hasPoints = allValues.length > 0;
  const cursorVisible = cursorRatio != null;
  const cursorAt = cursorVisible
    ? startAt + cursorRatio * timeRange * 1000
    : null;

  function moveCursor(event) {
    if (!onCursorChange) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - bounds.left) / bounds.width * WIDTH;
    const ratio = Math.max(0, Math.min(1, (svgX - PLOT.left) / plotWidth));
    onCursorChange(ratio);
  }

  return <section className="chart panel" onPointerLeave={() => onCursorChange?.(null)}>
    <div className="line chart-heading">
      <div>
        <div className="tag">{title}</div>
        <div className="muted">Останні {timeRange < 60 ? `${timeRange} с` : `${timeRange / 60} хв`} · 5 вимірювань/с · {unit}</div>
      </div>
    </div>
    <svg
      className="chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${title}, значення ${unit} за останні ${timeRange} секунд`}
      onPointerMove={moveCursor}
    >
      {yTicks.map((tick, index) => {
        const lineY = y(tick);
        return <g key={`y-${index}`}>
          <line x1={PLOT.left} y1={lineY} x2={WIDTH - PLOT.right} y2={lineY} className="gridline" />
          <text x={PLOT.left - 10} y={lineY + 4} className="axis-label y-label" textAnchor="end">{formatTick(tick)}</text>
        </g>;
      })}
      {timeTicks.map((offset, index) => {
        const tickX = PLOT.left + (offset / timeRange) * plotWidth;
        const secondsAgo = Math.round(timeRange - offset);
        const tickLabel = secondsAgo === 0
          ? 'Зараз'
          : secondsAgo >= 60
            ? `−${Math.round(secondsAgo / 60)} хв`
            : `−${secondsAgo} с`;
        return <g key={`x-${index}`}>
          <line x1={tickX} y1={PLOT.top + plotHeight} x2={tickX} y2={PLOT.top + plotHeight + 5} className="axis-tick" />
          <text x={tickX} y={HEIGHT - 9} className="axis-label x-label" textAnchor="middle">
            {tickLabel}
          </text>
        </g>;
      })}
      <line x1={PLOT.left} y1={PLOT.top} x2={PLOT.left} y2={PLOT.top + plotHeight} className="axis-line" />
      <line x1={PLOT.left} y1={PLOT.top + plotHeight} x2={WIDTH - PLOT.right} y2={PLOT.top + plotHeight} className="axis-line" />
      {visibleSeries.map((item, index) => {
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
      {cursorVisible && <line
        x1={x(cursorAt)}
        y1={PLOT.top}
        x2={x(cursorAt)}
        y2={PLOT.top + plotHeight}
        className="crosshair"
      />}
      {visibleSeries.map((item, index) => {
        if (!item.values.length) return null;
        const cursorPoint = cursorVisible ? nearestSample(item.values, cursorAt) : null;
        if (!cursorPoint) return null;
        const pointX = cursorPoint ? x(cursorPoint.at) : 0;
        const pointY = cursorPoint ? y(cursorPoint.value) : 0;
        const labelX = pointX > WIDTH - 120 ? pointX - 8 : pointX + 8;
        const labelY = Math.max(
          PLOT.top + 12,
          Math.min(PLOT.top + plotHeight - 4, pointY - 9 - index * 12)
        );
        return <g key={`cursor-${item.name}`}>
          <circle
            cx={pointX}
            cy={pointY}
            r="4"
            fill={COLORS[index % COLORS.length]}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor={pointX > WIDTH - 120 ? 'end' : 'start'}
            className="crosshair-value"
            fill={COLORS[index % COLORS.length]}
          >{cursorPoint.value.toFixed(3)}</text>
        </g>;
      })}
    </svg>
    {!hasPoints && <p className="muted chart-empty">Очікування даних телеметрії…</p>}
    <div className="legend">{visibleSeries.map((item, index) => {
      const value = item.values.at(-1)?.value;
      return <span key={item.name} style={{ color: COLORS[index % COLORS.length] }}>
        {item.name}: {value === undefined ? '—' : Number(value).toFixed(2)}
      </span>;
    })}</div>
  </section>;
}
