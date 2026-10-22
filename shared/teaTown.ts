export interface TeaMission {
  status: 'offered' | 'accepted' | 'completed';
  acceptedAt: number;
  completedAt: number;
  income: number;
  runId: string | null;
}

export interface TeaLedgerEntry {
  id: number;
  delta: number;
  kind: string;
  ref: string;
  at: number;
}

export interface TeaWallet {
  balance: number;
  entries: TeaLedgerEntry[];
}

export const TEA_TOWN_SITES = {
  recruit: { id: 'tea-recruit', name: '广场招募', x: -5, z: 12, range: 2.8 },
  shop: { id: 'tea-shop', name: '奶茶小镇·街角奶茶', x: -19.4, z: -1, range: 2.8 },
} as const;
