import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';
import { getInitials } from '../utils/format.js';
import { useAuthStore } from '../store/authStore.js';
import DMChat from './DMChat.jsx';

export default function PlayerProfileModal({ userId, username, onClose }) {
  const currentUser = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!userId) return;
    api.get(`/leaderboard/user/${userId}`)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (showChat) {
    return (
      <DMChat
        targetUserId={userId}
        targetUsername={username}
        onClose={() => setShowChat(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-space-800 rounded-2xl border border-space-600/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-space-700/60 px-5 py-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-900/60 border-2 border-blue-500/50 flex items-center justify-center text-xl font-bold text-white">
            {getInitials(username ?? '?')}
          </div>
          <div className="flex-1">
            <div className="text-white font-bold text-base">{username}</div>
            {profile?.alliance && (
              <div className="text-xs text-yellow-400 mt-0.5">🤝 {profile.alliance}</div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 text-xl px-1">✕</button>
        </div>

        {/* Message button — don't show for own profile */}
        {userId !== currentUser?.id && (
          <div className="px-5 pt-3">
            <button
              onClick={() => setShowChat(true)}
              className="w-full bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs py-2 rounded-xl font-semibold hover:bg-blue-800/50 transition-colors flex items-center justify-center gap-1.5"
            >
              💬 Message
            </button>
          </div>
        )}

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="text-center py-6 text-slate-500 text-sm">Loading…</div>
          ) : !profile ? (
            <div className="text-center py-6 text-slate-600 text-sm">Profile unavailable</div>
          ) : (
            <>
              {/* Population rank */}
              <div className="card text-center py-3">
                <div className="text-3xl font-bold text-white font-mono">
                  {profile.stats.populationRank ? `#${profile.stats.populationRank}` : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1">Population Rank</div>
                <div className="text-sm text-slate-300 mt-0.5">{formatNumber(profile.stats.populationPoints)} pts</div>
              </div>

              {/* Base count + lifetime victory medals */}
              <div className="grid grid-cols-2 gap-2">
                <div className="card text-center py-3">
                  <div className="text-2xl font-bold text-white font-mono">{profile.stats.baseCount ?? 1}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Base{(profile.stats.baseCount ?? 1) !== 1 ? 's' : ''}</div>
                </div>
                <div className="card text-center py-3">
                  <div className="text-2xl font-bold text-yellow-300 font-mono">{profile.stats.lifetimeVictoryMedals ?? profile.stats.victoryMedals ?? 0}</div>
                  <div className="text-[10px] text-slate-400 mt-1">🏆 Victory (All-Time)</div>
                </div>
              </div>

              {/* Lifetime medals */}
              <div>
                <p className="section-title mb-2">All-Time Medals</p>
                <div className="grid grid-cols-3 gap-2">
                  <MedalCard icon="⚔️" label="Attacker" count={profile.stats.lifetimeAttackerMedals ?? profile.stats.attackerMedals} pts={profile.stats.attackerPoints} color="text-red-400" />
                  <MedalCard icon="🛡️" label="Defender" count={profile.stats.lifetimeDefenderMedals ?? profile.stats.defenderMedals} pts={profile.stats.defenderPoints} color="text-blue-400" />
                  <MedalCard icon="💰" label="Raider"   count={profile.stats.lifetimeRaiderMedals   ?? profile.stats.raiderMedals}   pts={profile.stats.raiderPoints}   color="text-yellow-400" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MedalCard({ icon, label, count, pts, color }) {
  return (
    <div className="card text-center py-3">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{count}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{formatNumber(pts)} pts</div>
    </div>
  );
}
