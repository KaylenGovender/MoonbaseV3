import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber, formatCountdown } from '../utils/format.js';
import { BUILDING_META, siloCapacity, bunkerProtection, radarRange, constructionYardReduction } from '../utils/gameConstants.js';

const TYPE_UPPER_MAP = {
  silo: 'SILO', bunker: 'BUNKER', research_lab: 'RESEARCH_LAB',
  radar: 'RADAR', war_room: 'WAR_ROOM', construction_yard: 'CONSTRUCTION_YARD',
  alliance: 'ALLIANCE', trade_pod: 'TRADE_POD',
};

function buildingLevelCost(type, level) {
  const baseCosts = {
    SILO:              { oxygen: 50,  water: 30,  iron: 100, helium3: 0,  time: 60  },
    BUNKER:            { oxygen: 30,  water: 20,  iron: 150, helium3: 0,  time: 90  },
    RESEARCH_LAB:      { oxygen: 100, water: 50,  iron: 200, helium3: 10, time: 120 },
    RADAR:             { oxygen: 80,  water: 40,  iron: 120, helium3: 5,  time: 90  },
    WAR_ROOM:          { oxygen: 60,  water: 80,  iron: 200, helium3: 20, time: 120 },
    CONSTRUCTION_YARD: { oxygen: 100, water: 60,  iron: 300, helium3: 10, time: 180 },
    ALLIANCE:          { oxygen: 50,  water: 50,  iron: 100, helium3: 10, time: 60  },
    TRADE_POD:         { oxygen: 40,  water: 40,  iron: 80,  helium3: 20, time: 90  },
  };
  const b = baseCosts[type];
  if (!b || level < 1 || level > 20) return null;
  const m = Math.pow(1.6, level - 1);
  return {
    oxygen:      Math.round(b.oxygen  * m),
    water:       Math.round(b.water   * m),
    iron:        Math.round(b.iron    * m),
    helium3:     Math.round(b.helium3 * m),
    timeSeconds: Math.round(b.time    * Math.pow(1.8, level - 1)),
  };
}

function getBuildingEffect(type, level) {
  switch (type) {
    case 'SILO':              return `Storage: ${formatNumber(siloCapacity(level))} per resource`;
    case 'BUNKER':            return `Protects ${bunkerProtection(level)}% of resources`;
    case 'RADAR':             return `Visibility: ${radarRange(level)} km radius`;
    case 'CONSTRUCTION_YARD': return `Build time reduction: ${constructionYardReduction(level)}%`;
    case 'RESEARCH_LAB':      return level >= 20 ? '✓ Extra base unlocked' : `${20 - level} more levels to unlock extra base`;
    case 'WAR_ROOM':          return 'Enables unit training';
    case 'ALLIANCE':          return `Max alliance size: ${level}`;
    case 'TRADE_POD':         return 'Enables resource transfers';
    default:                  return '';
  }
}

