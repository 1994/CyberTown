import type {
  Accessory,
  ColleagueView,
  Look,
  PlayerStyle,
  ShopItem,
} from '../shared/types.ts';

export function dressed(
  base: Look,
  style: PlayerStyle | undefined,
  boss = false,
): Look {
  const shirt = boss ? style?.bossShirt : style?.shirt;
  const accessory = boss ? style?.bossAccessory : style?.accessory;
  return {
    ...base,
    shirt: shirt || base.shirt,
    accessory: (accessory || base.accessory) as Accessory,
  };
}
export function tryOn(base: Look, item: ShopItem | undefined): Look {
  if (!item || item.kind === 'aura') return base;
  return { ...base, [item.kind]: item.value } as Look;
}
export const isBoss = (id: string) => id === 'c-zhang' || id === 'c-money';

export function dressedColleague(c: ColleagueView, style?: PlayerStyle): Look {
  return isBoss(c.id) ? dressed(c.look, style, true) : c.look;
}
