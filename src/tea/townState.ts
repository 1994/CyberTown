import { create } from 'zustand';
import type { TownHome, TownJobKind } from '../../shared/town.ts';
import { townApi } from './townApi.ts';

interface TownState {
  myId: string | null;
  home: TownHome | null;
  ready: boolean;
  busy: boolean;
  error: string;
  enterTown: (myId: string, ownerId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  hire: (sourceId: string, expectedPrice: number) => Promise<void>;
  startJob: (cloneId: string, kind: TownJobKind) => Promise<void>;
  upgrade: (expectedLevel: number) => Promise<void>;
  list: (cloneId: string, price: number, requestKey: string) => Promise<void>;
  withdraw: (listingId: string) => Promise<void>;
  buy: (listingId: string, expectedPrice: number) => Promise<void>;
  reset: () => void;
}

let epoch = 0;
let mutationToken = 0;
let enterLock = false;
let mutationLock = false;

function failure(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : '';
  return message || '操作失败，请重试';
}

export const useTownState = create<TownState>((set, get) => {
  const mutate = async (call: () => Promise<TownHome>) => {
    if (mutationLock) {
      const message = '操作进行中，请稍候';
      set({ error: message });
      throw new Error(message);
    }
    const current = get();
    if (!current.ready || !current.home) {
      const message = '尚未进入小镇';
      set({ error: message });
      throw new Error(message);
    }
    if (current.home.visitor) {
      const message = '访客只能参观，不能经营';
      set({ error: message });
      throw new Error(message);
    }

    const gen = epoch;
    const token = ++mutationToken;
    mutationLock = true;
    set({ busy: true, error: '' });
    try {
      const home = await call();
      if (gen === epoch) set({ home, busy: false, error: '' });
    } catch (error) {
      if (gen === epoch) set({ busy: false, error: failure(error) });
      throw error;
    } finally {
      if (token === mutationToken) mutationLock = false;
    }
  };

  return {
    myId: null,
    home: null,
    ready: false,
    busy: false,
    error: '',

    async enterTown(myId, ownerId) {
      if (enterLock) {
        set({ error: '正在进入小镇，请稍候' });
        return;
      }
      const gen = ++epoch;
      mutationToken++;
      mutationLock = false;
      enterLock = true;
      // Tear down the old realtime/worldNet before the async owner switch.
      set({ myId: null, home: null, ready: false, busy: true, error: '' });
      try {
        const home = await townApi.enter(ownerId ?? myId);
        if (gen !== epoch) return;
        set({ myId, home, ready: true, busy: false, error: '' });
      } catch (error) {
        if (gen === epoch) {
          set({ myId: null, home: null, ready: false, busy: false, error: failure(error) });
        }
        throw error;
      } finally {
        if (gen === epoch) enterLock = false;
      }
    },

    async refresh() {
      const current = get();
      if (!current.ready || !current.home || enterLock || mutationLock) return;
      const gen = epoch;
      const token = mutationToken;
      const owner = current.home.owner.id;
      try {
        const home = await townApi.home();
        const latest = get();
        if (gen !== epoch || token !== mutationToken || enterLock || mutationLock) return;
        if (!latest.ready || latest.home?.owner.id !== owner) return;
        // A mutation may have landed while this read was in flight.
        if (latest.home && home.serverTime < latest.home.serverTime) return;
        set({ home, error: '' });
      } catch (error) {
        if (gen === epoch && token === mutationToken) set({ error: failure(error) });
        throw error;
      }
    },

    hire(sourceId, expectedPrice) {
      return mutate(() => townApi.hire(sourceId, expectedPrice));
    },

    startJob(cloneId, kind) {
      return mutate(() => townApi.job(cloneId, kind));
    },

    upgrade(expectedLevel) {
      return mutate(() => townApi.upgrade(expectedLevel));
    },
    list(cloneId, price, requestKey) {
      return mutate(() => townApi.list(cloneId, price, requestKey));
    },
    withdraw(listingId) {
      return mutate(() => townApi.withdraw(listingId));
    },
    buy(listingId, expectedPrice) {
      return mutate(() => townApi.buy(listingId, expectedPrice));
    },

    reset() {
      epoch++;
      mutationToken++;
      enterLock = false;
      mutationLock = false;
      set({ myId: null, home: null, ready: false, busy: false, error: '' });
    },
  };
});
