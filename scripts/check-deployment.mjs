// Exercises the legacy make up/stop controller in an isolated directory.
// Never reads or signals this checkout's .run/server.json or player database.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'boss-controller-check-'));
const controller = path.join(scratch, 'scripts/server.mjs');
let started = false;
try {
  for (const dir of ['scripts', 'bin', 'dist']) mkdirSync(path.join(scratch, dir));
  cpSync(path.join(root, 'scripts/server.mjs'), controller);
  writeFileSync(path.join(scratch, 'dist/index.html'), '<!doctype html><title>isolated web fixture</title>');
  execFileSync('go', ['build', '-o', path.join(scratch, 'bin/boss-server'), './cmd/boss-server'], { cwd: root, stdio: 'inherit' });
  const portServer = createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const { port } = portServer.address();
  await new Promise(resolve => portServer.close(resolve));
  const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_ENV: 'test', AUTH_MODE: 'demo', DB_PATH: path.join(scratch, 'fixture.db'), STATIC_DIR: '', CORS_ALLOWED_ORIGINS: '', ALLOW_DEMO_RESET: '0' };
  const command = action => execFileSync(process.execPath, [controller, action], { cwd: scratch, env, encoding: 'utf8' });
  command('up'); started = true;
  const state = JSON.parse(readFileSync(path.join(scratch, '.run/server.json'), 'utf8'));
  assert.match(command('status'), /运行中/);
  assert.equal((await fetch(state.url + '/api/health')).status, 200);
  assert.match(await (await fetch(state.url)).text(), /isolated web fixture/);
  assert.match(command('down'), /数据库已保留/); started = false;
  assert.ok(readFileSync(path.join(scratch, 'fixture.db')).length > 0);
  assert.match(command('down'), /服务未运行/);
  console.log('独立目录：Go构建、后台启动、静态托管、健康检查、状态、停止与数据保留全部通过。');
} finally {
  if (started) execFileSync(process.execPath, [controller, 'down'], { cwd: scratch, stdio: 'inherit' });
  rmSync(scratch, { recursive: true, force: true });
}
