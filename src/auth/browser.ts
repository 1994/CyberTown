import type { LoginCredentials } from '../api.ts';
import { sessionKey } from '../runtime-config.ts';

// Strip the authorization code before assets/API calls can carry the callback
// URL as a referrer. Game session tokens are never accepted from URL parameters.
function captureCallback(): { credentials?: LoginCredentials; error?: string } | null {
  const url = new URL(location.href);
  if (url.searchParams.get('boss_auth') !== 'callback') return null;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const rejected = url.searchParams.has('error');
  for (const key of ['boss_auth', 'code', 'state', 'error', 'error_description', 'error_uri']) url.searchParams.delete(key);
  history.replaceState(history.state, '', url);
  return !rejected && code && state
    ? { credentials: { code, state } }
    : { error: '身份认证未完成，请重新从公司登录入口进入' };
}
let callback = captureCallback();
export function rememberBrowserLogin(state: string) {
  if (!state) throw new Error('登录服务未返回有效的state');
  sessionStorage.setItem(sessionKey() + '.browser-state', state);
}
export function takeBrowserCallback() {
  const result = callback;
  callback = null;
  if (result) {
    const expected = sessionStorage.getItem(sessionKey() + '.browser-state');
    sessionStorage.removeItem(sessionKey() + '.browser-state');
    if (!expected || result.credentials?.state !== expected) return { error: '登录回调与当前标签页不匹配，请重新登录' };
  }
  return result;
}
