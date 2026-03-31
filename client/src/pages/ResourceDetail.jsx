import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { RESOURCE_META, siloCapacity, bunkerProtection } from '../utils/gameConstants.js';
import { formatNumber, formatRate, formatCountdown } from '../utils/format.js';

const TYPE_MAP = {
  oxygen: 'OXYGEN', water: 'WATER', iron: 'IRON', helium3: 'HELIUM3',
};

function buildingLevelCost(type, level) {
  const base = {
    OXYGEN:  { oxygen: 20, water: 10, iron: 30, helium3: 0,  timeSeconds: 30 },
    WATER:   { oxygen: 10, water: 20, iron: 25, helium3: 0,  timeSeconds: 30 },
    IRON:    { oxygen: 15, water: 10, iron: 40, helium3: 0,  timeSeconds: 30 },
    HELIUM3: { oxygen: 30, water: 20, iron: 50, helium3: 10, timeSeconds: 60 },
  };
  const b = base[type];
  if (!b) return null;
  const m = Math.pow(1.5, level - 1);
  return {
    oxygen:  Math.round(b.oxygen  * m),
    water:   Math.round(b.water   * m),
    iron:    Math.round(b.iron    * m),
    helium3: Math.round(b.helium3 * m),
    timeSeconds: Math.round(b.timeSeconds * Math.pow(1.5, level - 1)),
  };
}

export default function ResourceDetail() {
  const { type } = useParams();
  const navigate  = useNavigate();
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const resourceType = TYPE_MAP[type] ?? 'OXYGEN';
  const meta         = RESOURCE_META[resourceType];

  const [data, setData]     = useState(null);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [, tick]            = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const res = await api.get(`/base/${activeBaseId}/resources`);
      setData(res);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [activeBaseId]);

  async function upgradeMine(mineId) {
    setLoading(true);
    try {
      await api.post(`/base/${activeBaseId}/mine/${mineId}/upgrade`, {});
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const mines = data?.mines?.filter((m) => m.resourceType === resourceType) ?? [];
  const resourceState = data?.resourceState;
  const rates         = data?.rates ?? {};
  const capacity      = data?.capacity ?? 1000;
  const value         = resourceState?.[type] ?? resourceState?.[resourceType.toLowerCase()] ?? 0;

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/base')} className="text-slate-400 text-xl">←</button>
        <h1 className="text-sm font-semibold text-white">{meta?.label ?? type} Detail</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {error && (
          <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Overview */}
        <div className="card space-y-2">
          <div className="stat-row">
            <span className="text-slate-400 text-sm">Stored</span>
            <span className="text-white font-mono text-sm">{formatNumber(value)} / {formatNumber(capacity)}</span>
          </div>
          <div className="stat-row">
            <span className="text-slate-400 text-sm">Generation Rate</span>
            <span className="text-white font-mono text-sm">{formatRate(rates[resourceType] ?? 0)}</span>
          </div>
        </div>

        {/* Mines */}
        <div>
          <p className="section-title">{meta?.label} Mines ({mines.length})</p>
          <div className="space-y-2">
            {mines.map((mine) => {
              const nextLevel = mine.level + 1;
              const cost = nextLevel <= 20 ? buildingLevelCost(resourceType, nextLevel) : null;
              const isUpgrading = !!mine.upgradeEndsAt;
              const isMaxLevel  = mine.level >= 20;
              return (
                <div key={mine.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-white">Mine #{mine.slot}</div>
                      <div className="text-xs text-slate-500">Level {mine.level}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">
                        {mine.level > 0 ? formatRate(mine.level * (meta?.mineSlots === 6 ? 0.5 : mine.resourceType === 'IRON' ? 1 : mine.resourceType === 'WATER' ? 1.5 : 2)) : '0/min'}
                      </div>
                    </div>
                  </div>

                  {isUpgrading ? (
                    <div className="text-xs text-yellow-400 text-center py-2">
                      ⬆ Upgrading… {formatCountdown(mine.upgradeEndsAt)}
                    </div>
                  ) : isMaxLevel ? (
                    <div className="text-xs text-green-400 text-center py-2">✓ Max Level</div>
                  ) : cost && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500">
                        {cost.oxygen  > 0 && <span className="text-sky-400">O₂ {formatNumber(cost.oxygen)}</span>}
                        {cost.water   > 0 && <span className="text-blue-400">H₂O {formatNumber(cost.water)}</span>}
                        {cost.iron    > 0 && <span className="text-orange-400">Fe {formatNumber(cost.iron)}</span>}
                        {cost.helium3 > 0 && <span className="text-red-400">He3 {formatNumber(cost.helium3)}</span>}
                      </div>
                      <div className="text-[10px] text-slate-500 text-center">
                        Time: {formatCountdown(new Date(Date.now() + cost.timeSeconds * 1000))}
                      </div>
                      <button
                        onClick={() => upgradeMine(mine.id)}
                        disabled={loading}
                        className="btn-primary w-full text-xs py-2"
                      >
                        Upgrade to Lv {nextLevel}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
