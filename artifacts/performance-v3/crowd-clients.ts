// Reproducible local QA load. Synthetic users only; use the QA identity adapter.
const base = process.env.LOAD_BASE ?? 'http://127.0.0.1:8806';
const count = Number(process.env.LOAD_COUNT ?? 100);
const abort = new AbortController();
process.on('SIGINT', () => abort.abort());
process.on('SIGTERM', () => abort.abort());
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function call(path: string, token: string, body?: unknown) {
 const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: abort.signal });
 const data = await r.json(); if (!r.ok) throw new Error(`${path}: ${r.status}`); return data;
}
const clients: { token: string; x: number; z: number }[] = [];
for (let i = 0; i < count; i++) {
 const { token, playerId } = await call('/api/auth/login', '', { accessToken: `perf-fake-${String(i).padStart(3, '0')}` });
 const stream = await fetch(base + `/api/events?world=2&token=${encodeURIComponent(token)}`, { signal: abort.signal });
 void (async () => { try { for await (const _ of stream.body!) { /* drain */ } } catch {} })();
 const w = await call('/api/world', token), p = w.players.find((p: { id: string }) => p.id === playerId);
 clients.push({ token, x: p.x, z: p.z });
}
console.log(`${count} synthetic HTTP/SSE clients ready`);
await sleep(150);
let failures = 0, tick = 0;
try {
 while (!abort.signal.aborted) {
  const start = performance.now(); tick++;
  await Promise.all(clients.map(async (c, i) => {
   try { await call('/api/world/move', c.token, { x: c.x + Math.sin(tick * .1 + i) * .4, z: c.z + Math.cos(tick * .1 + i) * .4, yaw: tick * .1 + i, moving: true }); }
   catch { if (!abort.signal.aborted) failures++; }
  }));
  await sleep(Math.max(10, 200 - (performance.now() - start)));
 }
} catch (e) { if (!abort.signal.aborted) throw e; }
console.log(`stopped; movement failures=${failures}`);
