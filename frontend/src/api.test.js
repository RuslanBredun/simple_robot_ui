import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from './api.js';

test('API client surfaces server-provided errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'ROS diagnostics unavailable' }),
  });

  try {
    await assert.rejects(api('diagnostics'), {
      message: 'ROS diagnostics unavailable',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
