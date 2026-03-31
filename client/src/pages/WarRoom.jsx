import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber, formatCountdown } from '../utils/format.js';
import { UNIT_META } from '../utils/gameConstants.js';

const UNIT_TYPES = ['MOONBUGGY', 'GUNSHIP', 'TANK', 'HARVESTER', 'DRONE', 'TITAN'];

export default function WarRoom() {
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const [data, setData]     = useState(null);
  const [qty,  setQty]      = useState({});
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [, tick]            = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(null);

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

  useEffect(() => { load(); }, [activeBaseId]);

  async function queueUnit(type) {
    const quantity = parseInt(qty[type]) || 1;
    setLoading(true);
    setError('');
    try {
      await api.post(`/warroom/${activeBaseId}/queue`, { unitType: type, quantity });
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

  const unitStocks = data?.unitStocks ?? [];
  const buildQueue = data?.buildQueue ?? [];
  const stats      = data?.unitStats ?? {};

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
        {buildQueue.length > 0 && (
          <div>
            <p className="section-title">Build Queue</p>
            <div className="space-y-2">
              {buildQueue.map((job) => {
                const meta = UNIT_META[job.unitType] ?? { icon: '⚔️', label: job.unitType };
                return (
                  <div key={job.id} className="card flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{meta.icon}</span>
                      <div>
                        <div className="text-sm text-white">{job.quantity}× {meta.label}</div>
                        <div className="text-xs text-slate-500">Building…</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-blue-400 font-mono text-sm">
                        {formatCountdown(job.completesAt)}
                      </div>
                      {confirmCancel === job.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => cancelJob(job.id)}
                            className="btn-danger text-xs px-2 py-1"
                          >✓</button>
                          <button
                            onClick={() => setConfirmCancel(null)}
                            className="btn-ghost text-xs px-2 py-1"
                          >✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmCancel(job.id)}
                          className="btn-ghost text-xs px-2 py-1 text-red-400 border-red-800/50"
                        >Cancel</button>
                      )}
                    </div>
                  </div>
                );
              })}
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
                  <div className="text-2xl mb-1">{meta.icon}</div>
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
              return (
                <div key={type} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meta.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-white">{meta.label}</div>
                        <div className="text-[10px] text-slate-500">
                          ATK {s.attack} · DEF {s.defense} · {s.speed}km/h
                        </div>
                      </div>
                    </div>
                    {type === 'TITAN' && (
                      <span className="badge bg-yellow-900/50 text-yellow-400 border border-yellow-700/50">
                        Max 1
                      </span>
                    )}
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
                      max={type === 'TITAN' ? 1 : 999}
                      placeholder={type === 'TITAN' ? '1' : 'Qty'}
                      value={qty[type] ?? ''}
                      onChange={(e) => setQty((q) => ({ ...q, [type]: e.target.value }))}
                      className="input flex-1 text-sm py-2"
                    />
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
