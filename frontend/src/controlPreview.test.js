import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMERAS,
  STREAM_PROFILES,
  TOOL_IDS,
  TOOL_MODES,
  normalizeJoystickPointer,
} from './controlPreview.js';

test('Control preview exposes only the requested local choices', () => {
  assert.deepEqual(CAMERAS, ['Camera 1', 'Camera 2']);
  assert.deepEqual(STREAM_PROFILES, ['High', 'Medium', 'Low']);
  assert.deepEqual(TOOL_IDS, [1, 2, 3, 5]);
  assert.deepEqual(TOOL_MODES, [1, 2, 3]);
});

test('mock joystick normalizes pointer coordinates to the [-1, 1] range', () => {
  const bounds = { left: 100, right: 300, top: 50, bottom: 250 };
  assert.deepEqual(normalizeJoystickPointer(200, 150, bounds), { yaw: 0, pitch: 0 });
  assert.deepEqual(normalizeJoystickPointer(300, 50, bounds), { yaw: 1, pitch: 1 });
  assert.deepEqual(normalizeJoystickPointer(0, 400, bounds), { yaw: -1, pitch: -1 });
});

test('mock joystick returns neutral values when its bounds are invalid', () => {
  assert.deepEqual(
    normalizeJoystickPointer(10, 10, { left: 10, right: 10, top: 10, bottom: 10 }),
    { yaw: 0, pitch: 0 }
  );
  assert.deepEqual(
    normalizeJoystickPointer(Number.NaN, 10, { left: 0, right: 100, top: 0, bottom: 100 }),
    { yaw: 0, pitch: 0 }
  );
});
