import { create } from 'zustand';
import type { TeaRole, TeaWorker } from '../../shared/tea.ts';

/** Scene projection of the current player's actual preparation/live roster. */
export const useShopRoster = create<{ ownerId: string | null; workers: (TeaWorker & { role: TeaRole })[] }>(() => ({ ownerId: null, workers: [] }));
