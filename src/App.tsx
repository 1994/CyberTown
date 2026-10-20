import { useEffect } from 'react';
import { OfficeCanvas } from './scene/Office.tsx';
import { useGame } from './store.ts';
import { useRealtime } from './realtime.ts';
import { Login } from './ui/Login.tsx';
import { Hud } from './ui/Hud.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';

export function App() {
  const phase = useGame((s) => s.phase);
  const bootError = useGame((s) => s.bootError);
  const boot = useGame((s) => s.boot);
  const playerId = useGame((s) => s.snapshot?.me.id ?? null);

  useEffect(() => {
    void boot();
  }, [boot]);

  useRealtime(phase === 'game' && !!playerId);

  return (
    <div className={`app phase-${phase}`}>
      <ErrorBoundary fallback={<div className="scene-fallback">3D 场景加载失败（可能是浏览器不支持 WebGL）。游戏功能仍可通过 HUD 使用。</div>}>
        <OfficeCanvas cinematic={phase === 'game'} />
      </ErrorBoundary>
      {phase === 'boot' && (
        <div className="boot-screen" role="status" aria-live="polite">
          <div className="logo">
            今天<span>老板</span>给我打工
          </div>
          {bootError ? (
            <div className="boot-error">
              <p>⚠️ 无法连接游戏服务器：{bootError}</p>
              <p className="muted">请确认后端已启动（默认端口 8787），然后重试。</p>
              <button className="btn primary" onClick={() => void boot()}>
                重试连接
              </button>
            </div>
          ) : (
            <div className="loader">
              <i />
              <span>正在布置办公室…</span>
            </div>
          )}
        </div>
      )}
      {phase === 'login' && <Login />}
      {phase === 'game' && playerId && <Hud key={playerId} />}
    </div>
  );
}
