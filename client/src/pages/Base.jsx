import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useBaseStore } from '../store/baseStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import ResourceGauge from '../components/ResourceGauge.jsx';
import BuildingCard from '../components/BuildingCard.jsx';
import ActiveEvents from '../components/ActiveEvents.jsx';
import BattleReports from '../components/BattleReports.jsx';
import ClaimBaseModal from '../components/ClaimBaseModal.jsx';
import TransferModal from '../components/TransferModal.jsx';
import { APP_VERSION } from '../utils/gameConstants.js';
import { formatNumber } from '../utils/format.js';
import { UNIT_META } from '../utils/gameConstants.js';
import { siloCapacity as defaultSiloCapacity } from '../utils/gameConstants.js';

export default function Base() {
  const navigate          = useNavigate();
  const activeBaseId      = useAuthStore((s) => s.activeBaseId);
  const bases             = useAuthStore((s) => s.bases);
  const setActiveBase     = useAuthStore((s) => s.setActiveBase);
  const refreshBases      = useAuthStore((s) => s.refreshBases);
  const user              = useAuthStore((s) => s.user);
  const logout            = useAuthStore((s) => s.logout);
  const gameSpecial       = useAuthStore((s) => s.gameSpecial);
  const { base, resources, rates, recentAttacks, setBase, setLoading, setError } = useBaseStore();
  const { socket }        = useSocketStore();

  // Use live config for silo capacity, fallback to hardcoded
  const siloCapacity = (level) => {
    if (gameSpecial) return (gameSpecial.siloBase ?? 1500) + level * (gameSpecial.siloPerLevel ?? 500);
    return defaultSiloCapacity(level);
  };
  const [myRank,       setMyRank]       = useState(null);
  const [showBases,    setShowBases]    = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [toasts,       setToasts]       = useState([]);
  const [currentSeason, setCurrentSeason] = useState(undefined); // undefined=loading, null=none

  // Fetch current season for no-base UI
  useEffect(() => {
    api.get('/season/current')
      .then((d) => setCurrentSeason(d.season ?? null))
      .catch(() => setCurrentSeason(null));
  }, []);

  let toastCounter = 0;
  function addToast(message, type = 'info') {
    const id = `${Date.now()}-${toastCounter++}`;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }

  const load = useCallback(async () => {
    if (!activeBaseId) return;
    setLoading(true);
    try {
      const data = await api.get(`/base/${activeBaseId}`);
      setBase(data);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBaseId]);

  useEffect(() => {
    load();
    api.get('/leaderboard/my-rank').then(setMyRank).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on('combat:completed', load);
    socket.on('combat:loot_returned', load);

    socket.on('tradepod:arrived', ({ resources }) => {
      const parts = [
        resources?.oxygen  > 0 ? `O₂ ${formatNumber(resources.oxygen)}`  : null,
        resources?.water   > 0 ? `H₂O ${formatNumber(resources.water)}`  : null,
        resources?.iron    > 0 ? `Fe ${formatNumber(resources.iron)}`     : null,
        resources?.helium3 > 0 ? `He3 ${formatNumber(resources.helium3)}` : null,
      ].filter(Boolean);
      addToast(`📦 Resources received: ${parts.join(' · ')}`, 'success');
      load();
    });

    socket.on('reinforcement:arrived', ({ units }) => {
      const parts = units
        ? Object.entries(units).filter(([, n]) => n > 0).map(([t, n]) => `${UNIT_META[t]?.icon ?? t} ${n}`)
        : [];
      addToast(`🛡 Reinforcements arrived: ${parts.join(' ')}`, 'success');
      load();
    });

    socket.on('reinforcement:returned', ({ units }) => {
      const parts = units
        ? Object.entries(units).filter(([, n]) => n > 0).map(([t, n]) => `${UNIT_META[t]?.icon ?? t} ${n}`)
        : [];
      addToast(`🔄 Units returned: ${parts.join(' ')}`, 'info');
      load();
    });

    return () => {
      socket.off('combat:completed', load);
      socket.off('combat:loot_returned', load);
      socket.off('tradepod:arrived');
      socket.off('reinforcement:arrived');
      socket.off('reinforcement:returned');
    };
  }, [socket, load]);

  // ── No bases: auto-refresh then show join screen ──
  if (bases.length === 0) {
    if (currentSeason === undefined) {
      return <div className="flex-1 flex items-center justify-center"><div className="text-slate-500 text-sm">Loading…</div></div>;
    }
    return (
      <div className="page">
        <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-white">🌙 Moonbase</h1>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-white">Logout</button>
        </div>
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center space-y-6">
          {currentSeason ? (
            <>
              <div className="text-5xl">🚀</div>
              <div>
                <div className="text-xl font-bold text-white mb-2">{currentSeason.name} is Active!</div>
                <div className="text-sm text-slate-400">Setting up your lunar base…</div>
              </div>
              <button
                onClick={async () => { await refreshBases(); }}
                className="btn-primary px-8 py-3 text-base font-semibold"
              >
                Retry / Create Base 🌕
              </button>
            </>
          ) : (
            <>
              <div className="text-5xl">🌑</div>
              <div>
                <div className="text-xl font-bold text-white mb-2">No Active Season</div>
                <div className="text-sm text-slate-400">There is no active season right now. Check back soon!</div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!base) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading base…</div>
      </div>
    );
  }

  const siloBuilding   = base.buildings?.find((b) => b.type === 'SILO');
  const siloLevel      = siloBuilding ? (siloBuilding.upgradeEndsAt ? siloBuilding.level - 1 : siloBuilding.level) : 0;
  const labBuilding    = base.buildings?.find((b) => b.type === 'RESEARCH_LAB');
  const labLevel       = labBuilding?.level ?? 0;
  const isLatestBase   = bases[bases.length - 1]?.id === activeBaseId;
  const canClaimBase   = labLevel >= 20 && isLatestBase;
  const cap = siloCapacity(siloLevel);

  const resourceList = [
    { type: 'OXYGEN',  value: resources?.oxygen  ?? 0, rate: rates?.OXYGEN  ?? 0 },
    { type: 'WATER',   value: resources?.water   ?? 0, rate: rates?.WATER   ?? 0 },
    { type: 'IRON',    value: resources?.iron    ?? 0, rate: rates?.IRON    ?? 0 },
    { type: 'HELIUM3', value: resources?.helium3 ?? 0, rate: rates?.HELIUM3 ?? 0 },
  ];

  const buildings    = base.buildings ?? [];
  const hasMultiBases = bases.length > 1;
  const activeBases  = bases;

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {hasMultiBases ? (
              <button
                onClick={() => setShowBases((v) => !v)}
                className="text-sm font-semibold text-white flex items-center gap-1 hover:text-blue-300 transition-colors"
              >
                {base.name}
                <span className="text-[10px] text-slate-500">▼</span>
              </button>
            ) : (
              <span className="text-sm font-semibold text-white">{base.name}</span>
            )}
            {myRank?.populationRank && (
              <span className="text-[10px] bg-blue-900/50 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded-full font-semibold">
                Ranked #{myRank.populationRank}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {base.season?.name ?? 'Season 1'} · <span className="text-slate-600">App {APP_VERSION}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasMultiBases && (
            <button
              onClick={() => setShowTransfer(true)}
              className="text-[11px] bg-sky-900/50 text-sky-300 border border-sky-700/50 px-2 py-1 rounded-lg font-semibold hover:bg-sky-800/60 transition-colors"
            >
              ⇄ Transfer
            </button>
          )}
          {canClaimBase && (
            <button
              onClick={() => navigate('/map?claim=1')}
              className="text-[11px] bg-green-900/50 text-green-300 border border-green-700/50 px-2 py-1 rounded-lg font-semibold hover:bg-green-800/60 transition-colors"
            >
              + New Base
            </button>
          )}
          <button
            onClick={load}
            className="text-slate-400 hover:text-white transition-colors text-lg"
            title="Refresh"
          >
            🔄
          </button>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Resources */}
        <section>
          <p className="section-title">Resources</p>
          <div className="grid grid-cols-4 gap-2">
            {resourceList.map(({ type, value, rate }) => (
              <ResourceGauge
                key={type}
                type={type}
                value={value}
                max={cap}
                rate={rate}
                onClick={() => navigate(`/base/resource/${type.toLowerCase()}`)}
              />
            ))}
          </div>
        </section>

        {/* Buildings */}
        <section>
          <p className="section-title">Structures</p>
          <div className="grid grid-cols-4 gap-2">
            {buildings.map((building) => (
              <BuildingCard
                key={building.id}
                building={building}
                onClick={() => navigate(`/base/building/${building.type.toLowerCase()}`)}
              />
            ))}
          </div>
        </section>

        {/* Active Events */}
        <section>
          <ActiveEvents base={base} />
        </section>

        {/* Battle Reports */}
        <section>
          <BattleReports
            attacks={recentAttacks}
            baseId={base.id}
          />
        </section>

        {/* Research Lab progress toward new base — only show when player has 1 base and lab < 20 */}
        {!canClaimBase && labLevel > 0 && bases.length < 2 && (
          <div className="card bg-green-950/20 border-green-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-green-400 font-semibold">🔬 Second Base Progress</span>
              <span className="text-xs text-slate-400">Research Lab L{labLevel}/20</span>
            </div>
            <div className="w-full bg-space-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(labLevel / 20) * 100}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 mt-1.5">
              Upgrade Research Lab to Level 20 to unlock a second base
            </div>
          </div>
        )}
      </div>

      {/* Base Switcher Dropdown */}
      {showBases && hasMultiBases && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setShowBases(false)}
        >
          <div
            className="absolute top-16 left-4 right-4 bg-space-800 border border-space-600/50 rounded-xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-space-600/40">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Switch Base</span>
            </div>
            {activeBases.map((b, i) => (
              <button
                key={b.id}
                onClick={() => { setActiveBase(b.id); setShowBases(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-space-700/50 transition-colors
                  ${b.id === activeBaseId ? 'bg-blue-900/30' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🏗️</span>
                  <div>
                    <div className="text-sm text-white font-medium">{b.name}</div>
                    <div className="text-xs text-slate-500">Base {i + 1}</div>
                  </div>
                </div>
                {b.id === activeBaseId && <span className="text-blue-400 text-xs">Active</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {showTransfer && (
        <TransferModal
          fromBaseId={activeBaseId}
          resources={resources}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => { setShowTransfer(false); load(); }}
        />
      )}

      {/* Toast notifications */}
      <div className="fixed top-4 left-4 right-4 z-[200] space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`w-full rounded-xl px-4 py-3 text-sm font-medium shadow-lg pointer-events-auto
              ${toast.type === 'success' ? 'bg-green-900/95 text-green-200 border border-green-700/60'
                : 'bg-space-700/95 text-slate-200 border border-space-600/60'}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}