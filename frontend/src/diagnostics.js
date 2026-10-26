export const MAX_SAMPLES = 4500;

export function appendSample(previous, name, value, at = Date.now()) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return previous;
  const values = [...(previous[name] || []), { at, value }].slice(-MAX_SAMPLES);
  return { ...previous, [name]: values };
}

export function isFresh(item, maxAgeSeconds = 2) {
  return item && Number.isFinite(item.age_seconds) && item.age_seconds <= maxAgeSeconds;
}

export function telemetrySample(item, value, previousAt = -Infinity) {
  if (!isFresh(item) || !Number.isFinite(value)) return null;
  const at = Date.parse(item.received_at);
  if (!Number.isFinite(at) || at <= previousAt) return null;
  return { at, value };
}

export function chartEndAt(paused, pausedAt, now = Date.now()) {
  return paused && Number.isFinite(pausedAt) ? pausedAt : now;
}

export function nearestSample(values, at) {
  return values.reduce((nearest, point) =>
    !nearest || Math.abs(point.at - at) < Math.abs(nearest.at - at) ? point : nearest
  , null);
}
