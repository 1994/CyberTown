// 真实网页演示录制：启动独立的 Go 服务实例（临时数据库），用两个独立浏览器 context
// 扮演「老王」与「小李」完整走一遍 赚钱 → 签约 → 挖角 → 赚钱 → 分身分红 → 再挖回 的循环，
// 用 Playwright 录制两路真实页面视频，再用 ffmpeg 左右拼接成一个成片。
// 画面中的「🎥 演示步骤」字幕条由本脚本注入，仅用于说明当前步骤，不属于游戏 UI。
//
// 用法：npm run build && npm run demo:record
// 产物：artifacts/demo/boss-demo-2p.mp4（拼接成片）、artifacts/demo/raw/*.webm（原始录像）
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = process.env.DEMO_PORT ?? '8898';
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = resolve('artifacts/demo');
const RAW = join(OUT, 'raw');
const SIZE = { width: 1280, height: 800 };
let recordingBrowser: Browser | undefined;

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const server = spawn(process.execPath, ['scripts/start-e2e-server.ts'], {
  env: { ...process.env, E2E_PORT: PORT },
  stdio: 'ignore',
});
const stopServer = () => server.kill('SIGTERM');
process.on('exit', stopServer);

async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('demo server did not start');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function caption(page: Page, who: string, step: string) {
  await page.evaluate(
    ([w, s]) => {
      let el = document.getElementById('demo-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'demo-caption';
        el.style.cssText =
          'position:fixed;left:16px;top:318px;z-index:9999;max-width:300px;padding:10px 14px;border-radius:12px;background:rgba(0,0,0,.72);color:#fff;font:600 14px/1.5 "PingFang SC",sans-serif;border:1px solid rgba(255,255,255,.25);pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.4)';
        document.body.appendChild(el);
      }
      el.innerHTML = `<div style="color:#3ef0ff;font-size:12px">🎥 演示步骤 · ${w}</div>${s}`;
    },
    [who, step],
  );
}

async function login(page: Page, id: string) {
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.getByTestId(`identity-${id}`).click();
  await page.waitForTimeout(700);
  await page.getByTestId('login-enter').click();
}

async function sign(page: Page, colleagueId: string, holdMs = 3200) {
  if (!(await page.getByTestId('market').isVisible())) {
    await page.getByTestId('btn-open-market').click();
    await page.waitForTimeout(600);
  }
  const card = page.getByTestId(`mcard-${colleagueId}`);
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await page.waitForTimeout(700);
  await page.getByTestId(`sign-${colleagueId}`).click();
  await page.waitForTimeout(holdMs); // 让观众看清分账明细
  await page.getByTestId('confirm-trade-ok').click();
  await page.getByTestId('confirm-trade').waitFor({ state: 'hidden' });
}

/** 真实游玩 15 秒紧急项目：像人一样点击任务卡（偶尔漏掉），不点大饼 */
async function playProject(page: Page) {
  await page.getByTestId('btn-project').click();
  await page.waitForTimeout(2500);
  await page.getByTestId('btn-project-start').click();
  let n = 0;
  const deadline = Date.now() + 45_000;
  while (!(await page.getByTestId('project-result').isVisible().catch(() => false))) {
    if (Date.now() > deadline) throw new Error('项目结算超过45秒，停止录制并检查界面');
    const task = page.locator('.task:not(.trap)').first();
    if (await task.isVisible().catch(() => false)) {
      n++;
      if (n % 9 !== 0) await task.dispatchEvent('pointerdown').catch(() => undefined);
      await page.waitForTimeout(260 + ((n * 37) % 200));
    } else await page.waitForTimeout(120);
  }
  await page.waitForTimeout(3500);
  await page.getByTestId('btn-project-close').click();
}

