import type { WorldPlayer } from '../../shared/types.ts';

export type SocialEntry = Pick<WorldPlayer, 'id' | 'said' | 'saidUntil' | 'emote' | 'emoteUntil'>;

/** Movement is interpolated outside React; social expiry times still invalidate the UI. */
export function socialEntry(players: readonly WorldPlayer[], id: string): SocialEntry | undefined {
  const p = players.find((p) => p.id === id);
  return p ? { id: p.id, said: p.said, saidUntil: p.saidUntil,
    emote: p.emote, emoteUntil: p.emoteUntil } : undefined;
}
