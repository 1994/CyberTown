import type { Look } from '../../shared/types.ts';
import { useState } from 'react';

/** Match the face-mask URL; missing or failed images fall back to the local SVG. */
export function Avatar({ look, size = 44, ring }: { look: Look; size?: number; ring?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (look.avatarUrl && failedUrl !== look.avatarUrl) {
    return <img
      className="avatar"
      src={look.avatarUrl}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(look.avatarUrl!)}
      style={{ objectFit: 'cover', borderRadius: '50%', ...(ring ? { boxShadow: `0 0 0 2px ${ring}` } : {}) }}
    />;
  }
  const hair = look.hair;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="avatar" aria-hidden="true" style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}>
      <defs>
        <radialGradient id={`bg-${look.shirt.slice(1)}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#2c3566" />
          <stop offset="100%" stopColor="#151a36" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#bg-${look.shirt.slice(1)})`} />
      {look.hairStyle === 'long' && <rect x="24" y="36" width="52" height="46" rx="18" fill={hair} />}
      <ellipse cx="50" cy="100" rx="34" ry="24" fill={look.shirt} />
      <rect x="44" y="66" width="12" height="10" rx="4" fill={look.skin} />
      {look.accessory === 'tie' && <path d="M50 78 l-4 6 4 14 4-14z" fill="#c0392b" />}
      {look.accessory === 'scarf' && <rect x="36" y="72" width="28" height="8" rx="4" fill="#ffd166" />}
      <circle cx="50" cy="45" r="27" fill={look.skin} />
      <circle cx="23" cy="47" r="5" fill={look.skin} />
      <circle cx="77" cy="47" r="5" fill={look.skin} />
      {/* 头发 */}
      {look.hairStyle === 'bald' && <path d="M24 46 q2 -10 8 -12 M76 46 q-2 -10 -8 -12" stroke={hair} strokeWidth="6" fill="none" strokeLinecap="round" />}
      {look.hairStyle === 'cap' && (
        <>
          <path d="M22 40 a28 24 0 0 1 56 0 z" fill={look.shirt} />
          <rect x="44" y="35" width="44" height="6" rx="3" fill={look.shirt} />
        </>
      )}
      {['short', 'spiky', 'bun', 'bob', 'long'].includes(look.hairStyle) && <path d="M22 44 a28 28 0 0 1 56 0 q-10 -8 -28 -6 q-6 10 -28 6z" fill={hair} />}
      {look.hairStyle === 'spiky' && <path d="M30 26 l4 -12 6 10 6 -13 5 12 7 -11 3 13 6 -8 0 12z" fill={hair} />}
      {look.hairStyle === 'bun' && <circle cx="50" cy="15" r="9" fill={hair} />}
      {look.hairStyle === 'bob' && (
        <>
          <rect x="20" y="38" width="12" height="28" rx="6" fill={hair} />
          <rect x="68" y="38" width="12" height="28" rx="6" fill={hair} />
        </>
      )}
      {/* 五官 */}
      <ellipse cx="40" cy="48" rx="3.6" ry="4.6" fill="#1b1b24" />
      <ellipse cx="60" cy="48" rx="3.6" ry="4.6" fill="#1b1b24" />
      <circle cx="41.2" cy="46.5" r="1.2" fill="#fff" />
      <circle cx="61.2" cy="46.5" r="1.2" fill="#fff" />
      <ellipse cx="33" cy="56" rx="4" ry="2.4" fill="#ff8a8a" opacity="0.55" />
      <ellipse cx="67" cy="56" rx="4" ry="2.4" fill="#ff8a8a" opacity="0.55" />
      <path d="M45 58 q5 5 10 0" stroke="#7a2f2f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {(look.accessory === 'neon-mask' || look.accessory === 'fox-mask') && <g><path d="M27 30 L50 23 L73 30 L72 58 L50 72 L28 58Z" fill={look.accessory==='fox-mask'?'#efe1ca':'#1c2940'}/><path d="M32 43 L44 46 M56 46 L68 43" stroke={look.accessory==='fox-mask'?'#ff688e':'#59ede7'} strokeWidth="4"/></g>}
      {look.accessory === 'glasses' && (
        <g stroke="#222" strokeWidth="2" fill="none">
          <circle cx="40" cy="48" r="7" />
          <circle cx="60" cy="48" r="7" />
          <path d="M47 48 h6" />
        </g>
      )}
      {look.accessory === 'sunglasses' && (
        <g fill="#111">
          <rect x="31" y="43" width="16" height="10" rx="4" />
          <rect x="53" y="43" width="16" height="10" rx="4" />
          <rect x="46" y="46" width="8" height="2" />
        </g>
      )}
      {look.accessory === 'headset' && (
        <g>
          <path d="M22 46 a28 30 0 0 1 56 0" stroke="#2a2a33" strokeWidth="4" fill="none" />
          <rect x="17" y="42" width="9" height="14" rx="4" fill="#2a2a33" />
          <rect x="74" y="42" width="9" height="14" rx="4" fill="#2a2a33" />
        </g>
      )}
    </svg>
  );
}
