import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSyncQueue } from '../src/syncQueue.ts';

test('100 economic events require one refresh, then deliver every event in order', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0;
  const delivered: number[] = [];
  const queue = createSyncQueue<number>(async () => { reads++; }, n => { delivered.push(n); });
  for (let i = 0; i < 100; i++) queue.enqueue(i);
  t.mock.timers.tick(49);
  assert.equal(reads, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.equal(reads, 1);
  assert.deepEqual(delivered, Array.from({ length: 100 }, (_, i) => i));
  queue.dispose();
});

test('an event arriving during a refresh gets its own refresh; old batches cannot leak after logout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const releases: (() => void)[] = [], delivered: string[] = [];
  const queue = createSyncQueue<string>(() => new Promise<void>(resolve => releases.push(resolve)), e => delivered.push(e));
  queue.enqueue('first'); t.mock.timers.tick(50);
  queue.enqueue('second'); t.mock.timers.tick(50);
  assert.equal(releases.length, 2);
  releases[0](); await Promise.resolve();
  assert.deepEqual(delivered, ['first']);
  queue.dispose(); releases[1](); await Promise.resolve();
  assert.deepEqual(delivered, ['first']);
  queue.enqueue('third'); t.mock.timers.tick(100);
  assert.equal(releases.length, 2);
});

test('disposing a queued refresh cancels work, and a rejected refresh emits no stale events', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0, events = 0;
  const queue = createSyncQueue(async () => { reads++; throw new Error('offline'); }, () => { events++; });
  queue.enqueue(); queue.dispose(); t.mock.timers.tick(100);
  assert.equal(reads, 0);
  const failing = createSyncQueue(async () => { throw new Error('offline'); }, () => { events++; });
  failing.enqueue('trade'); t.mock.timers.tick(50);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(events, 0);
  failing.dispose();
});
