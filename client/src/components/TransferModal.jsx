import { useState, useEffect } from 'react';
import { api } from '../utils/api.js';
import { useAuthStore } from '../store/authStore.js';
import { UNIT_META } from '../utils/gameConstants.js';
import { formatNumber } from '../utils/format.js';

const RESOURCES = [
  { key: 'oxygen',  icon: '💨', label: 'Oxygen' },
  { key: 'water',   icon: '💧', label: 'Water' },
  { key: 'iron',    icon: '⚙️', label: 'Iron' },
  { key: 'helium3', icon: '⚗️', label: 'Helium-3' },
];

const UNIT_TYPES = Object.keys(UNIT_META);

export default function TransferModal({ fromBaseId, resources, onClose, onSuccess }) {
  const bases      = useAuthStore((s) => s.bases);
  const otherBases = bases.filter((b) => b.id !== fromBaseId);

  const [tab,      setTab]     = useState('resources');
  const [toBaseId, setToBaseId] = useState(otherBases[0]?.id ?? '');
  const [resVals,  setResVals]  = useState({ oxygen: '', water: '', iron: '', helium3: '' });
  const [unitVals, setUnitVals] = useState(Object.fromEntries(UNIT_TYPES.map((t) => [t, ''])));
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Fetch units for the active base
  const [unitStocks, setUnitStocks] = useState(null);
  useEffect(() => {
    api.get(`/warroom/${fromBaseId}`)
      .then((d) => {
        const map = {};
        d.unitStocks.forEach((s) => { map[s.type] = s.count; });
        setUnitStocks(map);
      })
      .catch(() => setUnitStocks({}));
  }, [fromBaseId]);

  async function handleTransfer() {
    if (!toBaseId) return setError('Select a destination base');
    setError('');
    setLoading(true);
    try {
      const resPayload = {};
      RESOURCES.forEach(({ key }) => {
        const v = parseInt(resVals[key], 10);
        if (!isNaN(v) && v > 0) resPayload[key] = v;
      });
      const unitPayload = {};
      UNIT_TYPES.forEach((t) => {
        const v = parseInt(unitVals[t], 10);
        if (!isNaN(v) && v > 0) unitPayload[t] = v;
      });
      if (Object.keys(resPayload).length === 0 && Object.keys(unitPayload).length === 0) {
        setLoading(false);
        return setError('Enter at least one amount to transfer');
      }
      await api.post(`/base/${fromBaseId}/transfer`, {
        toBaseId,
        resources: resPayload,
        units: unitPayload,
      });
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const destName = otherBases.find((b) => b.id === toBaseId)?.name ?? 'Base';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-space-800 border border-space-600/50 rounded-t-2xl w-full max-w-lg p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">⇄ Transfer Between Bases</h2>
          <button onClick={onClose} className="text-slate-500 text-xl px-1">✕</button>
        </div>

        {/* Destination selector */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 block mb-1">Transfer to</label>
          <select
            value={toBaseId}
            onChange={(e) => setToBaseId(e.target.value)}
            className="input w-full text-sm"
          >
            {otherBases.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-space-900/50 rounded-lg p-1">
          {['resources', 'units'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors capitalize
                ${tab === t ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {t === 'resources' ? '📦 Resources' : '⚔️ Units'}
            </button>
          ))}
        </div>

        {/* Resources tab */}
        {tab === 'resources' && (
          <div className="space-y-3">
            {RESOURCES.map(({ key, icon, label }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                  <span className="text-base">{icon}</span>
                  <span className="text-sm text-slate-300">{label}</span>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={resources?.[key] ?? 0}
                    placeholder="0"
                    value={resVals[key]}
                    onChange={(e) => setResVals((v) => ({ ...v, [key]: e.target.value }))}
                    className="input text-sm py-1.5 flex-1"
                  />
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    / {formatNumber(resources?.[key] ?? 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Units tab */}
        {tab === 'units' && (
          <div className="space-y-3">
            {UNIT_TYPES.map((type) => {
              const meta  = UNIT_META[type];
              const stock = unitStocks?.[type] ?? '…';
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-sm text-slate-300">{meta.label}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max={typeof stock === 'number' ? stock : undefined}
                      placeholder="0"
                      value={unitVals[type]}
                      onChange={(e) => setUnitVals((v) => ({ ...v, [type]: e.target.value }))}
                      className="input text-sm py-1.5 flex-1"
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      / {typeof stock === 'number' ? stock : stock}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

        <button
          onClick={handleTransfer}
          disabled={loading}
          className="btn-primary w-full mt-4 text-sm"
        >
          {loading ? 'Transferring…' : `Transfer to ${destName}`}
        </button>
      </div>
    </div>
  );
}
