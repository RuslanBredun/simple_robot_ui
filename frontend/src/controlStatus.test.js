import assert from 'node:assert/strict';
import test from 'node:test';
import { controlStatusValues } from './controlStatus.js';

test('control status labels show fresh read-only ROS state', () => {
  const fresh = { age_seconds: 0.2 };
  assert.deepEqual(controlStatusValues({
    connection: { ...fresh, connected: true },
    gimbal: { ...fresh, mode: 'DISABLED' },
    modes: { weapon: { ...fresh, mode: 'UNARMED' } },
  }), [
    ['Оператор · джерело', 'Підключений · джерело невідоме'],
    ['Turret Mode', 'DISABLED'],
    ['Weapon Mode', 'UNARMED'],
  ]);
});

test('control status labels reject stale or missing ROS state', () => {
  assert.deepEqual(controlStatusValues({
    connection: { age_seconds: 3, connected: true },
    gimbal: { age_seconds: 3, mode: 'MANUAL' },
    modes: { weapon: { age_seconds: 3, mode: 'ARMED' } },
  }), [
    ['Оператор · джерело', 'Немає даних'],
    ['Turret Mode', 'Немає даних'],
    ['Weapon Mode', 'Немає даних'],
  ]);
});

test('control status labels report unavailable ROS without implying ownership', () => {
  assert.deepEqual(controlStatusValues({
    available: false,
    connection: { age_seconds: 0, connected: true },
    gimbal: { age_seconds: 0, mode: 'MANUAL' },
    modes: { weapon: { age_seconds: 0, mode: 'ARMED' } },
  }, true), [
    ['Оператор · джерело', 'API недоступний'],
    ['Turret Mode', 'API недоступний'],
    ['Weapon Mode', 'API недоступний'],
  ]);
});

test('control status labels report ROS unavailability from the diagnostics adapter', () => {
  assert.deepEqual(controlStatusValues({ available: false }), [
    ['Оператор · джерело', 'ROS недоступний'],
    ['Turret Mode', 'ROS недоступний'],
    ['Weapon Mode', 'ROS недоступний'],
  ]);
});
