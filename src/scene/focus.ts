import { create } from 'zustand';

/** 演出镜头聚焦：入职就座、被挖角收拾时把镜头推近对应工位，结束后自动回到默认视角 */
interface FocusStore {
  focus: { x: number; z: number; until: number; id: number } | null;
  focusOn: (x: number, z: number, seconds: number) => void;
}

let seq = 1;
export const useFocus = create<FocusStore>((set) => ({
  focus: null,
  focusOn: (x, z, seconds) => set({ focus: { x, z, until: performance.now() + seconds * 1000, id: seq++ } }),
}));
