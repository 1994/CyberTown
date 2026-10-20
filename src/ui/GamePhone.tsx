import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, BatteryFull, CheckCheck, ChevronRight, Coins,
  Crown, Gamepad2, Gift, Map, MessageCircle, Search, Shield, ShoppingBag,
  Sparkles, Timer, Trophy, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../api.ts';
import { dressed, dressedColleague, isBoss } from '../look.ts';
import { myTeam, useGame } from '../store.ts';
import type { PhoneFeature, PhonePage } from '../store.ts';
import { useCinema } from '../scene/cinema.ts';
import { walkNear } from '../scene/Avatars.tsx';
import { rt, useWorld } from '../world/runtime.ts';
import { projectDuration } from '../../shared/rules.ts';
import { ZONES } from '../../shared/world.ts';
import { Avatar } from './Avatar.tsx';
import { Minimap } from './Minimap.tsx';
import { fmt } from './common.tsx';

const APPS: { id: string; label: string; Icon: LucideIcon; tone: string; page?: PhonePage; feature?: PhoneFeature }[] = [
  { id: 'play', label: '玩一局', Icon: Gamepad2, tone: 'coral', page: 'play' },
  { id: 'contacts', label: '园区同事', Icon: Users, tone: 'mint', page: 'contacts' },
  { id: 'messages', label: '消息盒子', Icon: MessageCircle, tone: 'blue', page: 'messages' },
  { id: 'squad', label: '我的小队', Icon: Crown, tone: 'gold', feature: 'squad' },
  { id: 'shop', label: '年终好物', Icon: ShoppingBag, tone: 'pink', feature: 'shop' },
  { id: 'career', label: '晋升手册', Icon: Sparkles, tone: 'purple', feature: 'career' },
  { id: 'map', label: '园区地图', Icon: Map, tone: 'lime', page: 'map' },
  { id: 'ranking', label: '风云榜', Icon: Trophy, tone: 'sand', page: 'ranking' },
];
const TITLES: Record<PhonePage, string> = {
  home: '我的手机', play: '玩一局', contacts: '园区同事', messages: '消息盒子', map: '园区地图', ranking: '园区风云榜',
};

/** Full-size games and the 3D wardrobe return here when their own close action completes. */
function PhoneReturn() {
  const pending = useGame((s) => s.phoneReturn);
  const drawer = useGame((s) => s.drawer);
  const celebration = useGame((s) => s.celebration);
  const intro = useGame((s) => s.introPlaying);
  const phase = useGame((s) => s.phase);
  const project = useWorld((s) => s.projectOpen);
  const shot = useCinema((s) => s.shot);
  useEffect(() => {
    if (pending && phase === 'game' && !drawer && !project && !celebration && !intro && !shot)
      useGame.getState().resumePhone();
  }, [pending, drawer, project, celebration, intro, shot, phase]);
  return null;
}

function PhoneHome() {
  const snap = useGame((s) => s.snapshot)!;
  const setPage = useGame((s) => s.setPhonePage);
  const launch = useGame((s) => s.launchPhoneFeature);
  const av = snap.colleagues.find((c) => c.id === snap.me.avatarColleagueId)!;
  return <div className="phone-home" data-testid="phone-home">
    <div className="phone-greeting">
      <span>HELLO, BOSS.</span>
      <h2>{snap.me.name}的摸鱼时间</h2>
      <p>老板忙着打工，你负责开心。</p>
    </div>
    <div className="phone-profile">
      <Avatar look={dressed(av.look, snap.me.style)} size={43} />
      <div><b>{snap.me.name}</b><small>{snap.career.name}</small></div>
      <span><Coins size={13} />{fmt(snap.me.coins)}</span>
    </div>
    <button className="phone-year" onClick={() => launch('career')} data-testid="phone-year">
      <div><span>第 {snap.year.number} 年 · 快乐营业</span><Gift size={21} /></div>
      <strong>{fmt(snap.year.estimate)}<small>预计年终奖</small></strong>
      <div className="phone-year-bottom">
        <span className="phone-year-dots">{Array.from({length:snap.year.required},(_,i)=><i key={i} className={i<snap.year.completed?'done':''}/>)}</span>
        <span>再玩 {Math.max(0,snap.year.required-snap.year.completed)} 场就发奖 <ChevronRight size={12}/></span>
      </div>
    </button>
    <nav className="phone-app-grid" aria-label="手机应用">
      {APPS.map(({id,label,Icon,tone,page,feature})=><button
        key={id}
        onClick={()=>page ? setPage(page) : feature && launch(feature)}
        data-testid={`phone-app-${id}`}
        aria-label={label}
      >
        <span className={`phone-app-icon ${tone}`}><Icon size={25} strokeWidth={1.8}/>
          {id==='messages' && snap.unread>0 && <b className="phone-app-badge">{snap.unread>9?'9+':snap.unread}</b>}
          {id==='career' && snap.career.canPromote && <b className="phone-app-badge">!</b>}
        </span>
        <span>{label}</span>
      </button>)}
    </nav>
    <div className="phone-motto"><span>✦</span> 把今天，过成喜欢的样子。</div>
  </div>;
}

