import { create } from 'zustand';
import { io } from 'socket.io-client';
import { useBaseStore } from './baseStore.js';
import { useAuthStore } from './authStore.js';

function isActiveBase(baseId) {
  return baseId === useAuthStore.getState().activeBaseId;
}

export const useSocketStore = create((set, get) => ({
  socket:    null,
  connected: false,
  allianceNotif: false, // unread alliance chat/request/invite
  chatNotif: false,     // unread DM messages

  clearAllianceNotif: () => set({ allianceNotif: false }),
  clearChatNotif:     () => set({ chatNotif: false }),

  connect: (token) => {
    // Destroy any existing socket before creating a new one (prevents duplicate listeners)
    const existing = get().socket;
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    const socket = io('/', {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on('connect',    () => set({ connected: true  }));
    socket.on('disconnect', () => set({ connected: false }));

    // Resource live updates — only apply if event is for the active base
    socket.on('resource:update', ({ baseId, resources }) => {
      if (isActiveBase(baseId)) {
        useBaseStore.getState().updateResources(resources);
      }
    });

    // Building update
    socket.on('building:update', (update) => {
      if (!update.baseId || isActiveBase(update.baseId)) {
        useBaseStore.getState().updateBuilding(update);
      }
    });

    // Mine update
    socket.on('mine:update', (update) => {
      if (!update.baseId || isActiveBase(update.baseId)) {
        useBaseStore.getState().updateMine(update);
      }
    });

    // Unit update
    socket.on('unit:update', (update) => {
      if (!update.baseId || isActiveBase(update.baseId)) {
        useBaseStore.getState().updateUnits(update);
      }
    });

    // Combat report — only for active base
    socket.on('combat:report', ({ attackId, report, role }) => {
      const baseId = role === 'attacker' ? report.attackerBaseId : report.defenderBaseId;
      if (!baseId || isActiveBase(baseId)) {
        useBaseStore.getState().addBattleReport(report);
      }
    });

    // Helium attrition — notify user units are dying
    socket.on('helium:attrition', ({ baseId, unitType, message }) => {
      if (isActiveBase(baseId)) {
        useBaseStore.getState().addToast?.({ type: 'warning', message: message || `⚠️ A ${unitType} was lost — no helium!` });
      }
    });

    // Season ended
    socket.on('season:ended', () => {
      window.location.reload();
    });

    // Alliance chat notification — set dot when message arrives and user isn't on alliance page
    socket.on('chat:message', (msg) => {
      if (msg.allianceId && !window.location.pathname.startsWith('/alliance')) {
        set({ allianceNotif: true });
      }
      // DM messages trigger chat tab notification when user isn't on /chat
      if (!msg.allianceId && msg.toUserId && !window.location.pathname.startsWith('/chat')) {
        set({ chatNotif: true });
      }
    });

    set({ socket });
  },

  disconnect: () => {
    const s = get().socket;
    if (s) {
      s.removeAllListeners();
      s.disconnect();
    }
    set({ socket: null, connected: false });
  },
}));
