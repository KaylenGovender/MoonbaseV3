import { useState } from 'react';
import { formatNumber } from '../utils/format.js';

const UNIT_LABELS = {
  MOONBUGGY: 'Buggy',
  GUNSHIP:   'Gunship',
  TANK:      'Tank',
  HARVESTER: 'Harvester',
  DRONE:     'Drone',
  TITAN:     'Titan',
};

function unitLabel(type) {
  return UNIT_LABELS[type] ?? type;
}

export default function BattleReports({ attacks, baseId, activeAttacksOut = 0 }) {
  const [tab, setTab] = useState('in');

  const attacksIn  = attacks.filter((a) => a.defenderBaseId === baseId && a.battleReport);
  const attacksOut = attacks.filter((a) => a.attackerBaseId === baseId && a.battleReport);
  const list       = tab === 'in' ? attacksIn : attacksOut;
  const outLabel   = attacksOut.length + activeAttacksOut;

  return (
    <div>
      <p className="section-title">Battle Reports</p>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab('in')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors
            ${tab === 'in' ? 'bg-red-900/50 text-red-300 border border-red-800/50' : 'bg-space-700 text-slate-500'}`}
        >
          Attacks In ({attacksIn.length})
        </button>
        <button
          onClick={() => setTab('out')}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors
            ${tab === 'out' ? 'bg-green-900/50 text-green-300 border border-green-800/50' : 'bg-space-700 text-slate-500'}`}
        >
          Attacks Out ({outLabel})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-6 text-slate-600 text-sm">No reports yet</div>
      ) : (
        <div className="space-y-2">
          {list.slice(0, 10).map((attack) => (
            <ReportCard key={attack.id} attack={attack} isOut={tab === 'out'} baseId={baseId} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ attack, isOut, baseId }) {
  const [open, setOpen] = useState(false);
  const r = attack.battleReport;
  if (!r) return null;

  const won         = isOut ? r.attackerWon : !r.attackerWon;
  const looted      = r.resourcesLooted ?? {};
  const totalLooted = (looted.oxygen ?? 0) + (looted.water ?? 0) + (looted.iron ?? 0) + (looted.helium3 ?? 0);
  const returning   = attack.status === 'RETURNING';

  // Unit compositions
  const attackSent = r.attackingUnits ?? attack.units ?? {};
  const attackLost = r.attackerUnitsLost ?? {};
  const defHad     = r.defendingUnits ?? {};
  const defLost    = r.defenderUnitsLost ?? {};

  // Merge all unit types
  const allTypes = [...new Set([
    ...Object.keys(attackSent),
    ...Object.keys(defHad),
  ])].filter((t) => (attackSent[t] || 0) + (defHad[t] || 0) > 0);

  return (
    <div className={`rounded-lg border text-xs overflow-hidden
      ${won ? 'border-green-800/50 bg-green-900/10' : 'border-red-800/50 bg-red-900/10'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span>{won ? '✅' : '❌'}</span>
          <div>
            <span className="text-slate-300">
              {isOut
                ? `vs ${attack.defenderBase?.name ?? 'Unknown'}`
                : `from ${attack.attackerBase?.name ?? 'Unknown'}`}
            </span>
            {returning && (
              <span className="ml-2 text-yellow-400 text-xs">↩ returning</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalLooted > 0 && (
            <span className="text-yellow-400">+{formatNumber(totalLooted)} res</span>
          )}
          <span className="text-slate-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-space-600/40 pt-2">

          {/* Unit breakdown table */}
          {allTypes.length > 0 && (
            <div>
              <div className="text-slate-500 mb-1.5 font-medium">Units</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-space-600/30">
                      <th className="text-left pb-1">Unit</th>
                      <th className="text-right pb-1 text-green-400">Sent</th>
                      <th className="text-right pb-1 text-red-400">A.Lost</th>
                      <th className="text-right pb-1 text-sky-400">A.Back</th>
                      <th className="text-right pb-1 text-slate-400">D.Had</th>
                      <th className="text-right pb-1 text-red-400">D.Lost</th>
                      <th className="text-right pb-1 text-slate-300">D.Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTypes.map((type) => {
                      const sent    = attackSent[type] ?? 0;
                      const aLost   = attackLost[type] ?? 0;
                      const aBack   = Math.max(sent - aLost, 0);
                      const dHad    = defHad[type]    ?? 0;
                      const dLost   = defLost[type]   ?? 0;
                      const dLeft   = Math.max(dHad - dLost, 0);
                      return (
                        <tr key={type} className="border-b border-space-600/20 last:border-0">
                          <td className="py-1 text-slate-400">{unitLabel(type)}</td>
                          <td className="py-1 text-right text-green-400">{sent > 0 ? sent : '—'}</td>
                          <td className="py-1 text-right text-red-400">{aLost > 0 ? aLost : '—'}</td>
                          <td className="py-1 text-right text-sky-400">{sent > 0 ? aBack : '—'}</td>
                          <td className="py-1 text-right text-slate-400">{dHad > 0 ? dHad : '—'}</td>
                          <td className="py-1 text-right text-red-400">{dLost > 0 ? dLost : '—'}</td>
                          <td className="py-1 text-right text-slate-300">{dHad > 0 ? dLeft : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resources + Points */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-slate-500 mb-1 font-medium">Resources Looted</div>
              {totalLooted > 0 ? (
                <>
                  {looted.oxygen  > 0 && <div className="text-sky-300">O₂  {formatNumber(looted.oxygen)}</div>}
                  {looted.water   > 0 && <div className="text-blue-300">H₂O {formatNumber(looted.water)}</div>}
                  {looted.iron    > 0 && <div className="text-orange-300">Fe  {formatNumber(looted.iron)}</div>}
                  {looted.helium3 > 0 && <div className="text-red-300">He3 {formatNumber(looted.helium3)}</div>}
                </>
              ) : (
                <div className="text-slate-600">None</div>
              )}
            </div>
            <div>
              <div className="text-slate-500 mb-1 font-medium">Points</div>
              <div className={r.attackerPointsChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                Attacker: {r.attackerPointsChange > 0 ? '+' : ''}{r.attackerPointsChange}
              </div>
              <div className={r.defenderPointsChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                Defender: {r.defenderPointsChange > 0 ? '+' : ''}{r.defenderPointsChange}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
