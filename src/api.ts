import type { ProjectAction, ProjectResult } from '../shared/rules.ts';
import type { ProjectRunView, StateSnapshot, TradeEvent } from '../shared/types.ts';

const TOKEN_KEY = 'boss.session';

/** 会话 token 只存 sessionStorage（每个标签页/浏览器独立身份，刷新可继续）。游戏数据全部来自服务端。 */
export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = session.get();
  let res: Response;
  try {
    res = await fetch(path, {
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
    throw new ApiError(res.status, err?.code ?? 'HTTP_' + res.status, err?.message ?? `请求失败（${res.status}）`);
  }
  return data as T;
}

export interface Identity {
  id: string;
  name: string;
  title: string;
  color: string;
  avatarColleagueId: string | null;
}

export const api = {
  identities: () => call<{ identities: Identity[]; notice: string }>('GET', '/api/identities'),
  login: (playerId: string) => call<{ token: string; playerId: string }>('POST', '/api/auth/test-login', { playerId }),
  logout: () => call<{ ok: true }>('POST', '/api/logout'),
  state: () => call<StateSnapshot>('GET', '/api/state'),
  sign: (colleagueId: string, expectedPrice: number) =>
    call<{ trade: TradeEvent; coins: number }>('POST', `/api/colleagues/${colleagueId}/sign`, { expectedPrice }),
  startProject: () => call<{ run: ProjectRunView; serverTime: number }>('POST', '/api/project/start'),
  finishProject: (runId: string, actions: ProjectAction[]) =>
    call<{ result: ProjectResult; coins: number }>('POST', '/api/project/finish', { runId, actions }),
  markRead: () => call<{ ok: true }>('POST', '/api/messages/read'),
};
