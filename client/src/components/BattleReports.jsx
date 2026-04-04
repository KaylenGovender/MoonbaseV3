import { useState } from 'react';
import { formatNumber } from '../utils/format.js';

const UNIT_LABELS = {
  MOONBUGGY: 'Moonbuggy',
  GUNSHIP:   'Gunship',
  TANK:      'Tank',
  HARVESTER: 'Harvester',
  DRONE:     'Drone',
  TITAN:     'Titan',
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BattleReports({ attacks, baseId }) {
  // Merge all completed battles, sort latest first, take last 10
  const reports = attacks
    .filter((a) => a.battleReport)
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt))
    .slice(0, 5);

  return (
    <div>
      <p className="section-title">Battle Reports</p>
      {reports.length === 0 ? (
        <div className="text-center py-6 text-slate-600 text-sm">No battles yet</div>
      ) : (
        <div className="space-y-2">
          {reports.map((attack) => (
            <ReportCard key={attack.id} attack={attack} baseId={baseId} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ attack, baseId }) {
  const [open, setOpen] = useState(false);
  const r = attack.battleReport;
  if (!r) return null;

  const isOut  = attack.attackerBaseId === baseId;
  const won    = isOut ? r.attackerWon : !r.attackerWon;
  const looted = r.resourcesLooted ?? {};

  const attackSent = r.attackingUnits  ?? attack.units ?? {};
  const attackLost = r.attackerUnitsLost ?? {};
  const defHad     = r.defendingUnits  ?? {};
  const defLost    = r.defenderUnitsLost ?? {};

  const unitTypes = [...new Set([...Object.keys(attackSent), ...Object.keys(defHad)])]
    .filter((t) => (attackSent[t] || 0) + (defHad[t] || 0) > 0);

  const opponentName = isOut
    ? (attack.defenderBase?.name ?? 'Unknown')
    : (attack.attackerBase?.name ?? 'Unknown');

  const totalLooted = Object.values(looted).reduce((s, v) => s + (v ?? 0), 0);

  return (
    <div className={`rounded-xl border overflow-hidden
      ${won ? 'border-green-700/50 bg-green-950/30' : 'border-red-700/50 bg-red-950/30'}`}>

      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-3 text-left gap-2"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base">{won ? '🏆' : '💀'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {isOut ? `⚔️ You attacked ${opponentName}` : `🛡 ${opponentName} attacked you`}
            </div>
            <div className="text-xs text-slate-500">{timeAgo(attack.updatedAt ?? attack.createdAt)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {won ? (
            <span className="text-xs bg-green-800/60 text-green-300 px-2 py-0.5 rounded-full font-semibold">Victory</span>
          ) : (
            <span className="text-xs bg-red-800/60 text-red-300 px-2 py-0.5 rounded-full font-semibold">Defeat</span>
          )}
          <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-space-600/30 pt-2">

          {/* Unit outcome narrative */}
          {unitTypes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Your Forces</div>
              {unitTypes.map((type) => {
                const sent  = attackSent[type] ?? 0;
                const lost  = isOut ? (attackLost[type] ?? 0) : (defLost[type] ?? 0);
                const had   = isOut ? sent : (defHad[type] ?? 0);
                if (had === 0) return null;
                const back  = Math.max(had - lost, 0);
                return (
                  <div key={type} className="flex items-center justify-between text-xs bg-space-800/60 rounded-lg px-3 py-1.5">
                    <span className="text-slate-300">{UNIT_LABELS[type] ?? type}</span>
                    <div className="flex items-center gap-3">
                      {isOut && <span className="text-slate-400">Sent: <span className="text-white font-mono">{sent}</span></span>}
                      {!isOut && <span className="text-slate-400">Had: <span className="text-white font-mono">{had}</span></span>}
                      <span className="text-red-400">Lost: <span className="font-mono">{lost}</span></span>
                      {isOut && <span className="text-sky-400">Returned: <span className="font-mono">{back}</span></span>}
                      {!isOut && <span className="text-green-400">Remaining: <span className="font-mono">{back}</span></span>}
                    </div>
                  </div>
                );
              })}

              {/* Enemy forces */}
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-2">Enemy Forces</div>
              {unitTypes.map((type) => {
                const had  = isOut ? (defHad[type] ?? 0) : (attackSent[type] ?? 0);
                const lost = isOut ? (defLost[type] ?? 0) : (attackLost[type] ?? 0);
                if (had === 0) return null;
                return (
                  <div key={`e-${type}`} className="flex items-center justify-between text-xs bg-space-800/60 rounded-lg px-3 py-1.5">
                    <span className="text-slate-300">{UNIT_LABELS[type] ?? type}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Had: <span className="text-white font-mono">{had}</span></span>
                      <span className="text-red-400">Lost: <span className="font-mono">{lost}</span></span>
                      <span className="text-slate-400">Left: <span className="font-mono">{Math.max(had - lost, 0)}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Loot */}
          <div className="bg-space-800/60 rounded-lg px-3 py-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
              {isOut ? 'Resources Looted' : 'Resources Lost'}
            </div>
            {totalLooted > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {looted.oxygen  > 0 && <span className="text-sky-300">O₂ {formatNumber(looted.oxygen)}</span>}
                {looted.water   > 0 && <span className="text-blue-300">H₂O {formatNumber(looted.water)}</span>}
                {looted.iron    > 0 && <span className="text-orange-300">Fe {formatNumber(looted.iron)}</span>}
                {looted.helium3 > 0 && <span className="text-red-300">He3 {formatNumber(looted.helium3)}</span>}
                <span className="text-slate-400 ml-1">(Total: {formatNumber(totalLooted)})</span>
              </div>
            ) : (
              <div className="text-slate-600 text-xs">None</div>
            )}
          </div>

          {/* Points */}
          <div className="flex gap-3 text-xs">
            {r.attackerPointsChange !== undefined && (
              <span className={r.attackerPointsChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                Attacker pts: {r.attackerPointsChange > 0 ? '+' : ''}{r.attackerPointsChange}
              </span>
            )}
            {r.defenderPointsChange !== undefined && (
              <span className={r.defenderPointsChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                Defender pts: {r.defenderPointsChange > 0 ? '+' : ''}{r.defenderPointsChange}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


