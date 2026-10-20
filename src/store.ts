import { create } from 'zustand';
import type { StateSnapshot, TradeEvent, GameEvent } from '../shared/types.ts';
import { api, ApiError, session } from './api.ts';
import type { Identity } from './api.ts';

export type Phase = 'boot' | 'login' | 'game';
export type Drawer = null | 'messages' | 'leaderboard' | 'guide';

export interface Toast {
  id: number;
  tone: 'good' | 'bad' | 'info' | 'gold';
  title: string;
  body?: string;
  ttl: number;
}

export interface PoachMarker {
  name: string;
  buyerName: string;
  amount: number;
  until: number;
}

interface GameStore {
  phase: Phase;
  bootError: string | null;
  identities: Identity[];
  snapshot: StateSnapshot | null;
  conn: 'connecting' | 'live' | 'offline';
  lastSyncAt: number;
  clockOffset: number;
  toasts: Toast[];
  drawer: Drawer;
  marketOpen: boolean;
  introNonce: number;
  introPlaying: boolean;
  projectActive: boolean;
  /** 被挖走的工位：显示补偿提示（按桌位索引） */
  poachMarkers: Record<number, PoachMarker>;
  busy: Record<string, boolean>;

  boot: () => Promise<void>;
  loginAs: (playerId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void;
  dismissToast: (id: number) => void;
  setDrawer: (d: Drawer) => void;
  setMarketOpen: (v: boolean) => void;
  replayIntro: () => void;
  setIntroPlaying: (v: boolean) => void;
  setProjectActive: (v: boolean) => void;
  setBusy: (k: string, v: boolean) => void;
  handleEvent: (e: GameEvent) => void;
  setConn: (c: GameStore['conn']) => void;
}

let toastSeq = 1;
let refreshing: Promise<void> | null = null;
let refreshAgain = false;

export const useGame = create<GameStore>((set, get) => ({
  phase: 'boot',
  bootError: null,
  identities: [],
  snapshot: null,
  conn: 'connecting',
  lastSyncAt: 0,
  clockOffset: 0,
  toasts: [],
  drawer: null,
  marketOpen: typeof window !== 'undefined' ? window.innerWidth > 900 : true,
  introNonce: 0,
  introPlaying: false,
  projectActive: false,
  poachMarkers: {},
  busy: {},

  async boot() {
    set({ bootError: null });
    try {
      const { identities } = await api.identities();
      set({ identities });
      if (session.get()) {
        try {
          const snap = await api.state();
          set({ snapshot: snap, phase: 'game', lastSyncAt: Date.now(), clockOffset: snap.serverTime - Date.now() });
          get().replayIntro();
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) session.clear();
          else throw e;
        }
      }
      set({ phase: 'login' });
    } catch (e) {
      set({ bootError: e instanceof Error ? e.message : String(e) });
    }
  },

  async loginAs(playerId) {
    const { token } = await api.login(playerId);
    session.set(token);
    localStorage.setItem('boss.lastIdentity', playerId); // 仅用于登录页默认高亮，非游戏数据
    const snap = await api.state();
    set({
      snapshot: snap,
      phase: 'game',
      lastSyncAt: Date.now(),
      clockOffset: snap.serverTime - Date.now(),
      poachMarkers: {},
      toasts: [],
    });
    get().replayIntro();
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      /* 会话可能已失效，忽略 */
    }
    session.clear();
    set({ phase: 'login', snapshot: null, drawer: null, poachMarkers: {}, toasts: [], projectActive: false });
  },

  async refresh() {
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }
    refreshing = (async () => {
      try {
        do {
          refreshAgain = false;
          const snap = await api.state();
          set({ snapshot: snap, lastSyncAt: Date.now(), clockOffset: snap.serverTime - Date.now() });
        } while (refreshAgain);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          session.clear();
          set({ phase: 'login', snapshot: null });
          get().toast({ tone: 'info', title: '会话已失效', body: '数据可能已被重置，请重新选择测试身份。' });
        } else {
          set({ conn: 'offline' });
        }
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },

  toast(t) {
    const id = toastSeq++;
    const toast: Toast = { ttl: 5200, ...t, id };
    set((s) => ({ toasts: [...s.toasts.slice(-4), toast] }));
    setTimeout(() => get().dismissToast(id), toast.ttl);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setDrawer(d) {
    set({ drawer: d });
  },
  setMarketOpen(v) {
    set({ marketOpen: v });
  },
  replayIntro() {
    set((s) => ({ introNonce: s.introNonce + 1, introPlaying: true }));
  },
  setIntroPlaying(v) {
    set({ introPlaying: v });
  },
  setProjectActive(v) {
    set({ projectActive: v });
  },
  setBusy(k, v) {
    set((s) => ({ busy: { ...s.busy, [k]: v } }));
  },
  setConn(c) {
    set({ conn: c });
  },

  handleEvent(e) {
    const snap = get().snapshot;
    if (!snap) return;
    if (e.kind === 'reset') {
      get().toast({ tone: 'info', title: '演示数据已重置' });
      return;
    }
    if (e.kind !== 'trade') return;
    const me = snap.me.id;
    const nameOf = (id: string | null) => snap.players.find((p) => p.id === id)?.name ?? id ?? '系统';
    const t = e as TradeEvent;
    if (t.sellerId === me) {
      // 被挖角：收起遮挡画面的面板，让「起身 → 收拾纸箱 → 走进电梯」完整可见
      set({ marketOpen: false, drawer: null });
      if (t.previousDeskSlot != null) {
        set((s) => ({
          poachMarkers: {
            ...s.poachMarkers,
            [t.previousDeskSlot!]: { name: t.colleagueName, buyerName: nameOf(t.buyerId), amount: t.ownerShare, until: Date.now() + 14000 },
          },
        }));
      }
      get().toast({
        tone: 'bad',
        title: `😱 ${t.colleagueName} 被 ${nameOf(t.buyerId)} 挖走了！`,
        body: `成交价 ${t.price}，你获得 90% 补偿 +${t.ownerShare} 金币（向下取整）`,
        ttl: 8000,
      });
    }
    if (t.selfPlayerId === me && t.buyerId !== me) {
      get().toast({
        tone: 'gold',
        title: `🎉 分身分红 +${t.selfShare}`,
        body: `你的分身「${t.colleagueName}」被 ${nameOf(t.buyerId)} 以 ${t.price} 金币${t.sellerId ? '挖角' : '签约'}，你获得 5%`,
        ttl: 7000,
      });
    }
    if (t.buyerId !== me && t.sellerId !== me && t.selfPlayerId !== me) {
      get().toast({
        tone: 'info',
        title: `📣 ${nameOf(t.buyerId)} ${t.sellerId ? `从 ${nameOf(t.sellerId)} 手中挖走` : '签下'} ${t.colleagueName}`,
        body: `成交价 ${t.price} 金币`,
        ttl: 4000,
      });
    }
  },
}));

export function myTeam(snap: StateSnapshot | null) {
  if (!snap) return [];
  return snap.colleagues.filter((c) => c.ownerId === snap.me.id).sort((a, b) => (a.deskSlot ?? 0) - (b.deskSlot ?? 0));
}

export function serverNow(): number {
  return Date.now() + useGame.getState().clockOffset;
}
