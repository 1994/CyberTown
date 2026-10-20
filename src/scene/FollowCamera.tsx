import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useGame } from '../store.ts';
import { clearKeys, isTypingTarget } from '../world/input.ts';
import { rt, useWorld } from '../world/runtime.ts';
import { INTRO_SECONDS, useCinema } from './cinema.ts';
import { elevatorDoor } from './Room.tsx';

const FOLLOW_DIST = 17;
const OVERVIEW_DIST = 66;
const HOME_DIRECTION = new THREE.Vector3(0.46, 0.62, 0.64).normalize();
const INTRO_DOOR = 'cinematic-intro';
const smooth = (t: number) => t * t * (3 - 2 * t);

interface Intro {
  start: number;
  duration: number;
  position: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
  home: THREE.Vector3;
  homeTarget: THREE.Vector3;
  reducedMotion: boolean;
}

/** Claude's city → desks → neon elevator film, adapted to the free-roam campus. */
export function FollowCamera({ active }: { active: boolean }) {
  const controls = useRef<OrbitImpl>(null);
  const { camera, size } = useThree();
  const introNonce = useGame((s) => s.introNonce);
  const introPlaying = useGame((s) => s.introPlaying);
  const setIntroPlaying = useGame((s) => s.setIntroPlaying);
  const overview = useWorld((s) => s.overview);
  const zoomGoal = useRef<number | null>(null);
  const intro = useRef<Intro | null>(null);
  const focus = useRef<{ offset: THREE.Vector3 } | null>(null);
  const portrait = size.width / size.height < 0.9;
  const followDist = portrait ? FOLLOW_DIST * 1.3 : FOLLOW_DIST;
  const tmp = useRef(new THREE.Vector3());
  const desiredPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!active || !introNonce || !useGame.getState().introPlaying) return;
    useCinema.getState().clear();
    useWorld.getState().setOverview(false);
    clearKeys();
    rt.path = null;
    focus.current = null;
    zoomGoal.current = null;
    const target = new THREE.Vector3(rt.me.x, 0.8, rt.me.z);
    const home = target.clone().addScaledVector(HOME_DIRECTION, followDist);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    intro.current = {
      start: performance.now(),
      duration: reducedMotion ? 1200 : INTRO_SECONDS * 1000,
      reducedMotion,
      home,
      homeTarget: target,
      position: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-46, 30, 58),
        new THREE.Vector3(-20, 12, 26),
        new THREE.Vector3(-2, 4.6, 10),
        new THREE.Vector3(6.5, 3.6, 4.5),
        new THREE.Vector3(rt.me.x + 12, 16, rt.me.z + 18),
        home,
      ], false, 'centripetal'),
      target: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-30, -4, -60),
        new THREE.Vector3(-4, 0, -6),
        new THREE.Vector3(-1, 1, -1.5),
        new THREE.Vector3(5.5, 2.4, -4.6),
        target.clone(),
        target.clone(),
      ], false, 'centripetal'),
    };
    useCinema.getState().startIntro(intro.current.start, intro.current.duration);
    const finish = () => {
      const film = intro.current;
      if (!film) return;
      film.homeTarget.set(rt.me.x, 0.8, rt.me.z);
      film.home.copy(film.homeTarget).addScaledVector(HOME_DIRECTION, followDist);
      camera.position.copy(film.home);
      controls.current?.target.copy(film.homeTarget);
      controls.current?.update();
      intro.current = null;
      elevatorDoor.requests.delete(INTRO_DOOR);
      clearKeys();
      setIntroPlaying(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener('world-skip-intro', finish);
    window.addEventListener('keydown', onKey);
    return () => {
      intro.current = null;
      elevatorDoor.requests.delete(INTRO_DOOR);
      window.removeEventListener('world-skip-intro', finish);
      window.removeEventListener('keydown', onKey);
    };
  }, [introNonce, active, camera, followDist, setIntroPlaying]);

  useEffect(() => {
    if (active) zoomGoal.current = overview ? OVERVIEW_DIST : followDist;
  }, [overview, active, followDist]);

  useEffect(() => {
    if (active) return;
    useCinema.getState().clear();
    focus.current = null;
    const c = controls.current;
    if (!c) return;
    c.target.set(0, 0, 2);
    camera.position.set(34, 34, 46);
    c.update();
  }, [active, camera]);

  // Pointer control releases an event shot; walking returns to the follow view.
  useEffect(() => {
    const c = controls.current;
    const release = () => {
      if (useGame.getState().introPlaying) return;
      useCinema.getState().clear();
      focus.current = null;
      zoomGoal.current = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyM'].includes(event.code))
        useCinema.getState().clear();
    };
    c?.addEventListener('start', release);
    window.addEventListener('keydown', onKey);
    return () => {
      c?.removeEventListener('start', release);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useFrame((_, dtRaw) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now();
    if (!active) {
      c.autoRotate = true;
      c.autoRotateSpeed = 0.35;
      c.update();
      return;
    }
    c.autoRotate = false;
    const film = intro.current;
    if (film && useGame.getState().introPlaying) {
      // World reconnection can restore a non-spawn position during the first shot.
      film.homeTarget.set(rt.me.x, 0.8, rt.me.z);
      film.home.copy(film.homeTarget).addScaledVector(HOME_DIRECTION, followDist);
      film.position.points[4].set(rt.me.x + 12, 16, rt.me.z + 18);
      film.target.points[4].copy(film.homeTarget);
      film.target.points[5].copy(film.homeTarget);
      const t = Math.min(1, (now - film.start) / film.duration);
      const e = smooth(t);
      camera.position.copy(film.reducedMotion ? film.home : film.position.getPoint(e));
      const target = film.reducedMotion ? film.homeTarget : film.target.getPoint(e);
      c.target.copy(target);
      camera.lookAt(target);
      if (t > 0.42 && t < 0.8) elevatorDoor.requests.add(INTRO_DOOR);
      else elevatorDoor.requests.delete(INTRO_DOOR);
      if (t >= 1) {
        intro.current = null;
        elevatorDoor.requests.delete(INTRO_DOOR);
        c.update();
        clearKeys();
        setIntroPlaying(false);
      }
      rt.camYaw = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
      return;
    }

    const shot = useCinema.getState().shot;
    if (shot && now >= shot.until) useCinema.getState().clear();
    const actor = shot && now < shot.until ? rt.colleaguePos.get(shot.colleagueId) : null;
    if (actor && shot) {
      if (!focus.current) focus.current = { offset: camera.position.clone().sub(c.target) };
      const k = portrait ? 1.35 : 1;
      tmp.current.set(actor.x, 1.0, actor.z);
      // Three-quarter front view keeps the identity mask visible as the actor turns.
      desiredPos.current.set(
        actor.x + (Math.sin(actor.yaw) * 6.6 + Math.cos(actor.yaw) * 2) * k,
        4.5 * k,
        actor.z + (Math.cos(actor.yaw) * 6.6 - Math.sin(actor.yaw) * 2) * k,
      );
      camera.position.lerp(desiredPos.current, 1 - Math.exp(-3.2 * dt));
      c.target.lerp(tmp.current, 1 - Math.exp(-4 * dt));
      c.update();
      rt.camYaw = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
      return;
    }

    const ov = useWorld.getState().overview;
    const want = tmp.current.set(ov ? 0 : rt.me.x, 0.8, ov ? 1 : rt.me.z);
    if (focus.current && !ov) {
      desiredPos.current.copy(want).add(focus.current.offset);
      camera.position.lerp(desiredPos.current, 1 - Math.exp(-3 * dt));
      c.target.lerp(want, 1 - Math.exp(-4 * dt));
      if (camera.position.distanceTo(desiredPos.current) < 0.1) focus.current = null;
    } else {
      focus.current = null;
      const before = c.target.clone();
      c.target.x = THREE.MathUtils.damp(c.target.x, want.x, ov ? 3 : 7, dt);
      c.target.z = THREE.MathUtils.damp(c.target.z, want.z, ov ? 3 : 7, dt);
      c.target.y = want.y;
      camera.position.add(c.target.clone().sub(before));
      if (zoomGoal.current != null) {
        const dir = camera.position.clone().sub(c.target);
        const length = THREE.MathUtils.damp(dir.length(), zoomGoal.current, 3, dt);
        camera.position.copy(c.target).addScaledVector(dir.normalize(), length);
        if (Math.abs(length - zoomGoal.current) < 0.2) zoomGoal.current = null;
      }
    }
    c.update();
    rt.camYaw = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z);
  });

  return <OrbitControls
    ref={controls}
    makeDefault
    enabled={!introPlaying}
    enablePan={false}
    enableDamping
    dampingFactor={0.1}
    minDistance={6}
    maxDistance={active ? 70 : 90}
    minPolarAngle={0.3}
    maxPolarAngle={1.2}
    zoomSpeed={0.8}
  />;
}
