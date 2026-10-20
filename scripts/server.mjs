// Local deployment helper for macOS/Linux. Runtime state never enters Git.
import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.run');
const stateFile = path.join(runtime, 'server.json');
const logFile = path.join(runtime, 'server.log');
const lockDir = path.join(runtime, 'control.lock');
const binary = path.join(root, 'bin/boss-server');
process.chdir(root);
mkdirSync(runtime, { recursive: true });

function config() {
  const result = { ...process.env };
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator).trim();
      if (!result[key]) result[key] = trimmed.slice(separator + 1).trim().replace(/^["']+|["']+$/g, '');
    }
  }
  // Match the Go CLI defaults and .env/environment precedence.
  return { ...result, HOST: result.HOST || '127.0.0.1', PORT: result.PORT || '8787' };
}

function readState() {
  if (!existsSync(stateFile)) return null;
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (!Number.isSafeInteger(state.pid) || state.pid <= 1) throw new Error('无效的 .run/server.json，请检查后移走该文件。');
  return state;
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

function owned(state) {
  if (!alive(state.pid)) return false;
  let command;
  try { command = execFileSync('ps', ['-p', String(state.pid), '-o', 'command='], { encoding: 'utf8' }).trim(); }
  catch { return false; }
  // Never signal a recycled PID belonging to an unrelated process.
  if (command !== binary && !command.startsWith(`${binary} `)) {
    throw new Error(`PID ${state.pid} 已不属于此项目；未终止该进程。请检查并移走 .run/server.json。`);
  }
  return true;
}

async function stop() {
  const state = readState();
  if (!state || !owned(state)) {
    rmSync(stateFile, { force: true });
    console.log('服务未运行。');
    return;
  }
  process.kill(state.pid, 'SIGTERM');
  for (let attempt = 0; attempt < 80; attempt++) {
    if (!alive(state.pid)) {
      rmSync(stateFile, { force: true });
      console.log('服务已停止，数据库已保留。');
      return;
    }
    await delay(100);
  }
  throw new Error(`服务 ${state.pid} 未在 8 秒内退出，请查看 make logs。`);
}

async function start() {
  if (!existsSync(binary) || !existsSync(path.join(root, 'dist/index.html'))) {
    throw new Error('缺少构建产物，请先运行 make up。');
  }
  const env = config();
  const host = env.HOST === '0.0.0.0' ? '127.0.0.1' : env.HOST === '::' ? '::1' : env.HOST;
  const url = `http://${host.includes(':') ? `[${host}]` : host}:${env.PORT}`;
  // Check before spawning: some systems allow overlapping wildcard/specific
  // bindings, in which case a health request could hit the existing service.
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host, port: Number(env.PORT) });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); reject(new Error(`端口 ${env.PORT} 已被占用，请停止占用进程或使用 PORT=其他端口 make up。`)); });
    socket.once('error', (error) => { socket.destroy(); if (error.code === 'ECONNREFUSED') resolve(); else reject(error); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`无法确认 ${url} 的端口状态，请检查 HOST / PORT 配置。`)); });
  });
  appendFileSync(logFile, `\n--- ${new Date().toISOString()} start ---\n`);
  const log = openSync(logFile, 'a');
  const child = spawn(binary, [], { cwd: root, env, detached: true, stdio: ['ignore', log, log] });
  closeSync(log);
  let exited = false;
  child.on('exit', () => { exited = true; });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const state = { pid: child.pid, url, startedAt: new Date().toISOString() };
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  child.unref();
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      await delay(200);
      if (exited || !alive(child.pid)) throw new Error('服务进程启动后退出，可能是端口被占用。');
      try {
        const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) });
        const health = await response.json();
        if (response.ok && health.ok && health.runtime === 'go') {
          // A busy port may briefly serve another process while this child exits.
          await delay(200);
          if (exited || !alive(child.pid)) throw new Error('服务进程已退出。');
          console.log(`服务已启动：${url}\nPID: ${child.pid}\n日志：make logs\n停止：make stop`);
          return;
        }
      } catch { /* Retry until this child's health endpoint is ready. */ }
    }
    throw new Error('服务健康检查超时。');
  } catch (error) {
    await stop();
    console.error(readFileSync(logFile, 'utf8').split('\n').slice(-15).join('\n'));
    throw error;
  }
}

async function main() {
  const action = process.argv[2];
  if (action === 'status') {
    const state = readState();
    if (state && owned(state)) console.log(`运行中：${state.url}\nPID: ${state.pid}\n启动时间：${state.startedAt}`);
    else { console.log('服务未运行，使用 make up 启动。'); process.exitCode = 1; }
    return;
  }
  if (action === 'logs') {
    if (!existsSync(logFile)) { console.log('暂无日志，使用 make up 启动。'); return; }
    const tail = spawn('tail', ['-n', '80', '-f', logFile], { stdio: 'inherit' });
    tail.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    return;
  }
  if (!['up', 'down'].includes(action)) throw new Error('用法：node scripts/server.mjs up|down|status|logs');
  try { mkdirSync(lockDir); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('另一个启动/停止操作正在进行；如上次操作被强行中断，请移走 .run/control.lock 后重试。');
    throw error;
  }
  try {
    await stop();
    if (action === 'up') await start();
  } finally { rmSync(lockDir, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
