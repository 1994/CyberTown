import type { StateSnapshot } from '../../shared/types.ts';
import type { PhoneFeature, PhonePage } from '../store.ts';
import { isBoss } from '../look.ts';

/** Game objectives only: completion is derived from the authoritative snapshot. */
export interface KimTask {
  id: string;
  title: string;
  detail: string;
  from: string;
  tag: string;
  priority: 'urgent' | 'normal';
  done: boolean;
  progress?: string;
  actionLabel: string;
  page?: PhonePage;
  feature?: PhoneFeature;
}

export function buildPhoneTasks(snap: StateSnapshot): KimTask[] {
  const team = snap.colleagues.filter(c => c.ownerId === snap.me.id);
  const boss = team.some(c => isBoss(c.id));
  const next = snap.career.next;
  const owned = snap.shop.filter(item => item.owned && item.price > 0).length;
  return [
    { id: 'first-game', title: '带薪摸鱼，先玩一局', detail: '接礼物、躲大饼，金币和成长一起拿。', from: '摸鱼搭子', tag: '快乐开工', priority: 'urgent', done: snap.career.completedProjects > 0, progress: `${snap.career.completedProjects} 场已完成`, actionLabel: snap.activeRun ? '继续玩' : '去开玩', page: 'play' },
    { id: 'hire-boss', title: '把老板招进你的小队', detail: '这次轮到老板干活，高属性帮你赚更多。', from: '人才小助手', tag: '小镇', priority: 'urgent', done: boss, progress: boss ? '老板已就位' : '0 / 1 位老板', actionLabel: '找老板', page: 'contacts' },
    { id: 'year-rounds', title: `第 ${snap.year.number} 年：攒够发奖场次`, detail: '再快乐营业几场，年终奖就到账。', from: '奖金小助手', tag: '本年目标', priority: 'normal', done: snap.year.completed >= snap.year.required, progress: `${snap.year.completed} / ${snap.year.required} 场`, actionLabel: '去开玩', page: 'play' },
    { id: 'promotion', title: next ? `达成「${next.name}」晋升门槛` : '职场巅峰，保持快乐', detail: next ? '成长和场次达标后，去晋升拿更高奖金。' : '最高职级已达成，继续带老板快乐营业。', from: '晋升委员会', tag: '养成', priority: 'normal', done: !next || snap.career.canPromote, progress: next ? `成长 ${snap.career.performance}/${next.requiredPerformance} · 场次 ${snap.career.completedProjects}/${next.requiredProjects}` : '已达最高职级', actionLabel: snap.career.canPromote ? '去晋升' : '看晋升', feature: 'career' },
    { id: 'team', title: '组一支三人摸鱼小队', detail: '三个生效槽位，把队友技能带进小游戏。', from: '小队队长', tag: '组队', priority: 'normal', done: team.length >= 3, progress: `${Math.min(team.length, 3)} / 3 位队友`, actionLabel: '看小队', feature: 'squad' },
    { id: 'friend', title: '找个搭子，碰一杯', detail: '去园区和其他玩家碰杯，解锁本年社交加成。', from: '园区搭子群', tag: '交个朋友', priority: 'normal', done: snap.year.friendPct > 0, progress: `本年社交加成 +${snap.year.friendPct}%`, actionLabel: '找搭子', page: 'contacts' },
    { id: 'first-award', title: '等一笔真正到账的年终奖', detail: '完成一年的场次自动结算，预估奖金不算到账。', from: '财务同学', tag: '年终奖', priority: 'normal', done: snap.year.lastAward !== null, progress: snap.year.lastAward ? `第 ${snap.year.lastAward.year} 年已到账 ${snap.year.lastAward.total} 金币` : `本年预计 ${snap.year.estimate} 金币`, actionLabel: '看奖金', feature: 'career' },
    { id: 'shop', title: '用奖金犒劳一下自己', detail: '挑一件喜欢的好物，打工也要有自己的样子。', from: '快乐后勤部', tag: '奖励自己', priority: 'normal', done: owned > 0, progress: `已拥有 ${owned} 件付费好物`, actionLabel: '逛好物', feature: 'shop' },
  ];
}
