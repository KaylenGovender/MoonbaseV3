import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useBaseStore } from '../store/baseStore.js';
import { useState } from 'react';

const MAIN_TABS = [
  { to: '/base',        label: 'Base',    icon: '🌕' },
  { to: '/map',         label: 'Map',     icon: '🧭' },
  { to: '/warroom',     label: 'Units',   icon: '⚔️' },
  { to: '/alliance',    label: 'Alliance',icon: '🤝' },
  { to: '/leaderboard', label: 'Ranks',   icon: '🏆' },
];

export default function NavBar() {
  const bases        = useAuthStore((s) => s.bases);
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const setActiveBase = useAuthStore((s) => s.setActiveBase);
  const user         = useAuthStore((s) => s.user);
  const [showBases, setShowBases] = useState(false);
  const navigate = useNavigate();

  // Red badge on Map tab when there is an incoming attack
  const attacksReceived = useBaseStore((s) => s.base?.attacksReceived ?? []);
  const hasIncomingAttack = attacksReceived.length > 0;

  const tabs = user?.isAdmin
    ? [...MAIN_TABS, { to: '/admin', label: 'Admin', icon: '⚙️' }]
    : MAIN_TABS;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-space-800/95 backdrop-blur border-t border-space-600/50 pb-safe">
        <div className="flex">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-0.5 transition-colors
                 ${isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`
              }
            >
              {({ isActive }) => (
                <div className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${isActive ? 'bg-blue-900/40' : ''}`}>
                  <span className="text-lg leading-none">{tab.icon}</span>
                  {tab.to === '/map' && hasIncomingAttack && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-space-800 animate-pulse" />
                  )}
                  <span className="font-medium">{tab.label}</span>
                </div>
              )}
            </NavLink>
          ))}

          {/* Base switcher icon when >1 base */}
          {bases.length > 1 && (
            <button
              onClick={() => setShowBases((v) => !v)}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-0.5 transition-colors
                ${showBases ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all ${showBases ? 'bg-green-900/40' : ''}`}>
                <span className="text-lg leading-none">🌕</span>
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
                  <span className="text-xl">🏗️</span>
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
