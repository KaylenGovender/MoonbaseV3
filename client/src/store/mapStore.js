import { create } from 'zustand';

export const useMapStore = create((set) => ({
  bases:         [],
  attacks:       [],
  tradePods:     [],
  playerBaseIds: [],
  playerBases:   [],
  visRadius:     10,

  setMapData: (data) =>
    set({
      bases:         data.bases         ?? [],
      attacks:       data.attacks        ?? [],
      tradePods:     data.tradePods      ?? [],
      playerBaseIds: data.playerBaseIds  ?? [],
      playerBases:   data.playerBases    ?? [],
      visRadius:     data.visRadius      ?? 10,
    }),

  removeAttack: (attackId) =>
    set((state) => ({
      attacks: state.attacks.filter((a) => a.id !== attackId),
    })),
}));
