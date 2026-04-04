import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';
import { UNIT_META } from '../utils/gameConstants.js';

function calcDistance(a, b) {
  if (!a || !b) return null;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function formatEtaDuration(minutes) {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${Math.ceil(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.ceil(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function AttackModal({ targetBase, playerBase, playerBaseIds, onClose, onLaunched }) {
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const unitSpeeds   = useAuthStore((s) => s.unitSpeeds); // loaded at app startup, always fresh
  const [units, setUnits]   = useState({});
  const [stocks, setStocks] = useState([]);
  const [error,  setError]  = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/warroom/${activeBaseId}`)
      .then((d) => setStocks(d.unitStocks ?? []))
      .catch(() => {});
  }, [activeBaseId]);

  function setQty(type, val) {
    const max = stocks.find((s) => s.type === type)?.count ?? 0;
    const qty = Math.min(Math.max(0, parseInt(val) || 0), max);
    setUnits((u) => ({ ...u, [type]: qty }));
  }

  async function launch() {
    const payload = Object.fromEntries(
      Object.entries(units).filter(([, v]) => v > 0),
    );
    if (Object.keys(payload).length === 0) {
      return setError('Select at least one unit');
    }
    setLoading(true);
    setError('');
    try {
      await api.post(`/warroom/${activeBaseId}/attack`, {
        targetBaseId: targetBase.id,
        units: payload,
      });
      onLaunched?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Distance + ETA calculation
  const distance = useMemo(() => calcDistance(playerBase, targetBase), [playerBase, targetBase]);

  const eta = useMemo(() => {
    const selected = Object.entries(units).filter(([, v]) => v > 0);
    if (selected.length === 0 || !distance) return null;
    const speeds = unitSpeeds ?? {};
    const slowest = selected.reduce((minSpeed, [type]) => {
      const speed = speeds[type] ?? UNIT_META[type]?.speed ?? 10;
      return Math.min(minSpeed, speed);
    }, Infinity);
    if (slowest === Infinity) return null;
    return (distance / slowest) * 60; // minutes
  }, [units, distance, unitSpeeds]);

  const totalSelected = Object.values(units).reduce((s, v) => s + v, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-space-800 rounded-2xl border border-space-600/50 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-space-600/50 flex items-center justify-between">
          <div>
            <div className="text-white font-semibold">Launch Attack</div>
            <div className="text-xs text-slate-400">Target: {targetBase.name}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 text-xl px-2">✕</button>
        </div>

        {/* Distance + ETA preview */}
        {distance !== null && (
          <div className="mx-4 mt-3 bg-space-700/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">📍 Distance: <span className="text-white font-mono">{Math.round(distance)} km</span></span>
            {eta !== null ? (
              <span className="text-slate-400">⏱ ETA: <span className="text-yellow-400 font-mono">{formatEtaDuration(eta)}</span> <span className="text-slate-600">(slowest unit)</span></span>
            ) : (
              <span className="text-slate-600">Select units to see ETA</span>
            )}
          </div>
        )}

        <div className="p-4 space-y-3">
          {error && (
            <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {stocks.filter((s) => s.count > 0).map((stock) => {
            const meta  = UNIT_META[stock.type] ?? { icon: '⚔️', label: stock.type };
            const qty   = units[stock.type] ?? 0;
            const speed = (unitSpeeds ?? {})[stock.type] ?? meta.speed;
            return (
              <div key={stock.type} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32">
                  <span className="text-xl">{meta.icon}</span>
                  <div>
                    <div className="text-sm text-white">{meta.label}</div>
                    <div className="text-xs text-slate-500">Avail: {formatNumber(stock.count)}</div>
                    {speed && <div className="text-[10px] text-slate-600">{speed}km/h</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(stock.type, qty - 1)}
                    className="w-9 h-9 rounded-lg bg-space-700 text-white text-lg flex items-center justify-center"
                  >−</button>
                  <input
                    type="number"
                    min={0}
                    max={stock.count}
                    value={qty}
                    onChange={(e) => setQty(stock.type, e.target.value)}
                    className="input w-20 text-center py-2 text-sm"
                  />
                  <button
                    onClick={() => setQty(stock.type, qty + 1)}
                    className="w-9 h-9 rounded-lg bg-space-700 text-white text-lg flex items-center justify-center"
                  >+</button>
                  <button
                    onClick={() => setQty(stock.type, stock.count)}
                    className="text-xs text-blue-400"
                  >All</button>
                </div>
              </div>
            );
          })}

          {stocks.every((s) => s.count === 0) && (
            <div className="text-center text-slate-500 text-sm py-4">No units available</div>
          )}

          {totalSelected > 0 && eta !== null && (
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2 text-xs text-yellow-300 text-center">
              ⏱ {totalSelected} units will arrive in <strong>{formatEtaDuration(eta)}</strong>
            </div>
          )}

          <button
            onClick={launch}
            disabled={loading}
            className="btn-danger w-full mt-2"
          >
            {loading ? 'Launching…' : '⚔️ Launch Attack'}
          </button>
        </div>
      </div>
    </div>
  );
}
