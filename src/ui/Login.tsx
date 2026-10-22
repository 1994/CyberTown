import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store.ts';
import { api, ApiError } from '../api.ts';
import { rememberBrowserLogin } from '../auth/browser.ts';
import { ArrowRight, LoaderCircle, Check } from 'lucide-react';
import { dressed } from '../look.ts';
import { Avatar } from './Avatar.tsx';
import { LoginStage } from './LoginStage.tsx';

/** 已认证欢迎页：只展示当前登录者本人资料，点“进入小镇”（或 Enter）才进入游戏。 */
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
  const enterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { enterRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <LoginStage confirmed demo={identityMode === 'demo'}>
      <div className="entry-profile" data-testid="welcome-profile" style={{ ['--pc' as string]: me.color }}>
        {look ? <Avatar look={look} size={56} ring={me.color} />
          : me.avatarUrl && !imgFailed ? <img className="avatar entry-profile-image" src={me.avatarUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
            : <span className="entry-profile-mono">{me.name.slice(-1)}</span>}
        <div>
          <b>{me.name}</b>
          <span>{me.title || '已确认身份'}</span>
        </div>
        <Check className="entry-verified" size={16} aria-label="已确认" />
      </div>
      <button ref={enterRef} className="entry-enter" onClick={() => enterTown()} data-testid="enter-town">
        <span>进入小镇</span><ArrowRight size={20} />
      </button>
      {identityMode === 'demo' && (
        <button className="entry-switch" onClick={() => void logout()} data-testid="switch-identity">
          切换身份
        </button>
      )}
    </LoginStage>
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

  const hint = identityMode === 'demo' ? '选择身份'
    : identityMode === 'mock' ? '本地 Mock 联调 · 不收集凭证'
      : browserLogin ? null : '请从公司登录入口进入';

  return (
    <LoginStage demo={identityMode === 'demo'}>
      {hint && <p className="entry-pick">{hint}</p>}
      {identityMode === 'demo' && <div className="entry-identities" role="group" aria-label="选择体验身份（演示账号）">
        {identities.map((p) => (
          <button
            key={p.id}
            className={`entry-identity ${preferred === p.id ? 'on' : ''}`} aria-label={p.name}
            style={{ ['--pc' as string]: p.color }}
            disabled={!!busy}
            onClick={() => void enter(p.id)}
            data-testid={`identity-${p.id}`}
          >
            <span className="entry-mono">{busy === p.id ? <LoaderCircle className="entry-spinner" size={16} /> : p.name.slice(-1)}</span>
            <span className="entry-id-name">{p.name}</span>
          </button>
        ))}
      </div>}
      {identityMode === 'sso' && browserLogin && (
        <button className="entry-enter company-login" disabled={!!busy} onClick={() => {
          setBusy('sso');
          setError(null);
          void api.beginBrowserLogin().then(({ url, state }) => {
            const target = new URL(url);
            if (!['https:', 'http:'].includes(target.protocol)) throw new Error('登录地址无效');
            rememberBrowserLogin(state);
            location.assign(target.href);
          }).catch(() => { setError('暂时无法打开公司登录，请稍后重试'); setBusy(null); });
        }} data-testid="company-login">
          <span>{busy === 'sso' ? '正在前往…' : '公司账号登录'}</span>{busy === 'sso' ? <LoaderCircle className="entry-spinner" size={18} /> : <ArrowRight size={20} />}
        </button>
      )}
      {error && <p className="entry-error" role="alert">{error}</p>}
      {identityMode !== 'demo' && identityNotice && <p className="entry-notice">{identityNotice}</p>}
    </LoginStage>
  );
}
