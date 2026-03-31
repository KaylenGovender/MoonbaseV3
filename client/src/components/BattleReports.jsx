import { useState } from 'react';
import { formatNumber } from '../utils/format.js';

export default function BattleReports({ attacks, baseId }) {
  const [tab, setTab] = useState('in');

  const attacksIn  = attacks.filter((a) => a.defenderBaseId === baseId && a.battleReport);
  const attacksOut = attacks.filter((a) => a.attackerBaseId === baseId && a.battleReport);
  const list       = tab === 'in' ? attacksIn : attacksOut;

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
          Attacks Out ({attacksOut.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-6 text-slate-600 text-sm">No reports yet</div>
      ) : (
        <div className="space-y-2">
          {list.slice(0, 10).map((attack) => (
            <ReportCard key={attack.id} attack={attack} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ attack, tab }) {
  const [open, setOpen] = useState(false);
  const r = attack.battleReport;
  if (!r) return null;

  const won         = tab === 'out' ? r.attackerWon : !r.attackerWon;
  const looted      = r.resourcesLooted ?? {};
  const totalLooted = (looted.oxygen ?? 0) + (looted.water ?? 0) + (looted.iron ?? 0) + (looted.helium3 ?? 0);

  return (
    <div className={`rounded-lg border text-xs overflow-hidden
      ${won ? 'border-green-800/50 bg-green-900/10' : 'border-red-800/50 bg-red-900/10'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span>{won ? '✅' : '❌'}</span>
          <span className="text-slate-300">
            {tab === 'out'
              ? `vs ${attack.defenderBase?.name ?? 'Unknown'}`
              : `from ${attack.attackerBase?.name ?? 'Unknown'}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalLooted > 0 && (
            <span className="text-yellow-400">+{formatNumber(totalLooted)} res</span>
          )}
          <span className="text-slate-600">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-space-600/40 pt-2">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <div className="text-slate-500 mb-1">Resources Looted</div>
              <div className="text-slate-300">O₂ {formatNumber(looted.oxygen ?? 0)}</div>
              <div className="text-slate-300">H₂O {formatNumber(looted.water ?? 0)}</div>
              <div className="text-slate-300">Fe {formatNumber(looted.iron ?? 0)}</div>
              <div className="text-slate-300">He3 {formatNumber(looted.helium3 ?? 0)}</div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">Points</div>
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
