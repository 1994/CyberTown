import { GameLogo } from './GameLogo';
import type { ReactNode } from 'react';
import './login.css';

/**
 * 游戏标题入口：不画任何假街景，底层就是正在渲染的真实 3D 小镇。
 * 只叠一层暗角 + 低多边形折线标题 + 一块切角操作条。
 */
export function LoginStage({ children, confirmed = false, demo = false }: { children: ReactNode; confirmed?: boolean; demo?: boolean }) {
  return <main className={`town-entry ${confirmed ? 'is-confirmed' : ''}`}>
    <div className="entry-veil" aria-hidden="true" />
    <div className="entry-frame">
      <header className="entry-brand">
        <span className="entry-kicker">CYBER TOWN{demo && <em>DEMO</em>}</span>
        <h1><GameLogo /></h1>
        <svg className="entry-shard" viewBox="0 0 320 14" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="0,12 64,12 78,3 196,3 208,9 320,9" />
        </svg>
      </header>
      <section className="entry-panel" aria-label={confirmed ? '确认进入小镇' : '登录小镇'}>
        {children}
      </section>
    </div>
  </main>;
}
