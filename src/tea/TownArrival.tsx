import { useEffect, useState } from 'react';
import type { TeaMission } from '../../shared/teaTown.ts';
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
export function TownArrival({ myId, touch, missionStatus, onPhone, onGoShop, onClose }: { myId: string; touch: boolean; missionStatus: TeaMission['status']; onPhone: () => void; onGoShop: () => void; onClose: () => void }) {
  const me = useGame(s => s.snapshot?.players.find(p => p.id === myId));
  // 跟随真实坐标：新玩家在小镇广场，老位置（如奶茶店门口）照实显示
  const zone = useDistrict().name;
  const first = missionStatus === 'offered';
  const complete = missionStatus === 'completed';
  return <section className={`town-arrival${touch ? " compact-arrival" : ""}`} data-testid="town-arrival" role="dialog" aria-label={`到达${zone}`}>
    <button className="town-x" onClick={onClose} aria-label="关闭引导，自由逛逛" data-testid="town-arrival-dismiss">×</button>
    <div className="town-arrival-me">
      <Face p={me} size={touch ? 28 : 44} />
      <div><small>{zone} · {complete ? '继续经营' : '新手第一单'}</small><b>{complete ? '回店，再赚一笔' : '开一班奶茶店，赚第一笔钱'}</b></div>
    </div>
    <p className="town-arrival-next" id="town-guide-phone">{first ? '先点下方按钮，在手机里「接下任务」。' : complete ? '回奶茶店备好料，再开一班。' : '任务已接好，下一步去奶茶店备料。'}</p>
    <ol className="town-start-steps" aria-label="开店步骤">
      <li className={first ? 'current' : 'done'}><i>{first ? '1' : '✓'}</i><span>手机接任务</span></li>
      <li className={!first ? 'current' : ''}><i>2</i><span>跟着带路去店里</span></li>
      <li><i>3</i><span>备料开店，结束领收入</span></li>
    </ol>
    <p className="town-arrival-controls">{touch ? '左下摇杆走路，靠近店门点「进店」。' : '点地面走路，靠近店门按 E 进店。'}<br/>可以先自己干，之后再雇员工帮忙。</p>
    <div className="town-row">
      <button className="tea-btn primary" onClick={first ? onPhone : onGoShop}>{first ? '打开手机 · 接任务' : complete ? '带路回奶茶店' : '带路去奶茶店'}</button>
      <button className="tea-btn ghost" onClick={onClose}>跳过，先逛逛</button>
    </div>
  </section>;
}
