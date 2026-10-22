import { useState } from 'react';
import { useGame } from '../store.ts';
import { api, ApiError } from '../api.ts';
import { rememberBrowserLogin } from '../auth/browser.ts';
import { ArrowRight, Crown, Sparkles } from 'lucide-react';

export function Login() {
  const identities = useGame((s) => s.identities);
  const identityMode = useGame((s) => s.identityMode);
  const identityNotice = useGame((s) => s.identityNotice);
  const browserLogin = useGame((s) => s.browserLogin);
  const loginAs = useGame((s) => s.loginAs);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferred =
    new URLSearchParams(location.search).get('as') ??
    localStorage.getItem('boss.lastIdentity');

  const enter = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await loginAs(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '进不去，请重试');
      setBusy(null);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-shell">
      <div className="login-card panel">
        <span className="login-kicker">
          <Sparkles size={15} />
          霓虹夜，街角见
        </span>
        <div className="logo big">
          赛博<span>小镇</span>
        </div>
        <p className="tagline">
          自由探索霓虹小镇，用手机接下救店任务。
          <br />
          可以独自经营奶茶店，也可以去广场招帮手。
        </p>
        <div className="login-promise">
          <Crown size={17} />
          <span>街角奶茶快倒闭了，等你来救。</span>
        </div>
        <span className="login-pick">
          {identityMode === 'demo'
            ? '选一个身份，开始你的快乐营业'
            : identityMode === 'mock'
              ? '本地 Mock 联调模式'
              : '请从已配置的身份认证入口进入奶茶街区'}
        </span>
        {identityMode === 'demo' && <div className="identity-grid" role="group" aria-label="选择测试身份">
          {identities.map((p) => (
            <button
              key={p.id}
              className={`identity ${preferred === p.id ? 'on' : ''}`}
              style={{ ['--pc' as string]: p.color }}
              disabled={!!busy}
              onClick={() => void enter(p.id)}
              data-testid={`identity-${p.id}`}
            >
              <span className="mono">{p.name.slice(-1)}</span>
              <span className="id-name">
                {busy === p.id ? '进入中…' : p.name}
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>}
        {identityMode === 'sso' && browserLogin && (
          <button className="btn primary" disabled={!!busy} onClick={() => {
            setBusy('sso');
            setError(null);
            void api.beginBrowserLogin().then(({ url, state }) => {
              const target = new URL(url);
              if (!['https:', 'http:'].includes(target.protocol)) throw new Error('登录地址无效');
              rememberBrowserLogin(state);
              location.assign(target.href);
            }).catch(() => { setError('暂时无法打开公司登录，请稍后重试'); setBusy(null); });
          }} data-testid="company-login">
            {busy === 'sso' ? '正在前往…' : '公司账号登录'}<ArrowRight size={16} />
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="sso-line">
          {identityMode === 'demo' ? '体验账号 · 非真实SSO · 可在不同标签页与自己联机' : identityNotice}
        </p>
      </div>
      </div>
    </div>
  );
}
