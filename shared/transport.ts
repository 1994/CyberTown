/** Deployment-neutral HTTP boundary. No React, Go source, or build-time secrets. */
export function normalizeApiBase(value: unknown): string {
  if (typeof value !== 'string') throw new Error('apiBaseUrl 必须是字符串');
  const base = value.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (base.startsWith('/') && !base.startsWith('//')) {
    if (/[?#\\\s]/.test(base)) throw new Error('apiBaseUrl 路径无效');
    return base;
  }
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('apiBaseUrl 必须是无凭证、查询参数或片段的 HTTP(S) 地址');
  }
  return url.toString().replace(/\/+$/, '');
}

export function endpoint(base: string, path: string): string {
  if (!path.startsWith('/api/')) throw new Error('API path must begin with /api/');
  return base + path;
}
