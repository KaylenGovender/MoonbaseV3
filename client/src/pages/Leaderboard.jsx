import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';
import { getInitials } from '../utils/format.js';
import PlayerProfileModal from '../components/PlayerProfileModal.jsx';
import ChatList from '../components/ChatList.jsx';

const TABS = [
  { key: 'alliances', label: 'Alliances',   icon: '🤝' },
  { key: 'population', label: 'Population', icon: '👥' },
  { key: 'attacker',  label: 'Attackers',   icon: '⚔️' },
  { key: 'defender',  label: 'Defenders',   icon: '🛡️' },
  { key: 'raider',    label: 'Raiders',     icon: '💰' },
];

function formatCountdownFull(ms) {
  if (ms <= 0) return 'Awarding soon…';
  const totalSeconds = Math.floor(ms / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatSeasonCountdown(endDate) {
  if (!endDate) return 'No end date set';
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return 'Season ended';
  const totalSeconds = Math.floor(ms / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h remaining`;
  return `${h}h remaining`;
}

export default function Leaderboard() {
  const user   = useAuthStore((s) => s.user);
  const [tab,  setTab]   = useState('alliances');
  const [data, setData]  = useState([]);
  const [allianceData, setAllianceData] = useState([]);
  const [populationData, setPopulationData] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const [allianceModal, setAllianceModal] = useState(null); // { name, members }
  const [showChats, setShowChats] = useState(false);
  const [, tick] = useState(0);

  // Tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch current season info for banner
  useEffect(() => {
    api.get('/season/current').then((d) => setSeason(d.season ?? null)).catch(() => {});
  }, []);

  // Fetch alliances leaderboard
  useEffect(() => {
    api.get('/leaderboard/alliances').then((d) => setAllianceData(d.entries ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'alliances' || tab === 'population') return;
    setLoading(true);
    const path = `/leaderboard/medals?type=${tab}`;
    api.get(path)
      .then((d) => setData(d.entries ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [tab]);

  // Fetch population leaderboard
  useEffect(() => {
    if (tab !== 'population') return;
    setLoading(true);
    api.get('/leaderboard/population')
      .then((d) => setPopulationData(d.entries ?? []))
      .catch(() => setPopulationData([]))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    api.get('/leaderboard/my-rank')
      .then(setMyRank)
      .catch(() => {});
  }, []);

  const rankMeta = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const nextAward = season?.currentWeekEnd ? new Date(season.currentWeekEnd) : null;
  const msLeft = nextAward ? nextAward.getTime() - Date.now() : 0;

  return (
    <div className="page">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-white">🏆 Leaderboards</h1>
        <button onClick={() => setShowChats(true)} className="text-lg hover:scale-110 transition-transform">💬</button>
      </div>

      {/* Season info banner */}
      {season && (
        <div className="mx-4 mt-4 bg-indigo-950/40 border border-indigo-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-indigo-300 font-semibold">🌙 {season.name}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{formatSeasonCountdown(season.endDate)}</div>
          </div>
          <div className={`text-xs font-mono font-bold ${season.isActive ? 'text-green-400' : 'text-slate-500'}`}>
            {season.isActive ? '● Active' : 'Inactive'}
          </div>
        </div>
      )}

      {/* Medal countdown */}
      {nextAward && (
        <div className="mx-4 mt-3 bg-yellow-950/40 border border-yellow-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-yellow-400 font-semibold">🏅 Next Weekly Medals — Week {season?.currentWeekNumber}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {nextAward.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div className="text-yellow-300 font-mono font-bold text-sm">
            {formatCountdownFull(msLeft)}
          </div>
        </div>
      )}

      {/* My Rank Card */}
      {myRank && (
        <div className="mx-4 mt-3 card space-y-1">
          <p className="section-title mb-2">Your Stats</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="stat-row"><span className="text-slate-400">Population Rank</span><span className="text-white font-mono">#{myRank.populationRank ?? '—'}</span></div>
            <div className="stat-row"><span className="text-slate-400">Population Pts</span><span className="text-white font-mono">{formatNumber(myRank.populationPoints)}</span></div>
            <div className="stat-row"><span className="text-slate-400">⚔️ Attacker Pts</span><span className="text-white font-mono">{formatNumber(myRank.attackerMedals)}</span></div>
            <div className="stat-row"><span className="text-slate-400">🛡️ Defender Pts</span><span className="text-white font-mono">{formatNumber(myRank.defenderMedals)}</span></div>
          </div>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex border-b border-space-600/50 mt-3 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-none px-3 py-2.5 text-[11px] font-medium transition-colors
              ${tab === t.key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="px-4 py-3">
        {tab === 'alliances' ? (
          allianceData.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">No alliances yet</div>
          ) : (
            <div className="space-y-1">
              {allianceData.map((entry, i) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-space-700/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 text-center text-sm font-mono font-bold text-slate-400">
                      {rankMeta[i + 1] || <span className="text-slate-500">#{i + 1}</span>}
                    </span>
                    <div>
                      <button
                        className="text-sm font-medium text-white hover:text-blue-300 transition-colors text-left"
                        onClick={async () => {
                          try {
                            const d = await api.get(`/alliance/${entry.id}/members`);
                            setAllianceModal({ name: d.name, members: d.members ?? [] });
                          } catch (e) {
                            console.error('Failed to load members', e);
                          }
                        }}
                      >
                        {entry.name} <span className="text-[10px] text-slate-500">↗</span>
                      </button>
                      <div className="text-[10px] text-slate-500">{entry.memberCount} members</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono text-sm">{formatNumber(entry.score)}</div>
                    <div className="text-[10px] text-slate-500">pts</div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'population' ? (
          loading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>
          ) : populationData.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">No population data yet</div>
          ) : (
            <div className="space-y-1">
              {populationData.map((entry) => {
                const isMe = entry.userId === user?.id;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg
                      ${isMe ? 'bg-blue-900/30 border border-blue-700/40' : 'bg-space-700/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 text-center text-sm font-mono font-bold text-slate-400">
                        {rankMeta[entry.rank] ?? <span className="text-slate-500">#{entry.rank}</span>}
                      </span>
                      <button
                        onClick={() => setProfileUser({ userId: entry.userId, username: entry.username })}
                        className="w-8 h-8 rounded-full bg-space-600 hover:bg-space-500 flex items-center justify-center text-xs font-bold text-white transition-colors"
                      >
                        {getInitials(entry.username ?? '?')}
                      </button>
                      <button
                        onClick={() => setProfileUser({ userId: entry.userId, username: entry.username })}
                        className="text-left hover:text-blue-400 transition-colors"
                      >
                        <div className={`text-sm font-medium ${isMe ? 'text-blue-300' : 'text-white'}`}>
                          {entry.username}
                          {isMe && <span className="text-[10px] text-blue-400 ml-1">(you)</span>}
                        </div>
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-mono text-sm">{formatNumber(entry.points)}</div>
                      <div className="text-[10px] text-slate-500">pop</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : loading ? (
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
                    <span className="w-7 text-center text-sm font-mono font-bold text-slate-400">
                      {rankMeta[entry.rank]
                        ? <>{rankMeta[entry.rank]}</>
                        : <span className="text-slate-500">#{entry.rank}</span>
                      }
                    </span>
                    <button
                      onClick={() => setProfileUser({ userId: entry.userId, username: entry.username })}
                      className="w-8 h-8 rounded-full bg-space-600 hover:bg-space-500 flex items-center justify-center text-xs font-bold text-white transition-colors"
                    >
                      {getInitials(entry.username ?? '?')}
                    </button>
                    <button
                      onClick={() => setProfileUser({ userId: entry.userId, username: entry.username })}
                      className="text-left hover:text-blue-400 transition-colors"
                    >
                      <div className={`text-sm font-medium ${isMe ? 'text-blue-300' : 'text-white'}`}>
                        {entry.username}
                        {isMe && <span className="text-[10px] text-blue-400 ml-1">(you)</span>}
                      </div>
                    </button>
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

      {profileUser && (
        <PlayerProfileModal
          userId={profileUser.userId}
          username={profileUser.username}
          onClose={() => setProfileUser(null)}
        />
      )}

      {/* Alliance members modal */}
      {allianceModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setAllianceModal(null)}>
          <div className="w-full bg-space-800 border-t border-space-600/50 rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">🤝 {allianceModal.name}</h2>
              <button onClick={() => setAllianceModal(null)} className="text-slate-500 text-xl">✕</button>
            </div>
            <div className="space-y-1">
              {allianceModal.members.map((m, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-space-700/50">
                  <span className="text-sm font-medium text-white">{m.username}</span>
                  {m.isLeader && <span className="text-[10px] text-yellow-400">👑 Leader</span>}
                  {!m.isLeader && m.role === 'ADMIN' && <span className="text-[10px] text-purple-400">⭐ Admin</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showChats && <ChatList onClose={() => setShowChats(false)} />}
    </div>
  );
}

