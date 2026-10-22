/** Original outlined wordmark: bundled locally so the title never swaps fonts. */
export function GameLogo({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return <img className={`game-wordmark ${compact ? 'compact' : ''} ${className}`} src="/icons/cyber-town-wordmark.svg" alt="赛博小镇" draggable={false} />;
}
