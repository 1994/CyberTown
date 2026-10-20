import { useState } from 'react';
import { useGame } from '../store.ts';
import { ApiError } from '../api.ts';
import { ArrowRight, Crown, Sparkles } from 'lucide-react';

export function Login() {
  const identities = useGame((s) => s.identities);
  const identityMode = useGame((s) => s.identityMode);
  const identityNotice = useGame((s) => s.identityNotice);
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
      <div className="login-card panel">
        <span className="login-kicker">
          <Sparkles size={15} />
          今天，换你当老板
        </span>
        <div className="logo big">
          今天<span>老板</span>
          <br />
          给我打工
        </div>
        <p className="tagline">
          雇个老板，逛逛园区。
          <br />
          和朋友玩几局，等一份属于你的年终奖。
        </p>
        <div className="login-promise">
          <Crown size={17} />
          <span>工作交给老板，快乐留给自己。</span>
        </div>
        <span className="login-pick">
          {identityMode === 'demo'
            ? '选一个身份，开始你的快乐营业'
            : identityMode === 'mock'
              ? '本地 Mock 联调模式'
              : '请从已配置的身份认证入口进入园区'}
        </span>
        <div className="identity-grid" role="group" aria-label="选择测试身份">
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
        </div>
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
  );
}
