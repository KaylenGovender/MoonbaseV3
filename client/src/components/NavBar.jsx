import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useBaseStore } from '../store/baseStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { useState, useEffect } from 'react';
import { Home, Compass, Swords, Users, MessageCircle, Trophy, LayoutGrid } from 'lucide-react';

const MAIN_TABS = [
  { to: '/base',        label: 'Base',     Icon: Home },
  { to: '/map',         label: 'Map',      Icon: Compass },
  { to: '/warroom',     label: 'Units',    Icon: Swords },
  { to: '/alliance',    label: 'Alliance', Icon: Users },
  { to: '/chat',        label: 'Chat',     Icon: MessageCircle },
  { to: '/leaderboard', label: 'Ranks',    Icon: Trophy },
];

export default function NavBar() {
  const bases        = useAuthStore((s) => s.bases);
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const setActiveBase = useAuthStore((s) => s.setActiveBase);
  const user         = useAuthStore((s) => s.user);
  const allianceNotif = useSocketStore((s) => s.allianceNotif);
  const clearAllianceNotif = useSocketStore((s) => s.clearAllianceNotif);
  const unreadChatCount = useSocketStore((s) => s.unreadChatCount);
  const clearChatNotif = useSocketStore((s) => s.clearChatNotif);
  const location = useLocation();
  const [showBases, setShowBases] = useState(false);
  const navigate = useNavigate();

  // Clear alliance notification when user navigates to alliance page
  useEffect(() => {
    if (location.pathname.startsWith('/alliance') && allianceNotif) {
      clearAllianceNotif();
    }
    if (location.pathname.startsWith('/chat') && unreadChatCount > 0) {
      clearChatNotif();
    }
  }, [location.pathname, allianceNotif, unreadChatCount]);

  // Red badge on Map tab when there is an incoming attack
  const attacksReceived = useBaseStore((s) => s.base?.attacksReceived ?? []);
  const hasIncomingAttack = attacksReceived.length > 0;

  const tabs = MAIN_TABS;

  // Season gating: non-admin users with no bases can only access /base
  const hasBases = bases.length > 0;
  const isSeasonGated = !hasBases && !user?.isAdmin;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-space-800/95 backdrop-blur border-t border-space-600/50 pb-safe">
        <div className="flex">
          {tabs.map((tab) => {
            const gated = isSeasonGated && tab.to !== '/base' && tab.to !== '/admin';
            return (
              <NavLink
                key={tab.to}
                to={gated ? '#' : tab.to}
                onClick={gated ? (e) => e.preventDefault() : undefined}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-0.5 transition-colors
                   ${gated ? 'text-slate-700 pointer-events-auto cursor-not-allowed' : isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`
                }
              >
                {({ isActive }) => (
                  <div className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${!gated && isActive ? 'bg-blue-900/40' : ''}`}>
                    <tab.Icon size={20} strokeWidth={1.8} />
                    {tab.to === '/map' && hasIncomingAttack && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-space-800 animate-pulse" />
                    )}
                    {tab.to === '/alliance' && allianceNotif && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border border-space-800 animate-pulse" />
                    )}
                    {tab.to === '/chat' && unreadChatCount > 0 && (
                      <span className="absolute -top-1 -right-2 bg-green-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center border border-space-800">
                        {unreadChatCount > 99 ? '99+' : unreadChatCount}
                      </span>
                    )}
                    <span className="font-medium">{tab.label}</span>
                  </div>
                )}
              </NavLink>
            );
          })}

          {/* Base switcher icon when >1 base */}
          {bases.length > 1 && (
            <button
              onClick={() => setShowBases((v) => !v)}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-0.5 transition-colors
                ${showBases ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${showBases ? 'bg-green-900/40' : ''}`}>
                <LayoutGrid size={20} strokeWidth={1.8} />
                <span className="font-medium">Bases</span>
              </div>
            </button>
          )}
        </div>
      </nav>

      {/* Base switcher sheet */}
      {showBases && bases.length > 1 && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setShowBases(false)}
        >
          <div
            className="absolute bottom-[56px] left-0 right-0 bg-space-800 border-t border-space-600/50 rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-space-600/40 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Your Bases
            </div>
            {bases.map((b, i) => (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBase(b.id);
                  setShowBases(false);
                  navigate('/base');
                }}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-space-700/50 transition-colors
                  ${b.id === activeBaseId ? 'bg-blue-900/20' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <LayoutGrid size={20} strokeWidth={1.8} className="text-slate-400 shrink-0" />
                  <div className="text-left">
                    <div className="text-sm text-white font-medium">{b.name}</div>
                    <div className="text-xs text-slate-500">Base {i + 1}</div>
                  </div>
                </div>
                {b.id === activeBaseId && (
                  <span className="text-blue-400 text-xs font-semibold">Active</span>
                )}
              </button>
            ))}
            <div className="h-4" />
          </div>
        </div>
      )}
    </>
  );
}
