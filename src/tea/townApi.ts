import type { TownHome, TownJobKind } from '../../shared/town.ts';
import { teaCall } from './liveApi.ts';

export const townApi = {
  enter: (ownerId: string) => teaCall<TownHome>('POST', '/api/tea/town/enter', { ownerId }),
  home: () => teaCall<TownHome>('GET', '/api/tea/town'),
  hire: (sourceId: string, expectedPrice: number) => teaCall<TownHome>('POST', '/api/tea/town/hire', { sourceId, expectedPrice }),
  job: (cloneId: string, kind: TownJobKind) => teaCall<TownHome>('POST', '/api/tea/town/jobs', { cloneId, kind }),
  upgrade: (expectedLevel: number) => teaCall<TownHome>('POST', '/api/tea/town/upgrade', { expectedLevel }),
  list: (cloneId: string, price: number, requestKey: string) => teaCall<TownHome>('POST', '/api/tea/town/market/list', { cloneId, price, requestKey }),
  withdraw: (listingId: string) => teaCall<TownHome>('POST', '/api/tea/town/market/withdraw', { listingId }),
  buy: (listingId: string, expectedPrice: number) => teaCall<TownHome>('POST', '/api/tea/town/market/buy', { listingId, expectedPrice }),
};
