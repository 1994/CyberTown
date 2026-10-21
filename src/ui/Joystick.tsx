import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Gamepad2, Hand, UserPlus, Zap } from 'lucide-react';
import { rt, useWorld } from '../world/runtime.ts';
import { movementLocked } from '../world/input.ts';
import { useGame } from '../store.ts';
import { blockReason } from './Confirm.tsx';
import { fmt } from './common.tsx';

const STILL = { x: 0, z: 0 };

/**
 * 左拇指摇杆：输出与键盘相同的「镜头坐标系」输入向量（rt.joy）。
 * 只跟踪按下它的那根手指；抬起、取消、丢失捕获、失焦、切后台、卸载时一律归零，避免一直走。
 * 拇钮位置直接写 DOM transform，不触发 React 重渲染。
 */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLElement>(null);
  const pid = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0, r: 48 });

  const place = (x: number, y: number) => {
    if (knob.current) knob.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const stop = useCallback(() => {
    const el = base.current;
    const id = pid.current;
    pid.current = null;
    rt.joy = STILL;
    place(0, 0);
    if (!el) return;
    delete el.dataset.active;
    if (id !== null && el.hasPointerCapture?.(id)) el.releasePointerCapture(id);
  }, []);

  useEffect(() => {
    const vis = () => document.hidden && stop();
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', vis);
      stop();
    };
  }, [stop]);

  const move = (cx: number, cy: number) => {
    const c = center.current;
    let dx = cx - c.x;
    let dy = cy - c.y;
    const len = Math.hypot(dx, dy);
    if (len > c.r) {
      dx = (dx / len) * c.r;
      dy = (dy / len) * c.r;
    }
    place(dx, dy);
    if (movementLocked()) {
      rt.joy = STILL;
      return;
    }
    // 摇杆向上 = 镜头前方；中心 12% 为死区
    rt.joy = len > c.r * 0.12 ? { x: dx / c.r, z: -dy / c.r } : STILL;
    rt.path = null;
    rt.npcNavigation = null;
    rt.lastInputAt = performance.now();
  };

  return (
    <div
      ref={base}
      className="joystick"
      role="group"
      aria-label="移动摇杆：按住拖动走路"
      data-testid="joystick"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pid.current !== null || (e.pointerType === 'mouse' && e.button !== 0) || movementLocked()) return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.34 };
        pid.current = e.pointerId;
        el.setPointerCapture(e.pointerId);
        el.dataset.active = '';
        if (useWorld.getState().overview) useWorld.getState().setOverview(false);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pid.current) move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === pid.current && stop()}
      onPointerCancel={(e) => e.pointerId === pid.current && stop()}
      onLostPointerCapture={(e) => e.pointerId === pid.current && stop()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="joystick-guides" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <path d="m46 18 4-4 4 4m28 28 4 4-4 4M54 82l-4 4-4-4M18 54l-4-4 4-4" />
      </svg>
      <i ref={knob} aria-hidden />
      <small className="thumb-label" aria-hidden>
        移动
      </small>
    </div>
  );
}

/**
 * 右拇指互动键：复用与 E 键相同的 world-interact 事件，由当前互动卡片处理招募 / 挖角 / 碰杯 / 开玩。
 */
export function TouchAction() {
  const near = useWorld((s) => s.near);
  const snap = useGame((s) => s.snapshot);
  const toast = useGame((s) => s.toast);
  if (!snap) return null;

  let tone = 'idle';
  let label = '互动';
  let sub: ReactNode = '靠近试试';
  let icon = <Hand size={24} />;
  let blocked: string | null = null;
  if (near?.kind === 'colleague') {
    const c = snap.colleagues.find((x) => x.id === near.id);
    const owned = !!c?.ownerId;
    tone = owned ? 'poach' : 'hire';
    label = owned ? '挖角' : '招募';
    icon = owned ? <Zap size={24} /> : <UserPlus size={24} />;
    blocked = c ? blockReason(c, snap) : '找不到TA';
    sub = blocked ?? (
      <>
        <i className="coin sm" />
        {fmt(c!.price)}
      </>
    );
  } else if (near?.kind === 'player') {
    tone = 'cheer';
    label = '碰杯';
    icon = <span className="touch-emoji">🥂</span>;
    sub = '+15';
  } else if (near?.kind === 'terminal') {
    tone = 'play';
    label = '开玩';
    icon = <Gamepad2 size={24} />;
    sub = '老板来接招';
  }

  const press = () => {
    if (!near) {
      toast({ tone: 'info', title: '走到同事或游戏机旁边，再点这里' });
      return;
    }
    if (blocked) {
      toast({ tone: 'info', title: blocked });
      return;
    }
    if (movementLocked()) return;
    window.dispatchEvent(new CustomEvent('world-interact'));
  };

  return (
    <button
      type="button"
      className="touch-action"
      data-tone={tone}
      data-blocked={blocked ? '' : undefined}
      aria-disabled={!near || !!blocked}
      aria-label={near ? `${label}${blocked ? `（${blocked}）` : ''}` : '互动：先靠近同事或游戏机'}
      onClick={press}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="touch-action"
    >
      {icon}
      <b>{label}</b>
      <small>{sub}</small>
    </button>
  );
}