async function main() {
  await waitHealthy();
  await fetch(`${BASE}/api/demo/reset`, { method: 'POST' });
  const browser = recordingBrowser = await chromium.launch({ channel: process.env.DEMO_CHANNEL ?? 'chrome' });
  const mk = () => browser.newContext({ viewport: SIZE, recordVideo: { dir: RAW, size: SIZE } });
  const ctxA = await mk();
  const ctxB = await mk();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errors: string[] = [];
  for (const [p, n] of [
    [A, 'A'],
    [B, 'B'],
  ] as const) {
    p.on('pageerror', (e) => errors.push(`${n} ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${n} ${m.text()}`));
  }
  const t0 = Date.now();
  const mark = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

  // 1. 登录 + 入场电影镜头
  mark('登录');
  await Promise.all([login(A, 'wang'), login(B, 'li')]);
  await caption(A, '窗口 A · 老王', '① 测试身份登录（非 SSO）→ 入场电影镜头：城市夜景 → 掠过工位 → 霓虹电梯 → 归位');
  await caption(B, '窗口 B · 小李', '① 独立浏览器 context 登录「小李」，同样播放入场镜头');
  await sleep(10_500);
  await caption(A, '窗口 A · 老王', '② 新手指引：赚钱 → 招募 → 挖角 → 分身分红，附双人演示步骤');
  await sleep(6000);
  await A.locator('.drawer-body').evaluate((el) => el.scrollTo({ top: 400, behavior: 'smooth' }));
  await sleep(4000);
  await A.getByTestId('guide-close').click();
  await B.getByTestId('guide-close').click();

  // 2. A 签约张总
  mark('A 签约张总');
  await caption(A, '窗口 A · 老王', '③ 人才市场签约「张总」：初签 300，确认框列出资金去向（无原持有人 → 95% 系统回收，5% 给分身本人）');
  await caption(B, '窗口 B · 小李', '③ 观察：老王签约后 3 秒内，这里的市场/排行/消息同步更新');
  await sign(A, 'c-zhang', 4200);
  await caption(A, '窗口 A · 老王', '④ 签约演出：张总从电梯出来 → 走到 1 号工位 → 坐下 → 彩纸 + 技能激活（收益 +25%）');
  await sleep(13_000);
  await B.getByTestId('mcard-c-zhang').scrollIntoViewIfNeeded();
  await B.getByTestId('mcard-c-zhang').hover();
  await caption(B, '窗口 B · 小李', '⑤ 张总现属老王，挖角价 ⌈300×1.25/10⌉×10 = 380');
  await sleep(3000);

  // 3. B 挖角张总
  mark('B 挖角张总');
  await caption(B, '窗口 B · 小李', '⑥ 挖角张总 380：原持有人 90% = 342，分身本人 5% = 19（虚拟同事钱包），系统 19');
  await caption(A, '窗口 A · 老王', '⑥ 小李正在挖角……');
  await sign(B, 'c-zhang', 4500);
  await caption(A, '窗口 A · 老王', '⑦ 被挖角演出：张总起身 → 收拾纸箱 → 抱箱走向电梯离场；空工位显示补偿 +342（600−300+342=642）');
  await caption(B, '窗口 B · 小李', '⑦ 张总从电梯走进小李的办公室并激活技能（B 余额 220）');
  await sleep(16_000);

  // 4. B 赚钱
  mark('B 紧急项目');
  await caption(B, '窗口 B · 小李', '⑧ 余额 220 不够签 300：接 15 秒紧急项目赚钱（张总技能：收益 +25%）。服务器记录起止时间并重算奖励');
  await caption(A, '窗口 A · 老王', '⑧ 等待小李赚钱……排行榜实时变化');
  await playProject(B);

  // 5. B 签老王分身 → A 分红
  mark('B 签老王分身');
  await caption(B, '窗口 B · 小李', '⑨ 签约「老王(分身)」300：老王本人作为分身本人获得 5% = 15');
  await caption(A, '窗口 A · 老王', '⑨ 我的分身被签约 → 真实到账 +15 分红（642 → 657）');
  await sign(B, 'c-wang', 3500);
  await sleep(7000);
  await caption(A, '窗口 A · 老王', '⑩ 消息中心：被挖角补偿、分身分红均有记录');
  await A.getByTestId('btn-messages').click();
  await sleep(5500);
  await A.keyboard.press('Escape');
  await A.getByRole('button', { name: /排行/ }).click();
  await caption(A, '窗口 A · 老王', '⑪ 团队资产排行榜 = 金币 + 队员身价');
  await sleep(4500);
  await A.keyboard.press('Escape');

  // 6. A 挖回张总 480
  mark('A 挖回张总');
  await caption(A, '窗口 A · 老王', '⑫ 用 657 把张总挖回来：380 → 480（⌈380×1.25/10⌉×10）');
  await caption(B, '窗口 B · 小李', '⑫ 老王挖回张总 → 小李获得 90% = 432 补偿，张总收拾纸箱离开');
  await sign(A, 'c-zhang', 3500);
  await sleep(14_000);

  // 7. A 再做一个项目，收尾
  mark('A 紧急项目');
  await caption(A, '窗口 A · 老王', '⑬ 带着张总（+25%）再接一单紧急项目，结算界面展示技能加成（向下取整）');
  await caption(B, '窗口 B · 小李', '⑬ 小李的办公室：老王分身在工位上打工');
  await playProject(A);
  // 额外演示时间技能：B有挖回补偿，足够支付300；展示18秒真实挑战，
  // 让3—4分钟成片包含有效操作，而非靠片尾静帧补时。
  if (Date.now() - t0 < 170_000) {
  mark('B 招募时间技能 Lily');
  await caption(B, '窗口 B · 小李', '⑭ 用转会补偿招募 Lily（300）：时间管理让下一轮挑战从15秒延长到18秒');
  await caption(A, '窗口 A · 老王', '⑭ 观察小李招募时间技能：市场和排行榜继续实时同步');
  await sign(B, 'c-lily', 4200);
  await sleep(14000);
  await caption(B, '窗口 B · 小李', '⑮ 带 Lily 实际完成18秒项目，结算时可核对时长技能与收益加成');
  await playProject(B);
  }
  await caption(A, '窗口 A · 老王', '⑯ 「🎬 片头」按钮可随时重播入场镜头（可跳过）');
  await A.getByTestId('btn-replay-intro').click();
  await sleep(5000);
  if (await A.getByTestId('btn-skip-intro').isVisible()) {
    await A.getByTestId('btn-skip-intro').click({ timeout: 1500 }).catch(() => undefined);
  }
  await caption(A, '窗口 A · 老王', '完整循环：赚钱 → 招募 → 挖角 → 分红 → 再挖角 ✅');
  await caption(B, '窗口 B · 小李', '完整循环：赚钱 → 招募 → 挖角 → 分红 → 再挖角 ✅');
  await sleep(4000);
  mark('结束');
  const recordedWallSeconds = (Date.now() - t0) / 1000;

  const videoA = A.video()!;
  const videoB = B.video()!;
  await ctxA.close();
  await ctxB.close();
  const vA = await videoA.path();
  const vB = await videoB.path();
  await browser.close();
  renameSync(vA, join(RAW, 'player-A-laowang.webm'));
  renameSync(vB, join(RAW, 'player-B-xiaoli.webm'));
  console.log('page errors:', errors.length ? errors : '无');

  // 左右拼接成片（H.264，1920×600）
  const out = join(OUT, 'boss-demo-2p.mp4');
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    join(RAW, 'player-A-laowang.webm'),
    '-i',
    join(RAW, 'player-B-xiaoli.webm'),
    '-filter_complex',
    '[0:v][1:v]hstack=inputs=2,scale=1920:-2,fps=30[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '24',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out,
  ]);
  const singleA = join(OUT, 'boss-demo-player-A.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(RAW, 'player-A-laowang.webm'), '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', singleA]);
  for (const f of readdirSync(OUT)) {
    const p = join(OUT, f);
    if (statSync(p).isFile()) console.log(`${p}  ${(statSync(p).size / 1e6).toFixed(1)} MB`);
  }
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out], { encoding: 'utf8' }).trim());
  writeFileSync(join(OUT, 'recording-report.json'), JSON.stringify({ durationSeconds: duration, recordedWallSeconds, consoleErrors: errors, finalVideo: 'artifacts/demo/boss-demo-2p.mp4', singlePlayerVideo: 'artifacts/demo/boss-demo-player-A.mp4' }, null, 2) + '\n');
  if (duration < 180 || duration > 240) throw new Error(`成片${duration}秒，未满足3—4分钟要求`);
  if (errors.length) throw new Error('录制中出现浏览器错误，请检查recording-report.json');
  console.log(`成片实际时长 ${duration.toFixed(1)} 秒（不含编码耗时）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await recordingBrowser?.close().catch(() => undefined);
    stopServer();
  });
