import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_SAMPLES,
  appendSample,
  chartEndAt,
  isFresh,
  nearestSample,
  telemetrySample,
} from './diagnostics.js';

test('chart history stores timestamped values and enforces its retention limit', () => {
  let history = {};
  for (let index = 0; index <= MAX_SAMPLES; index += 1) {
    history = appendSample(history, 'axis', index, index * 200);
  }

  assert.equal(history.axis.length, MAX_SAMPLES);
  assert.deepEqual(history.axis[0], { at: 200, value: 1 });
  assert.deepEqual(history.axis.at(-1), { at: MAX_SAMPLES * 200, value: MAX_SAMPLES });
});

test('invalid chart samples do not alter history', () => {
  const history = { axis: [{ at: 100, value: 1 }] };

  assert.equal(appendSample(history, 'axis', Number.NaN, 200), history);
});

test('chart pause holds the time window but hover does not freeze its end', () => {
  assert.equal(chartEndAt(true, 1000, 1200), 1000);
  assert.equal(chartEndAt(false, 1000, 1200), 1200);
  assert.equal(chartEndAt(false, 1000, 1400), 1400);
});

test('stale telemetry is rejected after the freshness threshold', () => {
  assert.ok(isFresh({ age_seconds: 2 }));
  assert.equal(isFresh({ age_seconds: 2.01 }), false);
  assert.equal(isFresh({}), false);
});

test('ROS telemetry samples require a fresh, new, timestamped finite value', () => {
  const item = { age_seconds: 0.2, received_at: '2026-10-26T15:00:00.000Z' };
  const at = Date.parse(item.received_at);

  assert.deepEqual(telemetrySample(item, 12, at - 1), { at, value: 12 });
  assert.equal(telemetrySample(item, 12, at), null);
  assert.equal(telemetrySample({ ...item, age_seconds: 2.1 }, 12), null);
  assert.equal(telemetrySample(item, Number.NaN), null);
  assert.equal(telemetrySample({ ...item, received_at: 'invalid' }, 12), null);
});

test('crosshair selection preserves the timestamp of the actual nearest sample', () => {
  const sample = nearestSample([
    { at: 900, value: 1 },
    { at: 1100, value: 2 },
  ], 1080);

  assert.deepEqual(sample, { at: 1100, value: 2 });
});
