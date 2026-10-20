import * as THREE from 'three';
import type { Rig } from './Character.tsx';

// 程序化人物姿态：所有角色（玩家、远端玩家、同事）共用同一套动作混合。

export const SEAT_LIFT = 0.04;

export interface PoseTarget {
  sit: number; // 0 站 / 1 坐
  walk: number; // 步态强度
  walkPhase: number;
  typing: number;
  carry: number; // 抱纸箱
  celebrate: number; // 双手举高跳
  reach: number; // 收拾东西伸手
  wave: number; // 挥手
  dance: number;
  cup: number; // 举杯
  t: number;
}

export const idlePose = (t: number): PoseTarget => ({
  sit: 0,
  walk: 0,
  walkPhase: 0,
  typing: 0,
  carry: 0,
  celebrate: 0,
  reach: 0,
  wave: 0,
  dance: 0,
  cup: 0,
  t,
});

const damp = (cur: number, target: number, dt: number, l = 10) => THREE.MathUtils.damp(cur, target, l, dt);

export function applyPose(rig: Rig, p: PoseTarget, dt: number) {
  const sw = Math.sin(p.walkPhase) * p.walk;
  const bounce = Math.abs(Math.cos(p.walkPhase)) * 0.05 * p.walk;
  const jump = p.celebrate > 0 ? Math.abs(Math.sin(p.t * 7)) * 0.22 * p.celebrate : 0;
  const danceBob = p.dance ? Math.abs(Math.sin(p.t * 6)) * 0.12 : 0;
  rig.body.position.y = damp(rig.body.position.y, p.sit * SEAT_LIFT + bounce + jump + danceBob, dt, 14);
  const legSit = -1.45 * p.sit;
  const danceLeg = p.dance ? Math.sin(p.t * 6) * 0.35 : 0;
  rig.legL.rotation.x = damp(rig.legL.rotation.x, legSit + sw * 0.6 + danceLeg, dt, 16);
  rig.legR.rotation.x = damp(rig.legR.rotation.x, legSit - sw * 0.6 - danceLeg, dt, 16);
  const typeL = p.typing ? Math.sin(p.t * 16) * 0.12 : 0;
  const typeR = p.typing ? Math.sin(p.t * 16 + 1.7) * 0.12 : 0;
  const reach = p.reach ? Math.sin(p.t * 5) * 0.5 + 0.5 : 0;
  let ax = -sw * 0.5;
  let axR = sw * 0.5;
  ax += (-1.15 + typeL) * p.typing + -1.35 * p.carry + (-0.9 - reach * 0.6) * p.reach;
  axR += (-1.15 + typeR) * p.typing + -1.35 * p.carry + (-0.9 - (1 - reach) * 0.6) * p.reach;
  axR += -1.6 * p.cup;
  rig.armL.rotation.x = damp(rig.armL.rotation.x, ax, dt, 14);
  rig.armR.rotation.x = damp(rig.armR.rotation.x, axR - 2.6 * p.wave + Math.sin(p.t * 10) * 0.25 * p.wave, dt, 14);
  const danceArm = p.dance ? Math.sin(p.t * 6) * 0.9 : 0;
  rig.armL.rotation.z = damp(rig.armL.rotation.z, -2.5 * p.celebrate + 0.25 * p.carry - (1.2 + danceArm) * p.dance, dt, 12);
  rig.armR.rotation.z = damp(rig.armR.rotation.z, 2.5 * p.celebrate - 0.25 * p.carry + 0.3 * p.wave + (1.2 - danceArm) * p.dance, dt, 12);
  rig.head.rotation.y = damp(rig.head.rotation.y, Math.sin(p.t * 0.7) * 0.15 * (1 - p.walk), dt, 4);
  rig.head.rotation.x = damp(rig.head.rotation.x, p.typing ? 0.12 + Math.sin(p.t * 3) * 0.03 : 0, dt, 6);
  rig.torso.rotation.z = Math.sin(p.walkPhase) * 0.04 * p.walk + (p.dance ? Math.sin(p.t * 6) * 0.12 : 0);
}

/** 朝向平滑（处理 ±π 环绕） */
export function turnTowards(cur: number, target: number, dt: number, speed = 10): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, dt * speed);
}
