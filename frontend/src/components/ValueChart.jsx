import React from 'react';

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
  cursorAt,
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
  const cursorVisible = cursorAt != null && cursorAt >= startAt && cursorAt <= endAt;
  const cursorPoints = visibleSeries.map((item) => {
    const nearest = item.values.reduce((best, point) =>
      !best || Math.abs(point.at - cursorAt) < Math.abs(best.at - cursorAt) ? point : best
    , null);
    return { name: item.name, point: nearest };
  });

  function moveCursor(event) {
    if (!onCursorChange) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = (event.clientX - bounds.left) / bounds.width * WIDTH;
    const ratio = Math.max(0, Math.min(1, (svgX - PLOT.left) / plotWidth));
    onCursorChange(startAt + ratio * timeRange * 1000);
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
        const cursorPoint = cursorVisible
          ? item.values.reduce((best, point) =>
            !best || Math.abs(point.at - cursorAt) < Math.abs(best.at - cursorAt) ? point : best
          , null)
          : null;
        return <g key={item.name}>
          <polyline
            points={coordinates}
            fill="none"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          {cursorPoint && <circle
            cx={x(cursorPoint.at)}
            cy={y(cursorPoint.value)}
            r="4"
            fill={COLORS[index % COLORS.length]}
            vectorEffect="non-scaling-stroke"
          />}
        </g>;
      })}
      {cursorVisible && <line
        x1={x(cursorAt)}
        y1={PLOT.top}
        x2={x(cursorAt)}
        y2={PLOT.top + plotHeight}
        className="crosshair"
      />}
    </svg>
    {cursorVisible && <div className="chart-tooltip">
      <strong>{new Date(cursorAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}</strong>
      {cursorPoints.map(({ name, point }, index) =>
        <span key={name} style={{ color: COLORS[index % COLORS.length] }}>
          {name}: {point ? `${point.value.toFixed(3)} ${unit}` : 'немає даних'}
        </span>
      )}
    </div>}
    {!hasPoints && <p className="muted chart-empty">Очікування даних телеметрії…</p>}
    <div className="legend">{visibleSeries.map((item, index) => {
      const value = item.values.at(-1)?.value;
      return <span key={item.name} style={{ color: COLORS[index % COLORS.length] }}>
        {item.name}: {value === undefined ? '—' : Number(value).toFixed(2)}
      </span>;
    })}</div>
  </section>;
}
