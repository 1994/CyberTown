import { useRef, useState } from 'react';
import { rt } from '../world/runtime.ts';

/** 触屏方向摇杆：输出与键盘相同的「镜头坐标系」输入向量 */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const pid = useRef<number | null>(null);
  const R = 46;

  const update = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy, active: true });
    // 摇杆向上 = 镜头前方；小于 4px 视为死区
    rt.joy = len > 4 ? { x: dx / R, z: -dy / R } : { x: 0, z: 0 };
    rt.path = null;
  };
  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0, active: false });
    rt.joy = { x: 0, z: 0 };
  };

  return (
    <div
      ref={base}
      className={`joystick ${knob.active ? 'on' : ''}`}
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => pid.current === e.pointerId && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="移动摇杆"
      data-testid="joystick"
    >
      <i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
