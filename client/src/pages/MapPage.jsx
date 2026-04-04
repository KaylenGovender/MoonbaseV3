import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { useMapStore } from '../store/mapStore.js';
import { api } from '../utils/api.js';
import CanvasMap from '../components/CanvasMap.jsx';
import AttackModal from '../components/AttackModal.jsx';
import { radarRange, UNIT_META } from '../utils/gameConstants.js';

function useProtectionCountdown(protectedUntil) {
  const [ms, setMs] = useState(() => protectedUntil ? new Date(protectedUntil) - Date.now() : 0);
  useEffect(() => {
    if (!protectedUntil) return;
    const id = setInterval(() => setMs(new Date(protectedUntil) - Date.now()), 1000);
    return () => clearInterval(id);
  }, [protectedUntil]);
  if (!protectedUntil || ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export default function MapPage() {
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const claimMode     = searchParams.get('claim') === '1';
  const { socket }    = useSocketStore();
  const activeBaseId  = useAuthStore((s) => s.activeBaseId);
  const setActiveBase = useAuthStore((s) => s.setActiveBase);
  const refreshBases  = useAuthStore((s) => s.refreshBases);
  const { bases, attacks, tradePods, playerBases, playerBaseIds, visRadius, setMapData, removeAttack, transitionAttackReturning } = useMapStore();
  const [selectedBase, setSelectedBase] = useState(null);
  const [showAttack,   setShowAttack]   = useState(false);
  const [showChat,     setShowChat]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [reinfUnits,   setReinfUnits]   = useState({});
  const [reinfLoading, setReinfLoading] = useState(false);
  const [reinfError,   setReinfError]   = useState('');
  const [reinfSuccess, setReinfSuccess] = useState('');

  // ── Claim mode ──
  const [availablePlots, setAvailablePlots] = useState([]);
  const [selectedPlot,   setSelectedPlot]   = useState(null);
  const [claimLoading,   setClaimLoading]   = useState(false);
  const [claimError,     setClaimError]     = useState('');

  useEffect(() => {
    if (!claimMode) return;
    api.get('/base/available-plots')
      .then((d) => setAvailablePlots(d.plots ?? []))
      .catch((e) => setClaimError(e.message));
  }, [claimMode]);

  async function confirmClaim() {
    if (!selectedPlot) return;
    setClaimLoading(true);
    setClaimError('');
    try {
      const { base } = await api.post('/base/claim', { x: selectedPlot.x, y: selectedPlot.y });
      await refreshBases();
      setActiveBase(base.id);
      navigate('/base');
    } catch (e) {
      setClaimError(e.message);
      setClaimLoading(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/map/bases');
      setMapData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on('map:attack_returning',  transitionAttackReturning);
    socket.on('map:attack_completed',  ({ attackId }) => removeAttack(attackId));
    socket.on('map:attack_launched',   load);
    return () => {
      socket.off('map:attack_returning');
      socket.off('map:attack_completed');
      socket.off('map:attack_launched');
    };
  }, [socket]);

  function handleBaseClick(base) {
    setShowAttack(false);
    setShowChat(false);
    setReinfError('');
    setReinfSuccess('');
    setReinfUnits({});
    setSelectedBase(base);
    // Don't auto-open attack modal — show info panel first so player sees distance + protection
  }

  async function sendReinforcements() {
    const units = Object.fromEntries(
      Object.entries(reinfUnits).filter(([, v]) => parseInt(v) > 0).map(([k, v]) => [k, parseInt(v)])
    );
    if (Object.keys(units).length === 0) {
      setReinfError('Select at least one unit type.');
      return;
    }
    setReinfLoading(true);
    setReinfError('');
    try {
      await api.post(`/reinforcement/${activeBaseId}/send`, { targetBaseId: selectedBase.id, units });
      setReinfSuccess('Reinforcements dispatched!');
      setReinfUnits({});
    } catch (e) {
      setReinfError(e.message);
    } finally {
      setReinfLoading(false);
    }
  }

  // Radar info from player's active base
  const playerBase = playerBases.find((b) => b.id === activeBaseId) ?? playerBases[0];
  const radarLevel = playerBase?.radarLevel ?? 1;
  const radarKm    = radarRange(radarLevel);

  const allyBases = bases.filter((b) => b.isAlly);
  const allianceBaseIds = allyBases.map((b) => b.id);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#050f1e' }}>
      {/* Header */}
      <div className="bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <h1 className="text-sm font-semibold text-white">🧭 Lunar Map</h1>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">
            📡 Radar L{radarLevel} · <span className="text-sky-400">{radarKm}km</span>
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Own
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Ally
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Enemy
          </span>
        </div>
      </div>

      {/* Canvas — fills remaining height; nav bar is fixed overlay */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-space-900/80 z-10">
            <div className="text-slate-400 text-sm">Loading map…</div>
          </div>
        )}
        <CanvasMap
          bases={bases}
          attacks={attacks}
          tradePods={tradePods}
          playerBases={playerBases}
          visRadius={visRadius}
          allianceBaseIds={allianceBaseIds}
          activeBaseId={activeBaseId}
          onBaseClick={claimMode ? undefined : handleBaseClick}
          availablePlots={claimMode ? availablePlots : []}
          onPlotClick={claimMode ? setSelectedPlot : undefined}
          disableFog={claimMode}
        />
      </div>

      {/* Own-base info panel */}
      {selectedBase && selectedBase.isOwn && !showAttack && (
        <div className="bg-space-800 border-t border-space-600/50 px-4 py-3 pb-24 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sky-400 font-medium text-sm">🏗️ {selectedBase.name}</div>
              <div className="text-xs text-slate-400">Your base</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActiveBase(selectedBase.id); navigate('/base'); }}
                className="btn-primary text-xs px-3 py-1.5"
              >
                View Base →
              </button>
              <button onClick={() => setSelectedBase(null)} className="text-slate-500 text-lg px-2">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Ally base — reinforcements panel */}
      {selectedBase && selectedBase.isAlly && (
        <div className="bg-space-800 border-t border-green-700/30 px-4 py-3 pb-24 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-green-400 font-medium text-sm">🤝 {selectedBase.name}</div>
              <div className="text-xs text-slate-400">Ally · Commander {selectedBase.username}</div>
            </div>
            <button onClick={() => setSelectedBase(null)} className="text-slate-500 text-lg px-2">✕</button>
          </div>
          {reinfSuccess ? (
            <div className="text-green-400 text-sm py-2 text-center">{reinfSuccess}</div>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-2">Send Reinforcements</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {Object.entries(UNIT_META).map(([type, meta]) => (
                  <div key={type} className="flex items-center gap-1">
                    <span className="text-base">{meta.icon}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={reinfUnits[type] ?? ''}
                      onChange={(e) => setReinfUnits((u) => ({ ...u, [type]: e.target.value }))}
                      className="input text-xs py-1 w-full"
                    />
                  </div>
                ))}
              </div>
              {reinfError && <p className="text-red-400 text-xs mb-2">{reinfError}</p>}
              <button
                onClick={sendReinforcements}
                disabled={reinfLoading}
                className="btn-primary w-full text-sm"
              >
                {reinfLoading ? 'Sending…' : '🛡 Send Reinforcements'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Enemy-base quick-attack bar */}
      {selectedBase && !selectedBase.isOwn && !selectedBase.isAlly && !showAttack && !claimMode && (
        <div className="bg-space-800 border-t border-space-600/50 px-4 py-3 pb-24 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-red-400 font-medium text-sm">⚠️ {selectedBase.name}</div>
              <div className="text-xs text-slate-400">Commander {selectedBase.username}</div>
              {playerBase && (
                <div className="text-xs text-slate-500">
                  📍 {Math.sqrt((selectedBase.x - playerBase.x) ** 2 + (selectedBase.y - playerBase.y) ** 2).toFixed(1)} km away
                </div>
              )}
              {selectedBase.isProtected && selectedBase.protectedUntil && (
                <div className="text-yellow-400 text-xs mt-0.5">
                  🛡️ New player — protected until {new Date(selectedBase.protectedUntil).toLocaleString()}
                </div>
              )}
            </div>
            <button onClick={() => setSelectedBase(null)} className="text-slate-500 text-lg px-2">✕</button>
          </div>
          {!selectedBase.isProtected && (
            <div className="flex gap-2">
              <button onClick={() => setShowAttack(true)} className="btn-danger flex-1 text-sm">⚔️ Attack</button>
            </div>
          )}
        </div>
      )}

      {/* Claim mode — top banner */}
      {claimMode && (
        <div className="absolute top-12 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="bg-yellow-900/90 border border-yellow-600/50 text-yellow-200 text-xs px-4 py-2 rounded-full">
            🌕 Tap a numbered plot to place your new base
          </div>
        </div>
      )}

      {/* Claim mode — confirmation / cancel panel */}
      {claimMode && (
        <div className="bg-space-800 border-t border-yellow-700/40 px-4 py-3 pb-24 flex-shrink-0">
          {selectedPlot ? (
            <>
              <div className="text-yellow-300 text-sm font-medium mb-1">
                📍 Plot #{availablePlots.indexOf(selectedPlot) + 1} — ({selectedPlot.x.toFixed(1)}km, {selectedPlot.y.toFixed(1)}km)
              </div>
              {playerBase && (
                <div className="text-xs text-slate-400 mb-2">
                  {Math.sqrt((selectedPlot.x - playerBase.x) ** 2 + (selectedPlot.y - playerBase.y) ** 2).toFixed(1)} km from Base 1
                </div>
              )}
              {claimError && <p className="text-red-400 text-xs mb-2">{claimError}</p>}
              <div className="flex gap-2">
                <button onClick={confirmClaim} disabled={claimLoading} className="btn-primary flex-1 text-sm">
                  {claimLoading ? 'Claiming…' : '✅ Confirm Location'}
                </button>
                <button onClick={() => setSelectedPlot(null)} className="btn-ghost text-sm px-4">Change</button>
                <button onClick={() => navigate(-1)} className="btn-ghost text-sm px-3 text-slate-500">Cancel</button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">
                {availablePlots.length ? `${availablePlots.length} locations available` : 'Loading plots…'}
              </span>
              <button onClick={() => navigate(-1)} className="btn-ghost text-sm text-slate-500">Cancel</button>
            </div>
          )}
          {claimError && !selectedPlot && <p className="text-red-400 text-xs mt-1">{claimError}</p>}
        </div>
      )}

      {/* Attack Modal */}
      {showAttack && selectedBase && (
        <AttackModal
          targetBase={selectedBase}
          playerBase={playerBase}
          playerBaseIds={playerBaseIds}
          onClose={() => { setShowAttack(false); setSelectedBase(null); }}
          onLaunched={() => { setShowAttack(false); setSelectedBase(null); load(); }}
        />
      )}
    </div>
  );
}