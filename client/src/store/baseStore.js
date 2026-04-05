import { create } from 'zustand';

export const useBaseStore = create((set, get) => ({
  base:          null,
  resources:     null,
  rates:         null,
  recentAttacks: [],
  toasts:        [],
  loading:       false,
  error:         null,

  setBase: (data) =>
    set({
      base:          data.base,
      resources:     data.base?.resourceState,
      rates:         data.rates,
      recentAttacks: data.recentAttacks ?? [],
      loading:       false,
      error:         null,
    }),

  updateResources: (resources) =>
    set((state) => ({
      resources: { ...state.resources, ...resources },
    })),

  updateBuilding: (update) =>
    set((state) => {
      if (!state.base) return {};
      const buildings = state.base.buildings.map((b) =>
        b.type === update.type ? { ...b, ...update } : b,
      );
      return { base: { ...state.base, buildings } };
    }),

  updateMine: (update) =>
    set((state) => {
      if (!state.base) return {};
      const mines = state.base.mines.map((m) =>
        m.id === update.mineId ? { ...m, ...update } : m,
      );
      return { base: { ...state.base, mines } };
    }),

  updateUnits: ({ stocks }) =>
    set((state) => {
      if (!state.base) return {};
      return { base: { ...state.base, unitStocks: stocks } };
    }),

  addBattleReport: (report) =>
    set((state) => ({
      recentAttacks: [report, ...state.recentAttacks].slice(0, 20),
    })),

  reinforcementReports: [],
  addReinforcementReport: (entry) =>
    set((state) => ({
      reinforcementReports: [entry, ...state.reinforcementReports].slice(0, 20),
    })),

  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: Date.now() + Math.random() }],
    })),

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setLoading: (loading) => set({ loading }),
  setError:   (error)   => set({ error }),
}));
