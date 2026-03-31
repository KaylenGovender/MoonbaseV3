import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token:  null,
      user:   null,
      bases:  [],
      activeBaseId: null,

      setAuth: ({ token, user, bases }) => {
        set({ token, user, bases, activeBaseId: bases?.[0]?.id ?? null });
      },

      setActiveBase: (baseId) => set({ activeBaseId: baseId }),

      logout: () => set({ token: null, user: null, bases: [], activeBaseId: null }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'moonbase-auth',
      partialize: (state) => ({
        token: state.token,
        user:  state.user,
        bases: state.bases,
        activeBaseId: state.activeBaseId,
      }),
    },
  ),
);
