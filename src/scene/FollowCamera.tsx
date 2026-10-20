import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useGame } from '../store.ts';
import { rt, useWorld } from '../world/runtime.ts';

const FOLLOW_DIST = 17;
const OVERVIEW_DIST = 66;
const INTRO_MS = 1700;

/**
 * 跟随镜头：斜俯视平滑跟随「你」，可拖拽旋转 / 滚轮缩放；M 键或按钮切换总览。
 * 入场只有 ≤2 秒的俯冲落到玩家身上，期间就能移动；任意按键立即结束。
 * 登录页没有玩家时，镜头缓慢环绕整个园区。
 */
export function FollowCamera({ active }: { active: boolean }) {
  const controls = useRef<OrbitImpl>(null);
  const { camera, size } = useThree();
  const introNonce = useGame((s) => s.introNonce);
  const setIntroPlaying = useGame((s) => s.setIntroPlaying);
  const overview = useWorld((s) => s.overview);
  const zoomGoal = useRef<number | null>(null);
  const intro = useRef<{ t0: number } | null>(null);
  const portrait = size.width / size.height < 0.9;
  const followDist = portrait ? FOLLOW_DIST * 1.3 : FOLLOW_DIST;

  // 入场俯冲
  useEffect(() => {
    if (!active || !introNonce) return;
    const c = controls.current;
    const me = rt.me;
    if (c) {
      c.target.set(me.x, 0.8, me.z);
      camera.position.set(me.x + 18, 46, me.z + 30);
      c.update();
    }
    intro.current = { t0: performance.now() };
    zoomGoal.current = followDist;
    const end = () => {
      intro.current = null;
      setIntroPlaying(false);
    };
    const id = setTimeout(end, INTRO_MS);
    const skip = () => {
      if (!intro.current) return;
      clearTimeout(id);
      const cc = controls.current;
      if (cc) {
        const dir = camera.position.clone().sub(cc.target).normalize();
        camera.position.copy(cc.target).addScaledVector(dir, followDist);
      }
      end();
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('world-skip-intro', skip, { once: true });
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('world-skip-intro', skip);
    };
  }, [introNonce, active, camera, followDist, setIntroPlaying]);

  useEffect(() => {
    if (!active) return;
    zoomGoal.current = overview ? OVERVIEW_DIST : followDist;
  }, [overview, active, followDist]);

  // 登录页：环绕总览
  useEffect(() => {
    if (active) return;
    const c = controls.current;
    if (!c) return;
    c.target.set(0, 0, 2);
    camera.position.set(34, 34, 46);
    c.update();
  }, [active, camera]);

  const tmp = useRef(new THREE.Vector3());
  useFrame((_, dtRaw) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(dtRaw, 0.05);
    if (!active) {
      c.autoRotate = true;
      c.autoRotateSpeed = 0.35;
      c.update();
      return;
    }
    c.autoRotate = false;
    const ov = useWorld.getState().overview;
    const want = tmp.current.set(ov ? 0 : rt.me.x, 0.8, ov ? 1 : rt.me.z);
    const before = c.target.clone();
    c.target.x = THREE.MathUtils.damp(c.target.x, want.x, ov ? 3 : 7, dt);
    c.target.z = THREE.MathUtils.damp(c.target.z, want.z, ov ? 3 : 7, dt);
    c.target.y = want.y;
    camera.position.add(c.target.clone().sub(before));
    // 缩放目标（总览/回到跟随/入场俯冲）
    if (zoomGoal.current != null) {
      const dir = camera.position.clone().sub(c.target);
      const len = dir.length();
      const lambda = intro.current ? 3.2 : 3;
      const nl = THREE.MathUtils.damp(len, zoomGoal.current, lambda, dt);
      // 入场时同时把俯角拉回到舒适的斜俯视
      if (intro.current) {
        dir.y = THREE.MathUtils.damp(dir.y / len, 0.62, 3, dt) * len;
      }
      camera.position.copy(c.target).addScaledVector(dir.normalize(), nl);
      if (Math.abs(nl - zoomGoal.current) < 0.2 && !intro.current) zoomGoal.current = null;
    }
    c.update();
    rt.camYaw = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.1}
      minDistance={6}
      maxDistance={active ? 70 : 90}
      minPolarAngle={0.3}
      maxPolarAngle={1.2}
      zoomSpeed={0.8}
    />
  );
}
