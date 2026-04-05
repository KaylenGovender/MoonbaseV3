import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useBaseStore } from '../store/baseStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import { formatNumber, formatCountdown } from '../utils/format.js';
import { UNIT_META, HELIUM_UPKEEP } from '../utils/gameConstants.js';
import UnitIcon from '../components/UnitIcon.jsx';

const UNIT_TYPES = ['MOONBUGGY', 'GUNSHIP', 'TANK', 'HARVESTER', 'DRONE', 'TITAN'];

export default function WarRoom() {
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const baseResources = useBaseStore((s) => s.resources); // live resource values from base store
  const liveUnitStocks = useBaseStore((s) => s.base?.unitStocks); // real-time from WebSocket
  const { socket } = useSocketStore();
  const [data, setData]     = useState(null);
  const [qty,  setQty]      = useState({});
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [, tick]            = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [reinforcements, setReinforcements] = useState({ outgoing: [], incoming: [] });

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const d = await api.get(`/warroom/${activeBaseId}`);
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadReinforcements() {
    try {
      const r = await api.get(`/reinforcement/${activeBaseId}`);
      setReinforcements(r);
    } catch {}
  }

  useEffect(() => {
    load();
    loadReinforcements();
  }, [activeBaseId]);

  // Auto-refresh build queue when units complete or reinforcements change
  useEffect(() => {
    if (!socket) return;
    const refresh = ({ baseId }) => {
      if (baseId === activeBaseId) { load(); loadReinforcements(); }
    };
    const refreshSimple = () => { load(); loadReinforcements(); };
    socket.on('unit:update', refresh);
    socket.on('reinforcement:arrived', refreshSimple);
    socket.on('reinforcement:returned', refreshSimple);
    return () => {
      socket.off('unit:update', refresh);
      socket.off('reinforcement:arrived', refreshSimple);
      socket.off('reinforcement:returned', refreshSimple);
    };
  }, [socket, activeBaseId]);

  async function recallReinforcement(id) {
    try {
      await api.post(`/reinforcement/${id}/recall`, {});
      await loadReinforcements();
    } catch (e) {
      setError(e.message);
    }
  }

  async function returnReinforcement(id) {
    try {
      await api.post(`/reinforcement/${id}/return`, {});
      await loadReinforcements();
    } catch (e) {
      setError(e.message);
    }
  }

  async function queueUnit(type) {
    const quantity = parseInt(qty[type]) || 1;
    setLoading(true);
    setError('');
    try {
      const s = stats[type]; // capture before async load clears ref
      await api.post(`/warroom/${activeBaseId}/queue`, { unitType: type, quantity });
      // Immediately deduct cost from store so Max/quantity recalc is correct before next WS tick
      if (s?.cost) {
        const cur = useBaseStore.getState().resources ?? {};
        useBaseStore.getState().updateResources({
          oxygen:  Math.max(0, (cur.oxygen  ?? 0) - s.cost.oxygen  * quantity),
          water:   Math.max(0, (cur.water   ?? 0) - s.cost.water   * quantity),
          iron:    Math.max(0, (cur.iron    ?? 0) - s.cost.iron    * quantity),
          helium3: Math.max(0, (cur.helium3 ?? 0) - s.cost.helium3 * quantity),
        });
      }
      await load();
      setQty((q) => ({ ...q, [type]: '' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelJob(jobId) {
    setConfirmCancel(null);
    try {
      await api.delete(`/warroom/${activeBaseId}/queue/${jobId}`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const unitStocks = liveUnitStocks ?? data?.unitStocks ?? []; // prefer live WS data
  const buildQueue = data?.buildQueue ?? [];
  const stats      = data?.unitStats ?? {};
  const outgoing   = reinforcements.outgoing ?? [];
  const incoming   = reinforcements.incoming ?? [];

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3">
        <h1 className="text-sm font-semibold text-white">⚔️ War Room</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {error && (
          <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Build Queue */}
        {buildQueue.length > 0 && (() => {
          // Group build jobs by unit type for compact display
          const grouped = {};
          for (const job of buildQueue) {
            if (!grouped[job.unitType]) {
              grouped[job.unitType] = { unitType: job.unitType, jobs: [], totalRemaining: 0, earliestCompletes: null, latestCompletes: null };
            }
            const g = grouped[job.unitType];
            g.jobs.push(job);
            g.totalRemaining += job.quantity ?? 1;
            const t = new Date(job.completesAt).getTime();
            if (!g.earliestCompletes || t < g.earliestCompletes) g.earliestCompletes = t;
            if (!g.latestCompletes || t > g.latestCompletes) g.latestCompletes = t;
          }

          return (
          <div>
            <p className="section-title">Build Queue</p>
            <div className="space-y-2">
              {Object.values(grouped).map((g) => {
                const meta = UNIT_META[g.unitType] ?? { icon: '⚔️', label: g.unitType };
                const lastJob = g.jobs[g.jobs.length - 1];
                return (
                  <div key={g.unitType} className="card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl"><UnitIcon type={g.unitType} size={22} /></span>
                        <div>
                          <div className="text-sm text-white">{g.totalRemaining}× {meta.label}</div>
                          <div className="text-xs text-slate-500">
                            {g.totalRemaining > 1
                              ? `Next unit in ${formatCountdown(new Date(g.earliestCompletes))} · All done in ${formatCountdown(new Date(g.latestCompletes))}`
                              : 'Building…'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-blue-400 font-mono text-sm">
                          {formatCountdown(new Date(g.latestCompletes))}
                        </div>
                        {confirmCancel === g.unitType ? (
                          <div className="flex gap-1">
                            <button onClick={() => cancelJob(lastJob.id)} className="btn-danger text-xs px-2 py-1">✓</button>
                            <button onClick={() => setConfirmCancel(null)} className="btn-ghost text-xs px-2 py-1">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmCancel(g.unitType)} className="btn-ghost text-xs px-2 py-1 text-red-400 border-red-800/50">Cancel</button>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    {g.totalRemaining > 1 && (
                      <div className="mt-2 h-1 rounded-full bg-space-600 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${Math.max(5, ((Date.now() - new Date(g.jobs[0].startedAt).getTime()) / (g.latestCompletes - new Date(g.jobs[0].startedAt).getTime())) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Active Reinforcements */}
        {(outgoing.length > 0 || incoming.length > 0) && (
          <div>
            <p className="section-title">Reinforcements</p>
            <div className="space-y-2">
              {outgoing.map((r) => {
                const eta = r.status === 'IN_TRANSIT' ? new Date(r.arrivalTime) : null;
                const returnEta = r.status === 'RECALLED' && r.returnTime ? new Date(r.returnTime) : null;
                const etaStr = eta
                  ? formatCountdown(eta) || 'Arriving...'
                  : returnEta
                    ? formatCountdown(returnEta) || 'Returning...'
                    : null;
                return (
                  <div key={r.id} className="card flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm text-white flex items-center flex-wrap gap-x-2">
                        <span>→ {r.toBase?.name ?? 'Unknown'}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full
                          ${r.status === 'IN_TRANSIT' ? 'bg-blue-900/50 text-blue-300'
                            : r.status === 'ARRIVED'   ? 'bg-green-900/50 text-green-300'
                            : 'bg-yellow-900/50 text-yellow-300'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {Object.entries(r.units).map(([t, n]) => `${UNIT_META[t]?.icon ?? t} ${n}`).join(' · ')}
                      </div>
                      {etaStr && (
                        <div className="text-xs text-blue-400 mt-0.5">
                          ⏱ {r.status === 'RECALLED' ? 'Returns in' : 'Arrives in'} {etaStr}
                        </div>
                      )}
                    </div>
                    {r.status === 'IN_TRANSIT' && (
                      <button onClick={() => recallReinforcement(r.id)} className="btn-ghost text-xs px-3 py-1 text-yellow-400 border-yellow-800/50 ml-2">
                        📥 Recall
                      </button>
                    )}
                  </div>
                );
              })}
              {incoming.map((r) => (
                <div key={r.id} className="card flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm text-green-300 flex items-center gap-x-2">
                      <span>← {r.fromBase?.name ?? 'Unknown'}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-300">ARRIVED</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {Object.entries(r.units).map(([t, n]) => `${UNIT_META[t]?.icon ?? t} ${n}`).join(' · ')}
                    </div>
                    <div className="text-xs text-green-500 mt-0.5">✅ Defending your base</div>
                  </div>
                  <button onClick={() => returnReinforcement(r.id)} className="btn-ghost text-xs px-3 py-1 text-orange-400 border-orange-800/50 ml-2">
                    🔄 Return
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Army */}
        <div>
          <p className="section-title">Current Army</p>
          <div className="grid grid-cols-3 gap-2">
            {UNIT_TYPES.map((type) => {
              const stock = unitStocks.find((s) => s.type === type);
              const meta  = UNIT_META[type] ?? { icon: '⚔️', label: type };
              return (
                <div key={type} className="card text-center py-3">
                  <div className="text-2xl mb-1"><UnitIcon type={type} size={28} /></div>
                  <div className="text-xs text-slate-400 mb-1">{meta.label}</div>
                  <div className="text-lg font-bold text-white font-mono">
                    {formatNumber(stock?.count ?? 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Train Units */}
        <div>
          <p className="section-title">Train Units</p>
          <div className="space-y-2">
            {UNIT_TYPES.map((type) => {
              const meta = UNIT_META[type] ?? { icon: '⚔️', label: type };
              const s    = stats[type];
              if (!s) return null;

              // Calculate max affordable from current resources
              const res = baseResources ?? {};
              const maxAffordable = s.cost
                ? Math.max(0, Math.floor(Math.min(
                    s.cost.oxygen  > 0 ? (res.oxygen  ?? 0) / s.cost.oxygen  : Infinity,
                    s.cost.water   > 0 ? (res.water   ?? 0) / s.cost.water   : Infinity,
                    s.cost.iron    > 0 ? (res.iron    ?? 0) / s.cost.iron    : Infinity,
                    s.cost.helium3 > 0 ? (res.helium3 ?? 0) / s.cost.helium3 : Infinity,
                  )))
                : 0;

              return (
                <div key={type} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl"><UnitIcon type={type} size={28} /></span>
                      <div>
                        <div className="text-sm font-semibold text-white">{meta.label}</div>
                        <div className="text-[10px] text-slate-500">
                          ATK {s.attack} · DEF {s.defense} · {s.speed}km/h · Cap {s.carryCapacity} · <span className="text-red-400">He3 {HELIUM_UPKEEP[type]}/min</span>
                        </div>
                        <div className="text-[10px] text-slate-600">
                          ⏱ {s.buildTime ?? 30}s each
                          {qty[type] > 0 && ` · Total: ${Math.ceil((s.buildTime ?? 30) * parseInt(qty[type] || 1) / 60)}m for ${qty[type]}`}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Max: {maxAffordable}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500 mb-2">
                    {s.cost.oxygen  > 0 && <span className="text-sky-400">O₂ {formatNumber(s.cost.oxygen)}</span>}
                    {s.cost.water   > 0 && <span className="text-blue-400">H₂O {formatNumber(s.cost.water)}</span>}
                    {s.cost.iron    > 0 && <span className="text-orange-400">Fe {formatNumber(s.cost.iron)}</span>}
                    {s.cost.helium3 > 0 && <span className="text-red-400">He3 {formatNumber(s.cost.helium3)}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={qty[type] ?? ''}
                      onChange={(e) => setQty((q) => ({ ...q, [type]: e.target.value }))}
                      className="input flex-1 text-sm py-2"
                    />
                    <button
                      onClick={() => setQty((q) => ({ ...q, [type]: String(maxAffordable) }))}
                      disabled={maxAffordable <= 0}
                      className="btn-ghost py-2 px-3 text-xs text-yellow-400 border-yellow-800/50 disabled:opacity-30"
                    >
                      Max
                    </button>
                    <button
                      onClick={() => queueUnit(type)}
                      disabled={loading}
                      className="btn-primary py-2 px-4 text-xs"
                    >
                      Train
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