export default function BuildingDetail() {
  const { buildingType } = useParams();
  const navigate          = useNavigate();
  const activeBaseId      = useAuthStore((s) => s.activeBaseId);
  const typeKey           = TYPE_UPPER_MAP[buildingType] ?? buildingType.toUpperCase();
  const meta              = BUILDING_META[typeKey] ?? { icon: '🏢', label: typeKey };

  const [building, setBuilding]   = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [resources, setResources] = useState(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [, tick]                  = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    try {
      const [bRes, rRes] = await Promise.all([
        api.get(`/base/${activeBaseId}/buildings`),
        api.get(`/base/${activeBaseId}/resources`),
      ]);
      setBuildings(bRes.buildings);
      setBuilding(bRes.buildings.find((b) => b.type === typeKey) ?? null);
      setResources(rRes.resourceState);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [activeBaseId, typeKey]);

  async function upgrade() {
    setLoading(true);
    setError('');
    try {
      await api.post(`/base/${activeBaseId}/building/${typeKey}/upgrade`, {});
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const currentLevel = building?.level ?? 0;
  const nextLevel    = currentLevel + 1;
  const cost         = nextLevel <= 20 ? buildingLevelCost(typeKey, nextLevel) : null;
  const anyUpgrading = buildings.some((b) => b.upgradeEndsAt);
  const isUpgrading  = !!building?.upgradeEndsAt;
  const isMaxLevel   = currentLevel >= 20;
  const cyBuilding   = buildings.find((b) => b.type === 'CONSTRUCTION_YARD');
  const reduction    = constructionYardReduction(cyBuilding?.level ?? 0);
  const adjustedTime = cost ? Math.round(cost.timeSeconds * (1 - reduction / 100)) : 0;

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/base')} className="text-slate-400 text-xl">←</button>
        <span className="text-xl">{meta.icon}</span>
        <h1 className="text-sm font-semibold text-white">{meta.label}</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">Current Level</span>
            <span className="text-2xl font-bold text-white font-mono">{currentLevel}</span>
          </div>
          <div className="text-sm text-slate-300">{getBuildingEffect(typeKey, currentLevel)}</div>
        </div>

        {isUpgrading ? (
          <div className="card border-yellow-600/50 text-center space-y-2">
            <div className="text-yellow-400 text-sm font-medium">⬆ Upgrading to Level {currentLevel}</div>
            <div className="text-yellow-300 font-mono text-lg">{formatCountdown(building.upgradeEndsAt)}</div>
          </div>
        ) : isMaxLevel ? (
          <div className="card text-center text-green-400 font-medium">✓ Maximum Level Reached</div>
        ) : cost && (
          <div className="card space-y-3">
            <div className="text-sm font-semibold text-white">Upgrade to Level {nextLevel}</div>

            <div>
              <div className="section-title">Cost</div>
              <div className="space-y-1">
                {cost.oxygen  > 0 && <ResourceCostRow label="O₂ Oxygen"  color="text-sky-400"    cost={cost.oxygen}  have={resources?.oxygen}  />}
                {cost.water   > 0 && <ResourceCostRow label="H₂O Water"  color="text-blue-400"   cost={cost.water}   have={resources?.water}   />}
                {cost.iron    > 0 && <ResourceCostRow label="Fe Iron"     color="text-orange-400" cost={cost.iron}    have={resources?.iron}    />}
                {cost.helium3 > 0 && <ResourceCostRow label="He3"         color="text-red-400"    cost={cost.helium3} have={resources?.helium3} />}
              </div>
            </div>

            <div>
              <div className="section-title">Build Time</div>
              <div className="text-white text-sm font-mono">
                {formatCountdown(new Date(Date.now() + adjustedTime * 1000))}
                {reduction > 0 && <span className="text-green-400 text-xs ml-2">(-{reduction}% Construction Yard)</span>}
              </div>
            </div>

            <div>
              <div className="section-title">Next Level Effect</div>
              <div className="text-sm text-slate-300">{getBuildingEffect(typeKey, nextLevel)}</div>
            </div>

            <button
              onClick={upgrade}
              disabled={loading || anyUpgrading}
              className="btn-primary w-full"
            >
              {loading ? 'Upgrading…' : anyUpgrading && !isUpgrading ? 'Another building is upgrading' : `Upgrade to Level ${nextLevel}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCostRow({ label, color, cost, have }) {
  const h = Math.floor(have ?? 0);
  const canAfford = h >= cost;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-space-600/30 last:border-0 text-sm">
      <span className={color}>{label}</span>
      <span className="font-mono">
        <span className={canAfford ? 'text-white' : 'text-red-400'}>{formatNumber(cost)}</span>
        <span className="text-slate-500 mx-1">/</span>
        <span className={canAfford ? 'text-green-400' : 'text-red-400'}>{formatNumber(h)}</span>
      </span>
    </div>
  );
}
