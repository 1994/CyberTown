import { useState } from 'react';
import { useGame } from '../store.ts';
import { ApiError } from '../api.ts';

export function Login() {
  const identities = useGame((s) => s.identities);
  const loginAs = useGame((s) => s.loginAs);
  const [selected, setSelected] = useState<string>(() => {
    const q = new URLSearchParams(location.search).get('as');
    return q ?? localStorage.getItem('boss.lastIdentity') ?? identities[0]?.id ?? '';
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = async (id = selected) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await loginAs(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登录失败，请重试');
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card panel">
        <div className="logo big">
          今天<span>老板</span>给我打工
        </div>
        <p className="tagline">3D 职场社交经营 · 赚钱 → 招募 → 挖角，让老板为你打工</p>
        <div className="sso-warning" role="note">
          <b>🧪 测试身份登录</b>
          <span>本演示未接入真实 SSO，以下为预置测试账号，仅用于本地/演示验收。</span>
        </div>
        <div className="identity-grid" role="radiogroup" aria-label="选择测试身份">
          {identities.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={selected === p.id}
              className={`identity ${selected === p.id ? 'on' : ''}`}
              style={{ ['--pc' as string]: p.color }}
              onClick={() => setSelected(p.id)}
              onDoubleClick={() => void enter(p.id)}
              data-testid={`identity-${p.id}`}
            >
              <span className="mono">{p.name.slice(-1)}</span>
              <span className="id-name">{p.name}</span>
              <span className="id-sub">{p.title}</span>
              <span className="pill test">测试身份</span>
            </button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={!selected || busy} onClick={() => void enter()} data-testid="login-enter">
          {busy ? '正在进入办公室…' : `以「${identities.find((i) => i.id === selected)?.name ?? '…'}」进入办公室`}
        </button>
        <p className="hint">
          多人演示：用两个<strong>独立浏览器窗口</strong>（或一个普通窗口 + 一个无痕窗口）分别选择不同身份。身份保存在标签页会话中，刷新不会掉线；也可用
          <code>?as=li</code> 预选身份。
        </p>
      </div>
    </div>
  );
}
