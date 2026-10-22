import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBeTruthy();
});

type PlainSnapshot = {
  me: { name: string; avatarUrl?: string; avatarColleagueId: string | null; [key: string]: unknown };
  colleagues: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

test('demo 身份先确认姓名与头像，进入小镇前不挂载世界，刷新可恢复', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lowfx=1');
  await page.getByTestId('identity-wang').click();

  await expect(page.getByTestId('welcome-profile')).toBeVisible();
  await expect(page.getByTestId('welcome-profile')).toContainText('老王');
  await expect(page.getByTestId('enter-town')).toBeVisible();
  await expect(page.getByTestId('town-world')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('welcome-profile')).toContainText('老王');
  await expect(page.getByTestId('enter-town')).toBeVisible();
  await expect(page.getByTestId('town-world')).toHaveCount(0);

  await page.getByTestId('enter-town').click();
  await expect(page.getByTestId('town-world')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('town-world')).toBeVisible();
  await expect(page.getByTestId('enter-town')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('企业 SPI 假 fixture：SSO 姓名与坏头像回退，不显示 demo 身份列表', async ({ page, request }) => {
  // 使用现有 demo state 作为结构完整的假快照，仅替换姓名与头像；
  // 浏览器登录/state 全部由 route 拦截，明确不是真实企业 SSO。
  const login = await request.post('/api/auth/test-login', { data: { playerId: 'wang' } });
  expect(login.ok()).toBeTruthy();
  const origin = new URL(login.url()).origin;
  const token = (await login.json() as { token: string }).token;
  const stateRes = await request.get('/api/state', { headers: { authorization: `Bearer ${token}` } });
  expect(stateRes.ok()).toBeTruthy();
  const snapshot = await stateRes.json() as PlainSnapshot;
  expect(snapshot.colleagues.length).toBeGreaterThan(0);
  snapshot.me.name = '企业员工';
  snapshot.me.avatarUrl = '/__sso_broken_avatar__.png';
  snapshot.me.avatarColleagueId = snapshot.colleagues[0].id;

  let avatarRequested = false;
  let ssoCallback: { code?: string; state?: string; redirectUri?: string } | null = null;
  await page.route('**/__sso_broken_avatar__.png', (route) => {
    avatarRequested = true;
    return route.abort();
  });
  await page.route('**/api/identities', (route) => route.fulfill({
    json: {
      identities: [],
      notice: '企业内网 SPI 前端联调 fixture（非真实企业登录）',
      provider: 'fixture',
      mode: 'sso',
      browserLogin: true,
      loginCallbackUrl: `${origin}/?boss_auth=callback`,
    },
  }));
  await page.route('**/api/auth/browser', (route) => route.fulfill({
    json: {
      url: `${origin}/?boss_auth=callback&code=fake-sso-code&state=fake-sso-state`,
      state: 'fake-sso-state',
    },
  }));
  await page.route('**/api/auth/login', (route) => {
    ssoCallback = route.request().postDataJSON() as { code?: string; state?: string; redirectUri?: string };
    return route.fulfill({ json: { token: 'fake-sso-token', playerId: 'wang' } });
  });
  await page.route('**/api/state', (route) => route.fulfill({ json: snapshot }));

  await page.goto('/?lowfx=1');
  await expect(page.getByTestId('company-login')).toBeVisible();
  await expect(page.locator('.sso-line')).toContainText('非真实企业');
  await expect(page.locator('[data-testid^="identity-"]')).toHaveCount(0);

  await page.getByTestId('company-login').click();
  await expect(page.getByTestId('welcome-profile')).toBeVisible();
  await expect(page.getByTestId('welcome-profile')).toContainText('企业员工');
  await expect(page.getByTestId('enter-town')).toBeVisible();
  await expect(page.getByTestId('town-world')).toHaveCount(0);
  await expect(page.getByTestId('switch-identity')).toHaveCount(0);
  await expect(page.locator('[data-testid^="identity-"]')).toHaveCount(0);

  await expect(page.getByTestId('welcome-profile').locator('svg.avatar')).toBeVisible();
  expect(avatarRequested).toBe(true);
  expect(ssoCallback).toEqual({
    code: 'fake-sso-code',
    state: 'fake-sso-state',
    redirectUri: `${origin}/?boss_auth=callback`,
  });
});
