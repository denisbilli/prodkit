import { create } from 'zustand';

// An application that runs entirely in the browser: real state, real logic, and no
// backend by design. Not a static site.
export const useSimulation = create((set) => ({
  tick: 0,
  step: () => set((s: { tick: number }) => ({ tick: s.tick + 1 })),
  save: (state: unknown) => localStorage.setItem('simulation', JSON.stringify(state)),
}));
