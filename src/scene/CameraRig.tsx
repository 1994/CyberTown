import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useGame } from '../store.ts';
import { DEFAULT_CAM, MOBILE_CAM } from './layout.ts';
import { useFocus } from './focus.ts';

export const INTRO_SECONDS = 9;

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 斜俯视相机 + 入场电影镜头（城市远景 → 掠过工位 → 霓虹电梯 → 归位） */
export function CameraRig({ cinematic }: { cinematic: boolean }) {
  const controls = useRef<OrbitImpl>(null);
  const { camera, size } = useThree();
  const introNonce = useGame((s) => s.introNonce);
  const introPlaying = useGame((s) => s.introPlaying);
  const setIntroPlaying = useGame((s) => s.setIntroPlaying);
  const start = useRef(0);
  const portrait = size.width / size.height < 0.9;
  const home = portrait ? MOBILE_CAM : DEFAULT_CAM;

  const curves = useMemo(() => {
    const end = new THREE.Vector3(...home.pos);
    const endT = new THREE.Vector3(...home.target);
    return {
      pos: new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-46, 30, 58),
          new THREE.Vector3(-20, 12, 26),
          new THREE.Vector3(-2, 4.6, 10),
          new THREE.Vector3(6.5, 3.6, 4.5),
          new THREE.Vector3(10, 7.5, 9),
          end,
        ],
        false,
        'centripetal',
      ),
      target: new THREE.CatmullRomCurve3(
        [new THREE.Vector3(-30, -4, -60), new THREE.Vector3(-4, 0, -6), new THREE.Vector3(-1, 1, -1.5), new THREE.Vector3(5.5, 2.4, -4.6), new THREE.Vector3(2, 1, -1), endT],
        false,
        'centripetal',
      ),
    };
  }, [home]);

  useEffect(() => {
    start.current = performance.now();
  }, [introNonce]);

  // 桌面端人才市场面板打开时，把画面中心向左平移，避免面板遮挡电梯与工位
  const marketOpen = useGame((s) => s.marketOpen);
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const shift = phase === 'game' && marketOpen && size.width > 900 ? Math.round(Math.min(190, size.width * 0.13)) : phase === 'login' && size.width > 900 ? -Math.round(size.width * 0.14) : 0;
    if (shift) cam.setViewOffset(size.width, size.height, shift, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [marketOpen, phase, size, camera]);

  // 片头结束 / 跳过：归位
  useEffect(() => {
    if (!introPlaying) {
      camera.position.set(...home.pos);
      controls.current?.target.set(...home.target);
      controls.current?.update();
    }
  }, [introPlaying, home, camera]);

  // 演出聚焦：平滑推近 → 停留 → 平滑回到默认视角；用户拖动镜头时立即让出控制
  const focusState = useRef<{ returning: boolean; active: boolean }>({ returning: false, active: false });
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => {
      useFocus.setState({ focus: null });
      focusState.current = { returning: false, active: false };
    };
    c.addEventListener('start', cancel);
    return () => c.removeEventListener('start', cancel);
  });
  useFrame((_, dt) => {
    if (introPlaying || !controls.current) return;
    const f = useFocus.getState().focus;
    const st = focusState.current;
    const c = controls.current;
    if (f && performance.now() < f.until) {
      st.active = true;
      st.returning = false;
      const k = portrait ? 1.35 : 1;
      tmpTarget.set(f.x, 0.9, f.z);
      tmpPos.set(f.x + 5.2 * k, 6.4 * k, f.z + 7.6 * k);
    } else if (st.active) {
      st.active = false;
      st.returning = true;
      useFocus.setState({ focus: null });
    }
    if (!st.returning && !st.active) return;
    if (st.returning) {
      tmpTarget.set(...home.target);
      tmpPos.set(...home.pos);
    }
    camera.position.x = THREE.MathUtils.damp(camera.position.x, tmpPos.x, 2.2, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, tmpPos.y, 2.2, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, tmpPos.z, 2.2, dt);
    c.target.x = THREE.MathUtils.damp(c.target.x, tmpTarget.x, 2.4, dt);
    c.target.y = THREE.MathUtils.damp(c.target.y, tmpTarget.y, 2.4, dt);
    c.target.z = THREE.MathUtils.damp(c.target.z, tmpTarget.z, 2.4, dt);
    c.update();
    if (st.returning && camera.position.distanceTo(tmpPos) < 0.05) st.returning = false;
  });

  useFrame(() => {
    if (!cinematic || !introPlaying) return;
    const t = Math.min(1, (performance.now() - start.current) / (INTRO_SECONDS * 1000));
    const e = ease(t);
    camera.position.copy(curves.pos.getPoint(e));
    camera.lookAt(curves.target.getPoint(e));
    if (t >= 1) setIntroPlaying(false);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!introPlaying || !cinematic}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={8}
      maxDistance={42}
      minPolarAngle={0.35}
      maxPolarAngle={1.18}
      minAzimuthAngle={-0.2}
      maxAzimuthAngle={1.65}
      target={home.target}
    />
  );
}