function PhonePlay() {
  const snap = useGame((s) => s.snapshot)!;
  const team = myTeam(snap);
  const boss = team.find((c)=>isBoss(c.id)) ?? team[0];
  const launch = useGame((s)=>s.launchPhoneFeature);
  const sk = snap.projectSkills;
  return <div className="phone-page phone-play" data-testid="phone-play">
    <div className="phone-game-art">
      <span className="phone-game-orbit one"/><span className="phone-game-orbit two"/>
      <Gift size={42}/><span className="phone-game-star">✦</span><Gamepad2 size={68} strokeWidth={1.4}/>
      <span className="phone-game-sticker">快乐营业中</span>
    </div>
    <span className="phone-eyebrow">A LITTLE GAME, A BIG SMILE</span>
    <h3>老板来接招</h3>
    <p className="phone-subtitle">接礼物，躲大饼。<br/>快乐也能攒成年终奖。</p>
    <button className="phone-primary" onClick={()=>launch('project')} data-testid="phone-play-open"><Gamepad2 size={18}/>{snap.activeRun?'继续上一局':'去玩一局'}<ArrowUpRight size={16}/></button>
    <div className="phone-game-stats">
      <span><Timer size={16}/><b>{projectDuration(sk)/1000} 秒</b><small>一局时间</small></span>
      <span><Coins size={16}/><b>+{sk.incomePct}%</b><small>小队收益</small></span>
      <span><Shield size={16}/><b>{sk.shield} 次</b><small>连击保护</small></span>
    </div>
    {boss ? <div className="phone-helper"><Avatar look={dressedColleague(boss,snap.me.style)} size={38}/><span><b>{boss.name}已就位</b><small>小队技能带进下一局。</small></span></div>
      : <p className="phone-small-note">招个老板进小队，下次玩得更轻松。</p>}
    <p className="phone-small-note">礼物进圈时按空格，或点屏幕接住。</p>
  </div>;
}

