import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endpoint, normalizeApiBase } from '../shared/transport.ts';

test('REST and SSE share the same deployment base without dropping a gateway prefix', () => {
  for (const [input, want] of [['', ''], ['/gateway/', '/gateway'], ['https://test.example/api-gateway/', 'https://test.example/api-gateway']] as const) {
    const base = normalizeApiBase(input);
    assert.equal(base, want);
    assert.equal(endpoint(base, '/api/state'), want + '/api/state');
    assert.equal(endpoint(base, '/api/events?token=fixture'), want + '/api/events?token=fixture');
  }
});
test('deployment config rejects credentials and non-HTTP destinations', () => {
  for (const value of [null, {}, 'javascript:alert(1)', '//other.example', 'https://user:secret@example.com', 'https://example.com?token=x', '/api?token=x', '/api#hash', '/a\\b']) {
    assert.throws(() => normalizeApiBase(value));
  }
  assert.throws(() => endpoint('', 'https://other.example/api/state'));
});
