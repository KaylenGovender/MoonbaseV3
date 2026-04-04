import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../utils/api.js';
import { UNIT_META } from '../utils/gameConstants.js';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token:  null,
      user:   null,
      bases:  [],
      activeBaseId: null,
      unitSpeeds: {},        // populated by loadGameConfig on startup
      gameSpecial: null,     // silo/bunker/radar config from server
      gameConfig: null,      // full game config from server (buildingBases, mineBases, unitStats, etc.)

      setAuth: ({ token, user, bases }) => {
        set({ token, user, bases, activeBaseId: bases?.[0]?.id ?? null });
      },

      setActiveBase: (baseId) => set({ activeBaseId: baseId }),

      refreshBases: async () => {
        try {
          const { bases } = await api.get('/auth/bases');
          set((s) => ({
            bases,
            activeBaseId: bases.some((b) => b.id === s.activeBaseId)
              ? s.activeBaseId
              : bases[0]?.id ?? null,
          }));
        } catch (e) {
          console.error('[authStore] refreshBases failed:', e.message);
        }
      },

      loadGameConfig: async () => {
        try {
          const cfg = await api.get('/config/game');
          const stats = cfg?.unitStats ?? {};
          const speeds = Object.fromEntries(
            Object.entries(stats).map(([k, v]) => [k, v.speed ?? UNIT_META[k]?.speed ?? 10])
          );
          set({ unitSpeeds: speeds, gameSpecial: cfg?.special ?? null, gameConfig: cfg });
        } catch (e) {
          console.error('[authStore] loadGameConfig failed:', e.message);
          // Fall back to hardcoded defaults on failure
          const speeds = Object.fromEntries(
            Object.entries(UNIT_META).map(([k, v]) => [k, v.speed ?? 10])
          );
          set({ unitSpeeds: speeds });
        }
      },

      logout: () => set({ token: null, user: null, bases: [], activeBaseId: null, gameConfig: null, gameSpecial: null }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'moonbase-auth',
      partialize: (state) => ({
        token: state.token,
        user:  state.user,
        bases: state.bases,
        activeBaseId: state.activeBaseId,
        // gameConfig, unitSpeeds intentionally NOT persisted — always fetch fresh on load
      }),
    },
  ),
);

