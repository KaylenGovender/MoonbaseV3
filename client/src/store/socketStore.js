import { create } from 'zustand';
import { io } from 'socket.io-client';
import { useBaseStore } from './baseStore.js';

export const useSocketStore = create((set, get) => ({
  socket:    null,
  connected: false,

  connect: (token) => {
    if (get().socket?.connected) return;

    const socket = io('/', {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect',    () => set({ connected: true  }));
    socket.on('disconnect', () => set({ connected: false }));

    // Resource live updates
    socket.on('resource:update', ({ resources }) => {
      useBaseStore.getState().updateResources(resources);
    });

    // Building update
    socket.on('building:update', (update) => {
      useBaseStore.getState().updateBuilding(update);
    });

    // Mine update
    socket.on('mine:update', (update) => {
      useBaseStore.getState().updateMine(update);
    });

    // Unit update
    socket.on('unit:update', (update) => {
      useBaseStore.getState().updateUnits(update);
    });

    // Combat report
    socket.on('combat:report', ({ report }) => {
      useBaseStore.getState().addBattleReport(report);
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, connected: false });
  },
}));
