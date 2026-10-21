import { endpoint, normalizeApiBase } from '../shared/transport.ts';

let apiBase = '';

/** Loaded before React starts. Deploy the exact same dist to test or intranet. */
export async function loadRuntimeConfig() {
  const response = await fetch('/runtime-config.json', { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('无法读取 runtime-config.json，请检查前端部署配置');
  const config: unknown = await response.json();
  if (!config || typeof config !== 'object' || !('apiBaseUrl' in config)) throw new Error('runtime-config.json 缺少 apiBaseUrl');
  apiBase = normalizeApiBase(config.apiBaseUrl);
}
export const apiURL = (path: string) => endpoint(apiBase, path);
export const sessionKey = () => apiBase ? `boss.session:${apiBase}` : 'boss.session';
