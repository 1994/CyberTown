import type { TeaFrame, TeaHome, TeaPlan, TeaRole, TeaRun } from './tea.ts';
import type { TeaMission, TeaWallet } from './teaTown.ts';
import type { TownExploration } from './townExplore.ts';

export type TeaLesson = 'solo' | 'duo' | 'rush' | 'free' | 'rescue';
export type TeaChapterStage = 'solo' | 'duo' | 'rush' | 'upgrade' | 'complete';
export type TeaWorkRole = 'cashier' | 'maker';

export interface TeaChapter {
  stage: TeaChapterStage;
  soloBest: number;
  duoBest: number;
  activeSessionId: string | null;
}

export interface TeaLiveHome extends TeaHome {
  exploration?: TownExploration;
  chapter: TeaChapter;
  mission: TeaMission;
  wallet: TeaWallet;
}

export interface TeaLiveCustomer {
  id: number;
  state: 'cashier' | 'ordering' | 'maker' | 'making' | 'served' | 'lost';
  at: number;
  workerId?: string;
}

export interface TeaLiveWorker {
  id: string;
  role: TeaRole | 'idle';
  customerId?: number;
  progress: number;
}

export interface TeaSelfTask {
  role: TeaWorkRole | 'idle';
  done: number;
  remaining: number;
  queuedRole: TeaWorkRole | null;
}

export interface TeaLiveFrame extends TeaFrame {
  customersState: TeaLiveCustomer[];
  workersState: TeaLiveWorker[];
  selfTask: TeaSelfTask;
}

export interface TeaCommand {
  t: number;
  role: TeaWorkRole;
}

export interface TeaSession {
  id: string;
  lesson: TeaLesson;
  status: 'active' | 'finished';
  revision: number;
  t: number;
  run: TeaRun;
  frame: TeaLiveFrame;
  commands: TeaCommand[];
  hold: number;
}

export interface TeaOpenSession {
  plan: TeaPlan;
  lesson: TeaLesson;
  mode: 'practice' | 'official';
  idempotencyKey: string;
}

export interface TeaStep {
  revision: number;
  advance: number;
  assign?: TeaWorkRole;
  requestId: string;
}
