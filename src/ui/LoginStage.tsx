import type { ReactNode } from 'react';
import { Building2, ArrowUpRight } from 'lucide-react';
import './login.css';

/** Shared alignment and framing for both identity selection and confirmation. */
export function LoginStage({ children, confirmed = false }: { children: ReactNode; confirmed?: boolean }) {
  return <main className="town-entry">
    <div className="entry-grid" aria-hidden="true" />
    <div className="entry-orbit orbit-one" aria-hidden="true" />
    <div className="entry-orbit orbit-two" aria-hidden="true" />
    <div className="entry-frame">
      <header className="entry-masthead"><span className="entry-mark"><Building2 size={23}/></span><span>CYBER TOWN</span><span className="entry-edition">DEMO <i/></span></header>
      <section className="entry-main">
        <div className="entry-brand">
          <div className="entry-coordinates" aria-hidden="true"><span>夜色正好</span><span>↗</span></div>
          <h1>赛博<br/><span>小镇</span><i aria-hidden="true">.</i></h1>
          <p>从一家小店，开始你的生活。</p>
          <div className="entry-city" aria-hidden="true">
            {[1,2,3,4,5,6,7].map(n=><i key={n} className={`entry-building building-${n}`}><b/><b/><b/></i>)}
            <span className="entry-city-line"/>
          </div>
          <div className="entry-genre"><span>经营</span><i/><span>养成</span><i/><span>探索</span><ArrowUpRight size={17}/></div>
        </div>
        <section className="entry-panel" aria-label={confirmed?'确认进入小镇':'登录小镇'}>
          <div className="entry-panel-edge" aria-hidden="true"/>
          <div className="entry-step" aria-hidden="true"><span>居民入口</span><div><i className="active"/><i className={confirmed?'active':''}/></div><b>{confirmed?'02':'01'}</b></div>
          {children}
        </section>
      </section>
      <footer className="entry-footer"><span><i/>霓虹夜，街角见</span><span aria-hidden="true">✦ &nbsp; YOUR TOWN. YOUR PACE.</span></footer>
    </div>
  </main>;
}
