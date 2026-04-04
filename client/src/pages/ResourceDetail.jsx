import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import { RESOURCE_META, mineRate, MINE_RATE_PER_LEVEL } from '../utils/gameConstants.js';
import { formatNumber, formatRate, formatCountdown } from '../utils/format.js';

const TYPE_MAP = {
  oxygen: 'OXYGEN', water: 'WATER', iron: 'IRON', helium3: 'HELIUM3',
};

function mineLevelCost(type, level, gameConfig) {
  const bases = gameConfig?.mineBases?.[type];
  if (!bases) return null;
  const i = level - 1;
  const m = Math.pow(1.5, i);
  return {
    oxygen:      Math.round(bases.oxygen  * m),
    water:       Math.round(bases.water   * m),
    iron:        Math.round(bases.iron    * m),
    helium3:     Math.round(bases.helium3 * m),
    timeSeconds: Math.round(bases.time    * Math.pow(1.5, i)),
  };
}

export default function ResourceDetail() {
  const { type } = useParams();
  const navigate  = useNavigate();
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const gameConfig   = useAuthStore((s) => s.gameConfig);
  const { socket }   = useSocketStore();
  const resourceType = TYPE_MAP[type] ?? 'OXYGEN';
  const meta         = RESOURCE_META[resourceType];

  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [, tick]              = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/base/${activeBaseId}/resources`);
      setData(res);
    } catch (e) {
      setError(e.message);
    }
  }, [activeBaseId]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch rates whenever units change (reinforcements arriving change upkeep)
  useEffect(() => {
    if (!socket) return;
    const onUnitUpdate = ({ baseId }) => {
      if (baseId === activeBaseId) load();
    };
    const onReinfArrived = () => load();
    socket.on('unit:update',          onUnitUpdate);
    socket.on('reinforcement:arrived', onReinfArrived);
    return () => {
      socket.off('unit:update',          onUnitUpdate);
      socket.off('reinforcement:arrived', onReinfArrived);
    };
  }, [socket, activeBaseId, load]);

  async function upgradeMine(mineId) {
    setLoading(true);
    setError('');
    try {
      await api.post(`/base/${activeBaseId}/mine/${mineId}/upgrade`, {});
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Sort mines by slot
  const mines = [...(data?.mines?.filter((m) => m.resourceType === resourceType) ?? [])].sort((a, b) => a.slot - b.slot);
  const resourceState = data?.resourceState;
  const rates         = data?.rates ?? {};
  const capacity      = data?.capacity ?? 1000;
  const value         = resourceState?.[type] ?? 0;
  const totalRate     = rates[resourceType] ?? 0;
  const upkeep        = rates.HELIUM3_UPKEEP ?? 0;
  const netRate       = resourceType === 'HELIUM3' ? (rates.HELIUM3_NET ?? totalRate) : totalRate;

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/base')} className="text-slate-400 text-xl">←</button>
        <h1 className="text-sm font-semibold text-white">{meta?.label ?? type} Mines</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {error && (
          <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Overview card */}
        <div className="card space-y-3">
          <div className="stat-row">
            <span className="text-slate-400 text-sm">Stored</span>
            <span className="text-white font-mono text-sm">{formatNumber(value)} / {formatNumber(capacity)}</span>
          </div>
          <div className="stat-row">
            <span className="text-slate-400 text-sm">Production</span>
            <span className="font-bold text-base" style={{ color: meta?.color }}>{formatRate(totalRate)}</span>
          </div>
          {resourceType === 'HELIUM3' && upkeep > 0 && (
            <>
              <div className="stat-row">
                <span className="text-slate-400 text-sm">Unit Upkeep</span>
                <span className="text-red-400 font-bold text-base">-{formatRate(upkeep)}</span>
              </div>
              <div className="stat-row">
                <span className="text-slate-400 text-sm">Net</span>
                <span className={`font-bold text-base ${netRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netRate >= 0 ? '+' : ''}{formatRate(netRate)}
                  {netRate < 0 && ' ⚠️'}
                </span>
              </div>
              {netRate < 0 && (
                <div className="bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2 text-xs text-red-300">
                  ⚠️ Units are consuming more Helium-3 than produced. Units will die if reserves run out!
                </div>
              )}
            </>
          )}
          <div className="text-xs text-slate-500">
            Each mine level adds +{MINE_RATE_PER_LEVEL[resourceType]}/min
          </div>
        </div>

        {/* Mines — 2 column grid */}
        <div>
          <p className="section-title">{meta?.label} Mines ({mines.length})</p>
          <div className="grid grid-cols-2 gap-3">
            {mines.map((mine) => {
              const isUpgrading = !!mine.upgradeEndsAt;
              const isMaxLevel  = mine.level >= 20;
              // Use effective level — during upgrade the DB stores target level already
              const effLevel    = isUpgrading ? mine.level - 1 : mine.level;
              const nextLevel   = effLevel + 1;
              const cost        = nextLevel <= 20 ? mineLevelCost(resourceType, nextLevel, gameConfig) : null;
              const currentRate = mineRate(resourceType, effLevel);
              const nextRate    = mineRate(resourceType, effLevel + 1);
              return (
                <div key={mine.id} className={`card ${isUpgrading ? 'border-yellow-500/40' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-white">Mine #{mine.slot}</div>
                      <div className="text-xs text-slate-500">Level {effLevel}{isUpgrading ? ` → ${mine.level}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm" style={{ color: meta?.color }}>{formatRate(currentRate)}</div>
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
                      <div className="text-xs text-green-400 text-center">
                        Next: {formatRate(nextRate)} (+{MINE_RATE_PER_LEVEL[resourceType]}/min)
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                        <MineCostRow label="O₂"  cost={cost.oxygen}  have={resourceState?.oxygen}  color="text-sky-400" />
                        <MineCostRow label="H₂O" cost={cost.water}   have={resourceState?.water}   color="text-blue-400" />
                        <MineCostRow label="Fe"   cost={cost.iron}    have={resourceState?.iron}    color="text-orange-400" />
                        <MineCostRow label="He3"  cost={cost.helium3} have={resourceState?.helium3} color="text-red-400" />
                      </div>
                      <div className="text-[10px] text-slate-500 text-center">
                        ⏱ {formatCountdown(new Date(Date.now() + cost.timeSeconds * 1000))}
                      </div>
                      <button
                        onClick={() => upgradeMine(mine.id)}
                        disabled={loading}
                        className="btn-primary w-full text-xs py-1.5"
                      >
                       Upgrade → L{nextLevel}
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

function MineCostRow({ label, cost, have, color }) {
  const h = Math.floor(have ?? 0);
  const canAfford = h >= cost;
  return (
    <div className="flex items-center justify-between">
      <span className={color}>{label}</span>
      <span className={`font-mono text-[10px] ${canAfford ? 'text-white' : 'text-red-400'}`}>
        {formatNumber(cost)}
      </span>
    </div>
  );
}


