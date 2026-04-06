import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Moon } from 'lucide-react';

export default function ClaimBaseModal({ onClose, onClaimed }) {
  const refreshBases = useAuthStore((s) => s.refreshBases);
  const [plots,   setPlots]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/base/available-plots')
      .then((d) => setPlots(d.plots ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function claim(plot) {
    setClaiming(true);
    setError('');
    try {
      const { base } = await api.post('/base/claim', { x: plot.x, y: plot.y });
      await refreshBases();
      onClaimed?.(base);
    } catch (e) {
      setError(e.message);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-space-800 rounded-2xl border border-space-600/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-space-600/50 flex items-center justify-between">
          <div>
            <div className="text-white font-bold flex items-center gap-1"><Moon size={16} className="text-amber-300" /> Claim New Base</div>
            <div className="text-xs text-slate-400 mt-0.5">Choose a plot on the lunar surface</div>
          </div>
          <button onClick={onClose} className="text-slate-500 text-xl">×</button>
        </div>

        <div className="p-5 space-y-3">
          {error && (
            <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-6 text-slate-500 text-sm">Finding available plots…</div>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Select a plot. Your new base will start at Level 1 with full resources and mines.
              </p>
              <div className="space-y-2">
                {plots.map((plot, i) => (
                  <button
                    key={plot.id}
                    onClick={() => claim(plot)}
                    disabled={claiming}
                    className="w-full card text-left hover:border-blue-500/60 hover:bg-blue-900/10 transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">Plot {i + 1}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {plot.x.toFixed(1)}km, {plot.y.toFixed(1)}km
                      </div>
                    </div>
                    <span className="text-blue-400 text-sm">Select →</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
