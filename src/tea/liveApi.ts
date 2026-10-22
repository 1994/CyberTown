import type {
  TeaLiveHome,
  TeaOpenSession,
  TeaSession,
  TeaStep,
} from '../../shared/teaLive.ts';
import { ApiError, session } from '../api.ts';
import { apiURL } from '../runtime-config.ts';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
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

export const teaLiveApi = {
  home: () => call<TeaLiveHome>('GET', '/api/tea/home'),
  open: (input: TeaOpenSession) =>
    call<TeaSession>('POST', '/api/tea/sessions', input),
  get: (id: string) =>
    call<TeaSession>('GET', `/api/tea/sessions/${encodeURIComponent(id)}`),
  step: (id: string, input: TeaStep) =>
    call<TeaSession>('POST', `/api/tea/sessions/${encodeURIComponent(id)}/step`, input),
  acceptMission: () =>
    call<TeaLiveHome>('POST', '/api/tea/mission/accept', {}),
};
