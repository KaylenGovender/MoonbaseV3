import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useBaseStore } from '../store/baseStore.js';
import { UNIT_META } from '../utils/gameConstants.js';
import UnitIcon from '../components/UnitIcon.jsx';

export default function ResearchLab() {
  const navigate     = useNavigate();
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const bases        = useAuthStore((s) => s.bases);
  const gameConfig   = useAuthStore((s) => s.gameConfig);
  const base         = useBaseStore((s) => s.base);

  const lab = base?.buildings?.find((b) => b.type === 'RESEARCH_LAB');
  const currentLevel   = lab?.level ?? 0;
  const isUpgrading    = !!lab?.upgradeEndsAt;
  const effectiveLevel = isUpgrading ? currentLevel - 1 : currentLevel;

  const buffMultiplier = 1 + effectiveLevel * 0.01;

  const unitRows = Object.entries(UNIT_META).map(([type, meta]) => {
    const srv = gameConfig?.unitStats?.[type];
    const baseAtk = srv?.attack ?? meta.attack;
    const baseDef = srv?.defense ?? meta.defense;
    const baseSpd = srv?.speed ?? meta.speed;
    const baseCry = srv?.carryCapacity ?? meta.carry;
    return {
      type,
      label: meta.label,
      base: { attack: baseAtk, defense: baseDef, speed: baseSpd, carry: baseCry },
      buffed: {
        attack:  Math.round(baseAtk * buffMultiplier),
        defense: Math.round(baseDef * buffMultiplier),
        speed:   Math.round(baseSpd * buffMultiplier),
        carry:   Math.round(baseCry * buffMultiplier),
      },
    };
  });

  const isLatestBase = bases[bases.length - 1]?.id === activeBaseId;
  const canClaimBase = effectiveLevel >= 20 && isLatestBase;

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/base')} className="text-slate-400 text-xl">←</button>
        <span className="text-xl">🔬</span>
        <h1 className="text-sm font-semibold text-white">Research Lab</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Level & Buff Info */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm">Current Level</span>
            <span className="text-2xl font-bold text-white font-mono">{effectiveLevel}</span>
          </div>
          {isUpgrading && (
            <div className="text-xs text-yellow-400">⬆ Upgrading to Level {currentLevel}…</div>
          )}
          <div className="text-sm text-green-400 font-medium">
            +{effectiveLevel}% to all unit stats
          </div>
          <button
            onClick={() => navigate('/base/building/research_lab')}
            className="btn-primary w-full text-sm"
          >
            Upgrade Research Lab
          </button>
        </div>

        {/* Unit Buff Stats Table */}
        <div className="card space-y-3">
          <p className="section-title">Unit Stat Buffs</p>

          {/* Header row */}
          <div className="grid grid-cols-5 gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-medium pb-1 border-b border-space-600/40">
            <span>Unit</span>
            <span className="text-center">Attack</span>
            <span className="text-center">Defense</span>
            <span className="text-center">Speed</span>
            <span className="text-center">Carry</span>
          </div>

          {/* Unit rows */}
          {unitRows.map((row) => (
            <div key={row.type} className="grid grid-cols-5 gap-1 items-center py-1.5 border-b border-space-600/20 last:border-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <UnitIcon type={row.type} size={18} />
                <span className="text-xs text-slate-300 truncate">{row.label}</span>
              </div>
              <StatCell base={row.base.attack}  buffed={row.buffed.attack} />
              <StatCell base={row.base.defense} buffed={row.buffed.defense} />
              <StatCell base={row.base.speed}   buffed={row.buffed.speed} />
              <StatCell base={row.base.carry}   buffed={row.buffed.carry} />
            </div>
          ))}
        </div>

        {/* Second Base Progress */}
        {!canClaimBase && effectiveLevel > 0 && bases.length < 2 && (
          <div className="card bg-green-950/20 border-green-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-green-400 font-semibold">🔬 Second Base Progress</span>
              <span className="text-xs text-slate-400">Research Lab L{effectiveLevel}/20</span>
            </div>
            <div className="w-full bg-space-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${(effectiveLevel / 20) * 100}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 mt-1.5">
              Upgrade Research Lab to Level 20 to unlock a second base
            </div>
          </div>
        )}

        {canClaimBase && (
          <div className="card bg-green-950/20 border-green-800/30 text-center space-y-2">
            <div className="text-sm text-green-400 font-semibold">✓ Second base unlocked!</div>
            <button
              onClick={() => navigate('/map?claim=1')}
              className="btn-primary text-sm px-6"
            >
              Claim New Base
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ base, buffed }) {
  const isBuffed = buffed > base;
  return (
    <div className="text-center text-xs font-mono leading-tight">
      <div className="text-slate-500">{base}</div>
      <div className={isBuffed ? 'text-green-400 font-semibold' : 'text-slate-400'}>{buffed}</div>
    </div>
  );
}
