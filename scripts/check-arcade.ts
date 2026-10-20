import assert from 'node:assert/strict';
import { test } from 'node:test';
import { animateBelt, beltTaskFrame } from '../src/ui/beltAnimation.ts';
import { generateTasks } from '../shared/rules.ts';

const task = { ...generateTasks(10, 15000)[0], spawnAt: 100, ttl: 1000 };

test('compositor motion keeps the exact live hit window, independent of React timer cadence', () => {
  for (const [progress, visible, inZone] of [
    [-0.01, false, false], [0, true, false], [0.57999, true, false],
    [0.58, true, true], [0.75, true, true], [0.97, true, true],
    [0.97001, true, false], [1, true, false], [1.01, false, false],
  ] as const) {
    const frame = beltTaskFrame(task, task.spawnAt + task.ttl * progress, false);
    assert.equal(frame.visible, visible);
    assert.equal(frame.inZone, inZone);
  }
  assert.equal(beltTaskFrame(task, task.spawnAt + task.ttl * 0.75, true).visible, false);
});

test('card transforms respond to resize and completed/expired cards release highlight and compositor hints', () => {
  const classes = new Set<string>();
  const element = {
    style: { display: 'none', transform: '', willChange: '' },
    dataset: { inZone: '0' },
    classList: { toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); }, remove(name: string) { classes.delete(name); } },
  };
  const nodes = new Map([[task.id, element as unknown as HTMLSpanElement]]);
  const done = new Set<number>();
  const time = task.spawnAt + task.ttl * 0.75;
  animateBelt(nodes, [task], done, time, 400);
  assert.equal(element.style.display, '');
  assert.match(element.style.transform, /translate3d\(300px/);
  assert.ok(classes.has('in'));
  assert.equal(element.dataset.inZone, '1');
  animateBelt(nodes, [task], done, time, 800);
  assert.match(element.style.transform, /translate3d\(600px/);
  done.add(task.id);
  animateBelt(nodes, [task], done, time, 800);
  assert.equal(element.style.display, 'none');
  assert.equal(element.style.willChange, '');
  assert.ok(!classes.has('in'));
  assert.equal(element.dataset.inZone, '0');
});
