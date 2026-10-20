import { useState } from 'react';
import { useGame } from '../store.ts';
import { ApiError } from '../api.ts';

export function Login() {
  const identities = useGame((s) => s.identities);
  const loginAs = useGame((s) => s.loginAs);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preferred = new URLSearchParams(location.search).get('as') ?? localStorage.getItem('boss.lastIdentity');

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
        <div className="logo big">
          今天<span>老板</span>给我打工
        </div>
        <p className="tagline">逛园区 · 招人 · 挖角 · 带队赚钱</p>
        <div className="identity-grid" role="list" aria-label="选择测试身份">
          {identities.map((p) => (
            <button
              key={p.id}
              role="listitem"
              className={`identity ${preferred === p.id ? 'on' : ''}`}
              style={{ ['--pc' as string]: p.color }}
              disabled={!!busy}
              onClick={() => void enter(p.id)}
              data-testid={`identity-${p.id}`}
            >
              <span className="mono">{p.name.slice(-1)}</span>
              <span className="id-name">{busy === p.id ? '进入中…' : p.name}</span>
            </button>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="sso-line">
          <span className="pill test">测试身份</span> 演示账号，非真实 SSO · 每个标签页可登录不同身份
        </p>
      </div>
    </div>
  );
}
