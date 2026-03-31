import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';

const TABS = [
  { key: 'population', label: 'Population',  icon: '🏠' },
  { key: 'attacker',   label: 'Attackers',   icon: '⚔️' },
  { key: 'defender',   label: 'Defenders',   icon: '🛡️' },
  { key: 'raider',     label: 'Raiders',     icon: '💰' },
];

export default function Leaderboard() {
  const user   = useAuthStore((s) => s.user);
  const [tab,  setTab]   = useState('population');
  const [data, setData]  = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const path = tab === 'population'
      ? '/leaderboard/population'
      : `/leaderboard/medals?type=${tab}`;
    api.get(path)
      .then((d) => setData(d.entries ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    api.get('/leaderboard/my-rank')
      .then(setMyRank)
      .catch(() => {});
  }, []);

  const rankMeta = { 1: '🥇', 2: '🥈', 3: '🥉' };

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3">
        <h1 className="text-sm font-semibold text-white">🏆 Leaderboards</h1>
      </div>

      {/* My Rank Card */}
      {myRank && (
        <div className="mx-4 mt-4 card space-y-1">
          <p className="section-title mb-2">Your Stats</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="stat-row"><span className="text-slate-400">Population Rank</span><span className="text-white font-mono">#{myRank.populationRank ?? '—'}</span></div>
            <div className="stat-row"><span className="text-slate-400">Population Pts</span><span className="text-white font-mono">{formatNumber(myRank.populationPoints)}</span></div>
            <div className="stat-row"><span className="text-slate-400">⚔️ Attacker</span><span className="text-white font-mono">{formatNumber(myRank.attackerMedals)}</span></div>
            <div className="stat-row"><span className="text-slate-400">🛡️ Defender</span><span className="text-white font-mono">{formatNumber(myRank.defenderMedals)}</span></div>
          </div>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex border-b border-space-600/50 mt-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[11px] font-medium transition-colors
              ${tab === t.key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">No data yet</div>
        ) : (
          <div className="space-y-1">
            {data.map((entry) => {
              const isMe = entry.userId === user?.id;
              return (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg
                    ${isMe ? 'bg-blue-900/30 border border-blue-700/40' : 'bg-space-700/50'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm">
                      {rankMeta[entry.rank] ?? entry.rank}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-space-600 flex items-center justify-center text-xs font-bold text-white">
                      {(entry.username ?? '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className={`text-sm font-medium ${isMe ? 'text-blue-300' : 'text-white'}`}>
                        {entry.username}
                        {isMe && <span className="text-[10px] text-blue-400 ml-1">(you)</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono text-sm">{formatNumber(entry.points)}</div>
                    <div className="text-[10px] text-slate-500">pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
