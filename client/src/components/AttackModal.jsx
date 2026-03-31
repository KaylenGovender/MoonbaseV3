import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';
import { UNIT_META } from '../utils/gameConstants.js';

export default function AttackModal({ targetBase, playerBaseIds, onClose, onLaunched }) {
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
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

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full bg-space-800 rounded-t-2xl border-t border-space-600/50 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-space-600/50 flex items-center justify-between">
          <div>
            <div className="text-white font-semibold">Launch Attack</div>
            <div className="text-xs text-slate-400">Target: {targetBase.name}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 text-xl px-2">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {stocks.filter((s) => s.count > 0).map((stock) => {
            const meta = UNIT_META[stock.type] ?? { icon: '⚔️', label: stock.type };
            const qty  = units[stock.type] ?? 0;
            return (
              <div key={stock.type} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-32">
                  <span className="text-xl">{meta.icon}</span>
                  <div>
                    <div className="text-sm text-white">{meta.label}</div>
                    <div className="text-xs text-slate-500">Available: {formatNumber(stock.count)}</div>
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
