import type { TeaLiveCustomer, TeaWorkRole } from '../../shared/teaLive.ts';

export function customerMood(customer: Pick<TeaLiveCustomer, 'state' | 'patience'>) {
 if (customer.state === 'served') return { icon: '😋', label: '满意', tone: 'ok' as const };
 if (customer.state === 'lost') return { icon: '😡', label: '生气离开', tone: 'bad' as const };
 if (customer.state === 'delivering') return { icon: '😃', label: '期待收餐', tone: 'ok' as const };
 const patience = customer.patience ?? 1;
 if (patience <= .25) return { icon: '😠', label: '快没耐心了', tone: 'bad' as const };
 if (patience <= .55) return { icon: '😟', label: '等急了', tone: 'sk' as const };
 return { icon: '🙂', label: '耐心等待', tone: 'tag' as const };
}

/** Visual substeps follow authoritative work progress, never their own timer. */
export function workSteps(role: TeaWorkRole, progress: number) {
 const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
 const labels = role === 'maker' ? ['配料', '摇匀', '封口'] : ['取杯', '送达', '收款'];
 return labels.map((label, i) => ({ label, progress: Math.max(0, Math.min(1, value * 3 - i)) }));
}
