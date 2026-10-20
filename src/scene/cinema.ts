import { create } from 'zustand';

export const INTRO_SECONDS = 9;

export interface CinemaShot {
  id: number;
  colleagueId: string;
  kind: 'hire' | 'poach' | 'arrival';
  title: string;
  subtitle: string;
  until: number;
}

let sequence = 0;

/** Short event shots track the actual actor rather than a separate preview model. */
export const useCinema = create<{
  shot: CinemaShot | null;
  introStartedAt: number;
  introDuration: number;
  prepareIntro: () => void;
  startIntro: (at: number, duration: number) => void;
  focus: (shot: Omit<CinemaShot, 'id' | 'until'>, seconds?: number) => void;
  clear: () => void;
}>((set) => ({
  shot: null,
  introStartedAt: 0,
  introDuration: INTRO_SECONDS * 1000,
  prepareIntro: () => set({ shot: null, introStartedAt: 0 }),
  startIntro: (introStartedAt, introDuration) => set({ introStartedAt, introDuration }),
  focus: (shot, seconds = 5.5) => set((state) => ({
    shot: {
      ...shot,
      id: shot.kind === 'arrival' && state.shot?.colleagueId === shot.colleagueId
        ? state.shot.id : ++sequence,
      until: performance.now() + seconds * 1000,
    },
  })),
  clear: () => set({ shot: null }),
}));
