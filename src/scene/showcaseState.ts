import { create } from 'zustand';
/** Camera-only preview; never grants district ownership or changes economy. */
export const useShowcase = create<{ active: boolean; set: (active: boolean) => void }>(set => ({active:false,set:active=>set({active})}));
