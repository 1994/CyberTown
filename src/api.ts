import type { ProjectAction } from '../shared/rules.ts';
import type {
  Career,
  EmoteKind,
  FinishResponse,
  PromotionEvent,
  ProjectRunView,
  StateSnapshot,
  TradeEvent,
  WorldPlayer,
  WorldSnapshot,
} from '../shared/types.ts';

import { apiURL, sessionKey } from './runtime-config.ts';

/** 会话 token 只存 sessionStorage（每个标签页/浏览器独立身份，刷新可继续）。游戏数据全部来自服务端。 */
export const session = {
  get: () => sessionStorage.getItem(sessionKey()),
  set: (t: string) => sessionStorage.setItem(sessionKey(), t),
  clear: () => sessionStorage.removeItem(sessionKey()),
};

export class ApiError extends Error {
  status: number;
  code: string;
  body: unknown;
  constructor(
    status: number,
    code: string,
    message: string,
    body: unknown = null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = session.get();
  let res: Response;
  try {
    res = await fetch(apiURL(path), {
      credentials: 'omit',
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', '网络连接失败，请检查服务是否启动');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_' + res.status,
      err?.message ?? `请求失败（${res.status}）`,
      data,
    );
  }
  return data as T;
}

export interface Identity {
  avatarUrl?: string;
  id: string;
  name: string;
  title: string;
  color: string;
  avatarColleagueId: string | null;
}

/** 凭证由身份适配器验证；code / accessToken 按公司协议选择，不传姓名或头像。 */
export interface LoginCredentials {
  code?: string;
  accessToken?: string;
  redirectUri?: string;
  state?: string;
  playerId?: string; // 仅内置 Demo 适配器使用
}

export const api = {
  identities: () =>
    call<{
      identities: Identity[];
      notice: string;
      mode?: 'demo' | 'sso' | 'mock';
      provider?: string;
      browserLogin?: boolean;
      loginCallbackUrl?: string;
    }>('GET', '/api/identities'),
  login: (playerId: string) =>
    call<{ token: string; playerId: string }>('POST', '/api/auth/test-login', {
      playerId,
    }),
  authenticate: (credentials: LoginCredentials) =>
    call<{ token: string; playerId: string }>('POST', '/api/auth/login', credentials),
  beginBrowserLogin: () => call<{ url: string; state: string }>('POST', '/api/auth/browser'),
  logout: () => call<{ ok: true }>('POST', '/api/logout'),
  state: () => call<StateSnapshot>('GET', '/api/state'),
  setAvatar: (avatarUrl: string) =>
    call<{ ok: true }>('POST', '/api/profile/avatar', { avatarUrl }),
  sign: (colleagueId: string, expectedPrice: number) =>
    call<{ trade: TradeEvent; coins: number }>(
      'POST',
      `/api/colleagues/${colleagueId}/sign`,
      { expectedPrice },
    ),
  startProject: () =>
    call<{ run: ProjectRunView; serverTime: number }>(
      'POST',
      '/api/project/start',
    ),
  finishProject: (runId: string, actions: ProjectAction[]) =>
    call<FinishResponse>('POST', '/api/project/finish', { runId, actions }),
  promote: (expectedRank: number) =>
    call<{ promotion: PromotionEvent; career: Career }>(
      'POST',
      '/api/career/promote',
      { expectedRank },
    ),
  buyItem: (itemId: string, expectedPrice: number) =>
    call<{ ok: true }>('POST', '/api/shop/buy', { itemId, expectedPrice }),
  equipItem: (itemId: string, kind: string, target: 'player' | 'boss') =>
    call<{ ok: true }>('POST', '/api/shop/equip', { itemId, kind, target }),
  markRead: () => call<{ ok: true }>('POST', '/api/messages/read'),
  // ── 多人园区 ──
  world: () => call<WorldSnapshot>('GET', '/api/world'),
  move: (m: { x: number; z: number; yaw: number; moving: boolean }) =>
    call<{ player: WorldPlayer }>('POST', '/api/world/move', m),
  social: (s: { emote?: EmoteKind; text?: string }) =>
    call<{ player: WorldPlayer }>('POST', '/api/world/social', s),
  highfive: (targetId: string) =>
    call<{ reward: number; cooldownUntil: number }>(
      'POST',
      '/api/world/highfive',
      { targetId },
    ),
};
