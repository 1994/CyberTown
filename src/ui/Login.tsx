import { useState } from 'react';
import { useGame } from '../store.ts';
import { api, ApiError } from '../api.ts';
import { rememberBrowserLogin } from '../auth/browser.ts';
import { ArrowRight, Sparkles } from 'lucide-react';
import { dressed } from '../look.ts';
import { Avatar } from './Avatar.tsx';

/** 已认证欢迎页：只展示当前登录者本人资料，点“进入小镇”才进入游戏。 */
function Welcome() {
  const snap = useGame((s) => s.snapshot)!;
  const identityMode = useGame((s) => s.identityMode);
  const enterTown = useGame((s) => s.enterTown);
  const logout = useGame((s) => s.logout);
  const me = snap.me;
  const av = snap.colleagues.find((c) => c.id === me.avatarColleagueId);
  // 优先真实头像；坏图由 Avatar 回退到本地卡通脸
  const look = av ? { ...dressed(av.look, me.style), avatarUrl: me.avatarUrl ?? av.look.avatarUrl } : null;
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="login-wrap">
      <div className="login-shell">
        <div className="login-card panel welcome-card">
          <div className="logo big">赛博<span>小镇</span></div>
          <div className="welcome-me" data-testid="welcome-profile">
            {look ? <Avatar look={look} size={72} ring={me.color} />
              : me.avatarUrl && !imgFailed ? <img className="avatar welcome-img" src={me.avatarUrl} alt="" width={72} height={72} referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
                : <span className="welcome-mono" style={{ ['--pc' as string]: me.color }}>{me.name.slice(-1)}</span>}
            <div>
              <b>{me.name}</b>
              {me.title && <span>{me.title}</span>}
            </div>
          </div>
          <button className="btn primary welcome-enter" onClick={() => enterTown()} data-testid="enter-town">
            进入小镇<ArrowRight size={16} />
          </button>
          {identityMode === 'demo' && (
            <button className="text-btn welcome-switch" onClick={() => void logout()} data-testid="switch-identity">
              切换体验身份
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const phase = useGame((s) => s.phase);
  const hasSnap = useGame((s) => !!s.snapshot);
  if (phase === 'welcome' && hasSnap) return <Welcome />;
  return <LoginForm />;
}

function LoginForm() {
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
        <p className="tagline">探索霓虹街区，遇见小镇伙伴。</p>
        <span className="login-pick">
          {identityMode === 'demo'
            ? '选择体验身份（演示账号）'
            : identityMode === 'mock'
              ? '本地 Mock 联调模式 · 本页不收集凭证'
              : browserLogin ? '使用公司账号登录' : '请从公司登录入口进入'}
        </span>
        {identityMode === 'demo' && <div className="identity-grid" role="group" aria-label="选择体验身份（演示账号）">
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
          <button className="btn primary welcome-enter company-login" disabled={!!busy} onClick={() => {
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
          {identityMode === 'demo' ? '演示账号，并非员工名单 · 可在不同标签页与自己联机' : identityNotice}
        </p>
      </div>
      </div>
    </div>
  );
}