function PhoneContacts() {
  const snap = useGame((s)=>s.snapshot)!;
  const players = useWorld((s)=>s.players);
  const [tab,setTab] = useState<'players'|'talent'>('players');
  const [query,setQuery] = useState('');
  const online = new Set(players.map(p=>p.id));
  const needle = query.trim().toLowerCase();
  const matches = (name:string,title:string) => `${name} ${title}`.toLowerCase().includes(needle);
  const contacts = snap.players.filter(p=>p.id!==snap.me.id && matches(p.name,p.title));
  const talent = snap.colleagues.filter(c=>c.selfPlayerId!==snap.me.id && matches(c.name,c.title));
  const go = (id:string,player:boolean) => {
    const point = player ? rt.remote.get(id) : rt.colleaguePos.get(id);
    if(!point) {
      useGame.getState().toast({tone:'info',title:'对方暂时不在园区'});
      return;
    }
    useGame.getState().closePhone();
    useWorld.getState().setOverview(false);
    walkNear(point.x,point.z,1.6);
  };
  return <div className="phone-page" data-testid="phone-contacts">
    <label className="phone-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜同事或老板" aria-label="搜索园区同事"/></label>
    <div className="phone-segments"><button className={tab==='players'?'on':''} onClick={()=>setTab('players')}>园区搭子</button><button className={tab==='talent'?'on':''} onClick={()=>setTab('talent')}>人才名册</button></div>
    <p className="phone-list-caption">{tab==='players'?`${players.filter(p=>p.id!==snap.me.id).length} 位同事在线，去打个招呼吧。`:'熟悉的同事，也能成为你的队友。'}</p>
    <ul className="phone-contact-list">
      {tab==='players' ? contacts.map(p=>{
        const av=snap.colleagues.find(c=>c.id===p.avatarColleagueId)!;
        const live=online.has(p.id);
        return <li key={p.id} data-testid={`phone-contact-${p.id}`}>
          <div className="phone-avatar-status"><Avatar look={dressed(av.look,p.style)} size={43}/><i className={live?'live':''}/></div>
          <div><b>{p.name}</b><small>{live?'正在园区': '暂时离线'} · {p.rankName}</small></div>
          <button className="phone-go" disabled={!live} onClick={()=>go(p.id,true)} aria-label={`去找${p.name}`}>{live?'去找TA':'离线'}</button>
        </li>;
      }) : talent.map(c=>{
        const owner=snap.players.find(p=>p.id===c.ownerId);
        const self=snap.players.find(p=>p.id===c.selfPlayerId);
        return <li key={c.id} data-testid={`phone-talent-${c.id}`}>
          <Avatar look={dressedColleague(c,owner?.style)} size={43}/>
          <div><b>{self?`${self.name}的分身`:c.name}{isBoss(c.id)&&<em>老板</em>}</b><small>{owner?`${owner.name}的小队`:`自由身 · ${fmt(c.price)}金币`}</small></div>
          <button className="phone-go" onClick={()=>go(c.id,false)} aria-label={`去找${c.name}`}>去找TA</button>
        </li>;
      })}
    </ul>
    {(tab==='players'?contacts:talent).length===0 && <div className="phone-empty"><Users size={32}/><b>没找到这位同事</b><span>换个名字试试。</span></div>}
    {tab==='players' && <p className="phone-small-note">同事打开同一个游戏地址，就能在这里相遇。</p>}
  </div>;
}

