import { useEffect } from 'react';
import { rt, useWorld } from './runtime.ts';
import { useGame } from '../store.ts';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** 正在输入文字（聊天框等）时不处理移动/快捷键 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** 抽屉、确认框、项目小游戏等打开时锁定移动 */
export function movementLocked(): boolean {
  const g = useGame.getState();
  return !rt.worldInitialized || useWorld.getState().locks.length > 0 || g.drawer !== null || g.projectActive || g.introPlaying || g.phoneOpen;
}

export function clearKeys() {
  rt.keys.clear();
  rt.joy = { x: 0, z: 0 };
  rt.me.moving = false;
  rt.path = null;
  rt.npcNavigation = null;
}

/**
 * 键盘：WASD/方向键移动（相对镜头方向），E 互动，Enter 聊天，Esc 取消自动寻路/总览。
 * 窗口失焦、切换标签页、聚焦输入框时清空按键，避免「卡键」一直走。
 */
export function useWorldInput(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'KeyP' && !e.repeat) {
        const game = useGame.getState();
        if (game.phoneOpen) game.closePhone();
        else if (!movementLocked()) game.openPhone();
        e.preventDefault();
        return;
      }
      if (MOVE_KEYS.has(e.code)) {
        if (movementLocked()) return;
        rt.keys.add(e.code);
        rt.path = null;
        rt.npcNavigation = null;
        rt.lastInputAt = performance.now();
        if (useWorld.getState().overview) useWorld.getState().setOverview(false);
        e.preventDefault();
        return;
      }
      if (movementLocked() || e.repeat) return;
      if (e.code === 'KeyE') {
        window.dispatchEvent(new CustomEvent('world-interact'));
        e.preventDefault();
      } else if (e.code === 'Enter') {
        window.dispatchEvent(new CustomEvent('world-chat'));
        e.preventDefault();
      } else if (e.code === 'Escape') {
        rt.path = null;
        rt.npcNavigation = null;
        useWorld.getState().setOverview(false);
      } else if (e.code === 'KeyM') {
        useWorld.getState().setOverview(!useWorld.getState().overview);
      }
    };
    const up = (e: KeyboardEvent) => {
      rt.keys.delete(e.code);
    };
    const blur = () => clearKeys();
    const vis = () => document.hidden && clearKeys();
    const focusIn = (e: FocusEvent) => isTypingTarget(e.target) && clearKeys();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);
    document.addEventListener('focusin', focusIn);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', vis);
      document.removeEventListener('focusin', focusIn);
      clearKeys();
    };
  }, [enabled]);

  // 一旦被锁定（打开抽屉/小游戏/确认框），立刻停下
  useEffect(
    () =>
      useWorld.subscribe((s, p) => {
        if (s.locks.length && !p.locks.length) {
          clearKeys();
          rt.path = null;
        }
      }),
    [],
  );
  useEffect(
    () =>
      useGame.subscribe((s, p) => {
        if ((s.drawer && !p.drawer) || (s.projectActive && !p.projectActive) || (s.phoneOpen && !p.phoneOpen) || (s.introPlaying && !p.introPlaying) || (s.phase !== 'game' && p.phase === 'game')) {
          clearKeys();
          rt.path = null;
        }
      }),
    [],
  );
}

/** 读取当前输入向量（镜头坐标系：x 右，z 前），长度 ≤ 1 */
export function inputVector(): { right: number; fwd: number } {
  if (movementLocked()) return { right: 0, fwd: 0 };
  const k = rt.keys;
  let right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  right += rt.joy.x;
  fwd += rt.joy.z;
  const len = Math.hypot(right, fwd);
  if (len > 1) {
    right /= len;
    fwd /= len;
  }
  return { right, fwd };
}
