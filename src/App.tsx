import { useEffect } from 'react';
import { useGameAudio } from './useGameAudio.ts';
import { SoundDiagnostics, SoundToggle } from './ui/SoundControl.tsx';
import { OfficeCanvas } from './scene/Office.tsx';
import { useGame } from './store.ts';
import { useRealtime } from './realtime.ts';
import { useWorldNet } from './world/net.ts';
import { useWorldInput } from './world/input.ts';
import { Login } from './ui/Login.tsx';
import { TownGame } from './tea/TownGame.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { PERF_ENABLED } from './performance.ts';
import { useTownState } from './tea/townState.ts';
import { RenderStats } from './ui/RenderStats.tsx';

export function App() {
  useGameAudio();
  const phase = useGame((s) => s.phase);
  const bootError = useGame((s) => s.bootError);
  const boot = useGame((s) => s.boot);
  const playerId = useGame((s) => s.snapshot?.me.id ?? null);
  const introPlaying = useGame((s) => s.introPlaying);
  const myId = phase === 'game' ? playerId : null;
  const townReady = useTownState(s => s.ready && s.myId === myId);
  const townOwner = useTownState(s => s.home?.owner.id ?? null);
  const townError = useTownState(s => s.error);

  useEffect(() => {
    if (!myId) { useTownState.getState().reset(); return; }
    void useTownState.getState().enterTown(myId).catch(() => undefined);
  }, [myId]);

  useEffect(() => {
    if (!townReady) return;
    const timer = setInterval(() => { if (!document.hidden && !useTownState.getState().busy) void useTownState.getState().refresh().catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [townReady, townOwner]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useRealtime(!!myId && townReady, townOwner);
  // 大地图主线：原世界同步与 WASD/E 输入照常挂载，TownGame 在其上叠加救店任务与奶茶店。
  useWorldNet(townReady ? myId : null);
  useWorldInput(!!myId && townReady);

  return (
    <div className={`app phase-${phase} ${introPlaying ? 'is-film' : ''}`}>
      <ErrorBoundary fallback={<div className="scene-fallback">3D 场景加载失败（浏览器可能不支持 WebGL）</div>}>
        {myId && townReady ? <TownGame key={`${myId}:${townOwner}`} /> : <OfficeCanvas myId={null} />}
      </ErrorBoundary>
      {myId && !townReady && <div className="boot-screen" role="status"><div className="logo">赛博<span>小镇</span></div>{townError ? <div className="boot-error"><p>{townError}</p><button className="btn primary" onClick={() => void useTownState.getState().enterTown(myId).catch(() => undefined)}>重试进入</button></div> : <div className="loader"><i /><span>正在回到你的小镇…</span></div>}</div>}
      {phase === 'boot' && (
        <div className="boot-screen" role="status" aria-live="polite">
          <div className="logo">
            赛博<span>小镇</span>
          </div>
          {bootError ? (
            <div className="boot-error">
              <p>暂时无法进入：{bootError}</p>
              <button className="btn primary" onClick={() => void boot()}>
                重试
              </button>
            </div>
          ) : (
            <div className="loader">
              <i />
              <span>小镇开门中…</span>
            </div>
          )}
        </div>
      )}
      {(phase === 'login' || phase === 'welcome') && <><Login /><SoundToggle className="login-sound" /></>}
      {PERF_ENABLED && <RenderStats />}
      {new URLSearchParams(location.search).get('audio') === 'debug' && <SoundDiagnostics />}
    </div>
  );
}
