export const LOCAL_LIGHT_CAPACITY = 6;

/** Keep each selected source in its previous GPU slot, even when ranks change. */
export function stableLightSlots<T>(previous: readonly (T | undefined)[], ranked: readonly T[]): (T | undefined)[] {
  const chosen = ranked.slice(0, LOCAL_LIGHT_CAPACITY);
  const slots: (T | undefined)[] = Array.from({ length: LOCAL_LIGHT_CAPACITY }, (_, i) => {
    const source = previous[i];
    return source !== undefined && chosen.includes(source) ? source : undefined;
  });
  for (const source of chosen) {
    if (slots.includes(source)) continue;
    const free = slots.indexOf(undefined);
    if (free !== -1) slots[free] = source;
  }
  return slots;
}
