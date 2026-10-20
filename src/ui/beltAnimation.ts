import type { ProjectTask } from '../../shared/rules.ts';

// Shared by visual motion and action targeting: never show an earlier/later hit
// window just because the React timer is intentionally refreshed less often.
export const BELT_ZONE = [0.58, 0.97] as const;

export function beltTaskFrame(task: ProjectTask, time: number, done: boolean) {
  const progress = (time - task.spawnAt) / task.ttl;
  const visible = !done && progress >= 0 && progress <= 1;
  return { progress, visible, inZone: visible && progress >= BELT_ZONE[0] && progress <= BELT_ZONE[1] };
}

/** Only the few visible cards get compositor transforms. No layout read or React
 * update in this loop; width is maintained by ResizeObserver outside the frame. */
export function animateBelt(nodes: ReadonlyMap<number, HTMLSpanElement>, tasks: readonly ProjectTask[], done: ReadonlySet<number>, time: number, width: number) {
  for (const task of tasks) {
    const node = nodes.get(task.id);
    if (!node) continue;
    const frame = beltTaskFrame(task, time, done.has(task.id));
    if (!frame.visible) {
      if (node.style.display !== 'none') {
        node.style.display = 'none';
        node.style.willChange = '';
        node.classList.remove('in');
        node.dataset.inZone = '0';
      }
      continue;
    }
    if (node.style.display === 'none') {
      node.style.display = '';
      node.style.willChange = 'transform';
    }
    node.style.transform = `translate3d(${frame.progress * width}px,-50%,0) translateX(-50%) scale(${frame.inZone ? 1.08 : 1})`;
    node.classList.toggle('in', frame.inZone);
    const zone = frame.inZone ? '1' : '0';
    if (node.dataset.inZone !== zone) node.dataset.inZone = zone;
  }
}
