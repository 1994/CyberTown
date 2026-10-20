import { useEffect } from 'react';
import { OfficeCanvas } from './scene/Office.tsx';
import { useGame } from './store.ts';
import { useRealtime } from './realtime.ts';
import { useWorldNet } from './world/net.ts';
import { useWorldInput } from './world/input.ts';
import { Login } from './ui/Login.tsx';
import { GameHud } from './ui/GameHud.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';

export function App() {
  const phase = useGame((s) => s.phase);
  const bootError = useGame((s) => s.bootError);
  const boot = useGame((s) => s.boot);
  const playerId = useGame((s) => s.snapshot?.me.id ?? null);
  const introPlaying = useGame((s) => s.introPlaying);
  const myId = phase === 'game' ? playerId : null;

  useEffect(() => {
    void boot();
  }, [boot]);

  useRealtime(!!myId);
  useWorldNet(myId);
  useWorldInput(!!myId);

  return (
    <div className={`app phase-${phase} ${introPlaying ? 'is-film' : ''}`}>
      <ErrorBoundary fallback={<div className="scene-fallback">3D 场景加载失败（浏览器可能不支持 WebGL）</div>}>
        <OfficeCanvas myId={myId} />
      </ErrorBoundary>
      {phase === 'boot' && (
        <div className="boot-screen" role="status" aria-live="polite">
          <div className="logo">
            今天<span>老板</span>给我打工
          </div>
          {bootError ? (
            <div className="boot-error">
              <p>连不上服务器：{bootError}</p>
              <button className="btn primary" onClick={() => void boot()}>
                重试
              </button>
            </div>
          ) : (
            <div className="loader">
              <i />
              <span>园区开门中…</span>
            </div>
          )}
        </div>
      )}
      {phase === 'login' && <Login />}
      {myId && <GameHud key={myId} />}
    </div>
  );
}
