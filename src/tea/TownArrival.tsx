import { useEffect, useState } from 'react';
import type { PlayerPublic } from '../../shared/types.ts';
import { nearbyPlayers } from '../../shared/proximity.ts';
import { districtAt, type DistrictId } from '../../shared/townPlan.ts';
import { dressed } from '../look.ts';
import { sessionKey } from '../runtime-config.ts';
import { useGame } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { rt, useWorld } from '../world/runtime.ts';

// 入镇体验：到达引导（每个会话+玩家一次）、连接/位置/附近真实玩家。全部只读世界状态，不改移动或协议。

/** 服务端世界里出现了自己的坐标才算真正进入小镇。 */
export function useWorldReady(myId: string) {
  return useWorld(s => s.players.some(p => p.id === myId));
}

function Face({ p, size = 28 }: { p: PlayerPublic | undefined; size?: number }) {
  const colleagues = useGame(s => s.snapshot?.colleagues);
  const [bad, setBad] = useState(false);
  if (!p) return <span className="town-face" style={{ width: size, height: size }}>?</span>;
  const av = colleagues?.find(c => c.id === p.avatarColleagueId);
  if (av) return <Avatar look={{ ...dressed(av.look, p.style), avatarUrl: p.avatarUrl ?? av.look.avatarUrl }} size={size} ring={p.color} />;
  if (p.avatarUrl && !bad) return <img className="avatar" src={p.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ borderRadius: '50%', objectFit: 'cover' }} />;
  return <span className="town-face" style={{ width: size, height: size, background: p.color }}>{p.name.slice(-1)}</span>;
}

/** 当前所在大区（shared/townPlan districtAt，按真实坐标 0.5s 刷新）。 */
function useDistrict() {
  const [d, setD] = useState<{ id: DistrictId; name: string }>(() => districtAt(rt.me.x, rt.me.z));
  useEffect(() => {
    const read = () => { const n = districtAt(rt.me.x, rt.me.z); setD(o => (o.id === n.id ? o : { id: n.id, name: n.name })); };
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, []);
  return d;
}

/** 常驻位置/社交提示：区域、本人、附近真实玩家（不含 NPC）。 */
export function TownPresence({ myId, ready, collapsed = false }: { myId: string; ready: boolean; collapsed?: boolean }) {
  const conn = useGame(s => s.conn);
  const snapPlayers = useGame(s => s.snapshot?.players);
  const players = useWorld(s => s.players);
  const district = useDistrict();
  const [open, setOpen] = useState(false);
  const live = ready && conn === 'live';
  const near = live ? nearbyPlayers(players, myId) : [];
  // 展开态只在真的有列表可看时成立；断线或邻居归零自动收起，不锁住首次引导
  // 引导卡显示时收起名单（同步内部 open，避免父子状态不一致）
  useEffect(() => { if (collapsed) setOpen(false); }, [collapsed]);
  const expanded = open && live && near.length > 0 && !collapsed;
  const status = conn === 'offline' ? '重连中…' : !live ? '正在进入小镇…' : near.length ? `附近 ${near.length} 位玩家` : '';
  return <div className="town-presence" data-testid="town-presence"
    data-state={conn === 'offline' ? 'offline' : live ? 'live' : 'connecting'} data-nearby={near.length}>
    <button className="town-presence-main" data-testid="town-presence-toggle" onClick={() => { if (!collapsed) setOpen(v => !v); }} disabled={!live || !near.length || collapsed} aria-expanded={expanded}>
      <i className={`town-conn ${live ? 'on' : conn === 'offline' ? 'off' : ''}`} aria-hidden />
      <span><b data-testid="town-district" data-district={live ? district.id : undefined}>{live ? district.name : '连接中'}</b></span>
      {status && <small>{status}</small>}
    </button>
    {expanded && <ul className="town-nearby" data-testid="town-nearby-list">
      {near.slice(0, 8).map(p => {
        const info = snapPlayers?.find(x => x.id === p.id);
        return <li key={p.id}><Face p={info} size={24} /><span>{info?.name ?? '玩家'}</span></li>;
      })}
      {near.length > 8 && <li className="more">还有 {near.length - 8} 位</li>}
    </ul>}
  </div>;
}

// v2：新版操作指引，旧版一次性记录不再沿用
const arrivalKey = (id: string) => `${sessionKey()}.town-arrival:v2:${id}`;
export function arrivalSeen(id: string) { try { return localStorage.getItem(arrivalKey(id)) === '1'; } catch { return false; } }
export function markArrival(id: string) { try { localStorage.setItem(arrivalKey(id), '1'); } catch { /* 仅为便利 */ } }

/** 入镇操作指引：所在区域 + 本人 + 怎么走 + 手机在哪。可关闭，右上「指引」随时重开。 */
export function TownArrival({ myId, touch, onPhone, onClose }: { myId: string; touch: boolean; onPhone: () => void; onClose: () => void }) {
  const me = useGame(s => s.snapshot?.players.find(p => p.id === myId));
  // 跟随真实坐标：新玩家在小镇广场，老位置（如奶茶店门口）照实显示
  const zone = useDistrict().name;
  return <section className="town-arrival" data-testid="town-arrival" role="dialog" aria-label={`到达${zone}`}>
    <button className="town-x" onClick={onClose} aria-label="关闭引导，自由逛逛" data-testid="town-arrival-dismiss">×</button>
    <div className="town-arrival-me">
      <Face p={me} size={44} />
      <div><small>已到达</small><b>{zone}</b></div>
    </div>
    <ul className="town-guide">
      <li><b>移动</b><span>{touch ? '左下摇杆，或点地面' : '点地面，或 WASD'}</span></li>
      <li><b>小镇</b><span>这是你的小镇；广场「雇佣大厅」可选招员工</span></li>
      <li><b>地图</b><span>西商业、东娱乐，4 处商圈可考察</span></li>
      <li id="town-guide-phone"><b>手机</b><span>右上角「手机」看任务和钱包{!touch && <>，或按 <kbd>P</kbd></>}</span></li>
    </ul>
    <div className="town-row">
      <button className="tea-btn primary" onClick={onPhone}>查看手机消息</button>
      <button className="tea-btn ghost" onClick={onClose}>先逛逛</button>
    </div>
  </section>;
}
