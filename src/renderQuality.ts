import { create } from 'zustand';

export type Quality = 'balanced' | 'sharp' | 'smooth';
export const QUALITY = {
  balanced: { label: '自动', dpr: 1.5, multisampling: 4, shadow: 1024, shadowHz: 20 },
  sharp: { label: '清晰', dpr: 2, multisampling: 4, shadow: 2048, shadowHz: 30 },
  smooth: { label: '流畅', dpr: 1, multisampling: 0, shadow: 512, shadowHz: 12 },
} as const;
function savedQuality(): Quality {
  try {
    const value = localStorage.getItem('boss-render-quality');
    return value === 'sharp' || value === 'smooth' ? value : 'balanced';
  } catch { return 'balanced'; }
}
export const useRenderQuality = create<{ quality: Quality; tier: number; setTier: (tier: number) => void; setQuality: (quality: Quality) => void; cycle: () => void }>((set) => ({
  quality: savedQuality(),
  tier: 0,
  setTier: (tier) => set({ tier }),
  setQuality: quality => {
    try { localStorage.setItem('boss-render-quality', quality); } catch { /* optional */ }
    set({ quality, tier: 0 });
  },
  cycle: () => set((state) => {
    const quality = state.quality === 'balanced' ? 'sharp' : state.quality === 'sharp' ? 'smooth' : 'balanced';
    try { localStorage.setItem('boss-render-quality', quality); } catch { /* Storage is optional. */ }
    return { quality, tier: 0 };
  }),
}));
