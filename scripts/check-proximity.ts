import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearbyPlayers, acceptsWorldUpdate, mergeWorldPlayers, selectColleagues, selectCrowd } from '../shared/proximity.ts';
import type { WorldPlayer } from '../shared/types.ts';
const player = (id: string, x: number, z = 0): WorldPlayer => ({ id, x, z, yaw: 0, moving: false, emote: '', emoteUntil: 0, said: '', saidUntil: 0, updatedAt: 1 });

test('delta retains unchanged people, removes departures and reconnect reset clears ghosts', () => {
  const initial = [player('a', 1), player('b', 2)];
  const moved = mergeWorldPlayers(initial, [player('a', 3)], { partial: true });
  assert.deepEqual(moved.map(p => [p.id, p.x]), [['a', 3], ['b', 2]]);
  assert.deepEqual(mergeWorldPlayers(moved, [], { partial: true, removed: ['a'] }).map(p => p.id), ['b']);
  assert.deepEqual(mergeWorldPlayers(moved, [player('c', 0)]).map(p => p.id), ['c']);
  assert.deepEqual(mergeWorldPlayers(initial, [], { partial: true }), initial);
});

test('walking promotes nearby people while mobile/desktop retain bounded real crowds', () => {
  const people = Array.from({ length: 100 }, (_, i) => player(`p${i}`, i / 5));
  const empty = { full: [], lite: [] };
  const mobile = selectCrowd(people, { x: 0, z: 0 }, 'me', empty, true, null);
  assert.equal(mobile.full.length, 6); assert.equal(mobile.lite.length, 28);
  const desktop = selectCrowd(people, { x: 0, z: 0 }, 'me', empty, false, null);
  assert.equal(desktop.full.length, 12); assert.equal(desktop.lite.length, 48);
  const walked = selectCrowd(people, { x: 19, z: 0 }, 'me', mobile, true, 'p99');
  assert.ok(walked.full.includes('p99')); assert.ok(!walked.full.includes('p0'));
  assert.equal(new Set([...walked.full, ...walked.lite]).size, walked.full.length + walked.lite.length);
});

test('LOD hysteresis does not flicker across the 12m boundary', () => {
  const retained = selectCrowd([player('a', 13)], { x: 0, z: 0 }, 'me', { full: ['a'], lite: [] }, true, null);
  assert.deepEqual(retained.full, ['a']);
  const left = selectCrowd([player('a', 15)], { x: 0, z: 0 }, 'me', retained, true, null);
  assert.deepEqual(left.full, []); assert.deepEqual(left.lite, ['a']);
});

test('solo always keeps authored NPCs and own three-person team regardless of catalog size', () => {
  const npc = Array.from({ length: 7 }, (_, i) => ({ id: `npc${i}`, selfPlayerId: null, ownerId: null as string | null, deskSlot: null as number | null }));
  const directory = Array.from({ length: 1000 }, (_, i) => ({ id: `clone${i}`, selfPlayerId: `person${i}`, ownerId: null as string | null, deskSlot: null as number | null }));
  for (let i = 0; i < 3; i++) directory[i].ownerId = 'me';
  const selected = selectColleagues([...npc, ...directory], 'me', new Set(), new Set(['me']), null, new Set());
  for (const c of [...npc, ...directory.slice(0, 3)]) assert.ok(selected.some(v => v.id === c.id));
  assert.equal(selected.length, 14); // seven authored + three owned + four preview booths
  const focused = selectColleagues([...npc, ...directory], 'me', new Set(), new Set(), 'clone999', new Set(['clone500']));
  assert.ok(focused.some(c => c.id === 'clone999')); assert.ok(focused.some(c => c.id === 'clone500'));
});

test('foreign teams outside the viewport do not instantiate their NPC followers', () => {
  const c = { id: 'npc', selfPlayerId: null, ownerId: 'far', deskSlot: 0 };
  assert.equal(selectColleagues([c], 'me', new Set(), new Set(['far']), null, new Set()).length, 0);
  assert.equal(selectColleagues([c], 'me', new Set(['far']), new Set(['far']), null, new Set()).length, 1);
  assert.equal(selectColleagues([c], 'me', new Set(), new Set(), null, new Set()).length, 1);
});

test('late HTTP bootstrap cannot overwrite a stream; explicit focus never discards ordered deltas', () => {
  assert.equal(acceptsWorldUpdate(false, {}), true);
  assert.equal(acceptsWorldUpdate(true, {}), false);
  assert.equal(acceptsWorldUpdate(true, { stream: true, partial: true }), true);
  assert.equal(acceptsWorldUpdate(true, { local: true, partial: true }), true);
  assert.equal(acceptsWorldUpdate(true, { stream: true, partial: false }), true);
});

test('a far pinned contact stays online without inflating the physical nearby count', () => {
  assert.deepEqual(nearbyPlayers([player('me', 0), player('near', 4), player('pinned', 40)], 'me').map(p => p.id), ['near']);
});