function PhoneMessages() {
  const snap=useGame(s=>s.snapshot)!;
  const [filter,setFilter]=useState<'all'|'me'>('all');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const messages=snap.messages.filter(m=>filter==='all'||m.scope==='me');
  const markRead=async()=>{
    setBusy(true);setError('');
    try {await api.markRead();await useGame.getState().refresh();}
    catch(e){setError(e instanceof Error?e.message:'稍后再试试');}
    finally{setBusy(false);}
  };
  return <div className="phone-page" data-testid="phone-messages">
    <div className="phone-inbox-top"><span>{snap.unread?`${snap.unread} 条新消息`:'今天的消息都在这里'}</span><button disabled={busy||!snap.unread} onClick={()=>void markRead()} data-testid="phone-mark-read"><CheckCheck size={14}/>{busy?'标记中':'全部已读'}</button></div>
    <div className="phone-segments"><button className={filter==='all'?'on':''} onClick={()=>setFilter('all')}>全部消息</button><button className={filter==='me'?'on':''} onClick={()=>setFilter('me')}>关于我的</button></div>
    {error&&<p className="phone-error" role="alert">{error}</p>}
    <ul className="phone-messages-list">{messages.map(m=><li key={m.id} className={!m.read&&m.scope==='me'?'unread':''} data-testid={`phone-message-${m.id}`}>
      <div className={`phone-message-icon ${m.scope==='global'?'global':''}`}>{m.kind==='project'||m.kind==='dividend'?<Coins size={18}/>:m.kind==='poach'||m.kind==='poached'?<Users size={18}/>:<Gift size={18}/>}</div>
      <div><header><b>{m.title}</b><time>{new Date(m.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></header><p>{m.body}</p><small>{m.scope==='global'?'园区动态':'发给我的'}</small></div>
    </li>)}</ul>
    {!messages.length&&<div className="phone-empty"><MessageCircle size={34}/><b>暂时没有新消息</b><span>去园区逛逛，好事正在路上。</span></div>}
  </div>;
}

function PhoneMap() {
  const close=useGame(s=>s.closePhone);
  const go=(x:number,z:number)=>{close();useWorld.getState().setOverview(false);walkNear(x,z);};
  return <div className="phone-page phone-map" data-testid="phone-map">
    <p className="phone-subtitle">今天，想去哪里？<br/>点地图或地点，带你慢慢走过去。</p>
    <Minimap onNavigate={close}/>
    <div className="phone-places">{ZONES.map(zone=><button key={zone.id} onClick={()=>go(zone.x,zone.z)} data-testid={`phone-place-${zone.id}`}><span>{zone.icon}</span><b>{zone.name}</b><ArrowUpRight size={15}/></button>)}</div>
  </div>;
}

function PhoneRanking() {
  const snap=useGame(s=>s.snapshot)!;
  return <div className="phone-page" data-testid="phone-ranking">
    <div className="phone-ranking-hero"><Trophy size={30}/><span>今天，你排第几？</span><strong>#{snap.players.findIndex(p=>p.id===snap.me.id)+1}</strong><small>团队资产 = 金币 + 小队身价</small></div>
    <ol className="phone-rank-list">{snap.players.map((p,i)=>{
      const av=snap.colleagues.find(c=>c.id===p.avatarColleagueId)!;
      return <li key={p.id} className={p.id===snap.me.id?'me':''}><i>{i+1}</i><Avatar look={dressed(av.look,p.style)} size={37}/><div><b>{p.name}{p.id===snap.me.id&&<em>你</em>}</b><small>{p.rankName}</small></div><strong>{fmt(p.assets)}<small>资产</small></strong></li>;
    })}</ol>
  </div>;
}

function PhonePanel() {
  const page=useGame(s=>s.phonePage);
  const setPage=useGame(s=>s.setPhonePage);
  const close=useGame(s=>s.closePhone);
  const conn=useGame(s=>s.conn);
  const [time,setTime]=useState(()=>new Date());
  const dialog=useRef<HTMLDivElement>(null);
  const screen=useRef<HTMLDivElement>(null);
  const pageRef=useRef(page);pageRef.current=page;
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    useWorld.getState().lock('phone');
    dialog.current?.focus();
    const timer=setInterval(()=>setTime(new Date()),15000);
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        if(pageRef.current==='home')close();else setPage('home');
      }
      if(event.key==='Tab'){
        const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href],[tabindex="0"]')??[]);
        const i=controls.indexOf(document.activeElement as HTMLElement);
        if(event.shiftKey&&i<=0){event.preventDefault();controls.at(-1)?.focus();}
        else if(!event.shiftKey&&(i<0||i===controls.length-1)){event.preventDefault();controls[0]?.focus();}
      }
    };
    window.addEventListener('keydown',key);
    return()=>{clearInterval(timer);useWorld.getState().unlock('phone');window.removeEventListener('keydown',key);if(before?.isConnected)before.focus();};
  },[close,setPage]);
  useEffect(()=>{
    if(screen.current)screen.current.scrollTop=0;
    dialog.current?.focus();
  },[page]);
  return <div className="phone-backdrop" onPointerDown={e=>e.target===e.currentTarget&&close()}>
    <div className="game-phone" ref={dialog} role="dialog" aria-modal="true" aria-label="我的游戏手机" tabIndex={-1} data-testid="game-phone">
      <span className="phone-side-button one"/><span className="phone-side-button two"/>
      <div className="phone-display">
        <div className="phone-status"><time>{time.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</time><span className="phone-island"/><span className="phone-status-icons" title={conn==='live'?'实时连接':'正在连接'}>{conn==='live'?<Wifi size={13}/>:<WifiOff size={13}/>}<BatteryFull size={17}/><button onClick={close} aria-label="收起手机" data-testid="phone-close"><X size={15}/></button></span></div>
        <div className="phone-wallpaper" aria-hidden="true"><i/><i/><i/></div>
        {page!=='home'&&<header className="phone-page-head"><button onClick={()=>setPage('home')} aria-label="返回手机桌面" data-testid="phone-back"><ArrowLeft size={18}/></button><h2>{TITLES[page]}</h2><span>BOSS OS</span></header>}
        <div className={`phone-screen ${page==='home'?'home':''}`} ref={screen} key={page}>
          {page==='home'?<PhoneHome/>:page==='play'?<PhonePlay/>:page==='contacts'?<PhoneContacts/>:page==='messages'?<PhoneMessages/>:page==='map'?<PhoneMap/>:<PhoneRanking/>}
        </div>
        <footer className="phone-bottom"><span>{page==='home'?'MY LITTLE WORLD':'BOSS OS · 随时快乐'}</span><button onClick={()=>page==='home'?close():setPage('home')} aria-label={page==='home'?'收起手机':'返回手机桌面'} data-testid="phone-home-button"><i/></button></footer>
      </div>
    </div>
  </div>;
}

export function GamePhone() {
  const open=useGame(s=>s.phoneOpen);
  return <><PhoneReturn/>{open&&<PhonePanel/>}</>;
}
