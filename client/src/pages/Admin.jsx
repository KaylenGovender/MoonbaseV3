import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';
import UnitIcon from '../components/UnitIcon.jsx';
import BuildingIcon from '../components/BuildingIcon.jsx';
import ResourceIcon from '../components/ResourceIcon.jsx';
import { Home, Users, Handshake, Calendar, Monitor, Settings, Swords, Trophy, Shield, Crown, Star, Coins, ArrowUp, Trash2, Pencil, Hammer, Pickaxe, Wrench, AlertTriangle, Megaphone, ChevronUp, ChevronDown, Rocket, Clock, XCircle, RefreshCw, Package, Gift } from 'lucide-react';

/** Format a UTC ISO string as a value suitable for <input type="datetime-local"> (browser-local time). */
function toLocalInput(utcIso) {
  const d = new Date(utcIso);
  const offset = d.getTimezoneOffset() * 60 * 1000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/** Convert a datetime-local string (local time) to a UTC ISO string for the server. */
function localToUTC(localStr) {
  if (!localStr) return localStr;
  return new Date(localStr).toISOString();
}

const RES_LABELS = { oxygen: 'O\u2082', water: 'H\u2082O', iron: 'Iron', helium3: 'He3' };
const RES_TYPE_MAP = { oxygen: 'OXYGEN', water: 'WATER', iron: 'IRON', helium3: 'HELIUM3' };

// Bottom-sheet style inline edit modal
function EditModal({ label, value, numericOnly = true, onSave, onClose }) {
  const [val, setVal] = useState(String(value ?? ''));
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/70" onClick={onClose}>
      <div
        className="w-full bg-space-800 border-t border-space-600/50 px-5 pt-5 pb-24 space-y-3 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-white">{label}</div>
        <input
          autoFocus
          type={numericOnly ? 'number' : 'text'}
          className="input w-full text-sm py-2.5"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onClose(); }}
        />
        <div className="flex gap-2">
          <button onClick={() => onSave(val)} className="btn-primary flex-1 text-sm py-2.5">Save</button>
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2.5">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const navigate  = useNavigate();
  const user           = useAuthStore((s) => s.user);
  const loadGameConfig = useAuthStore((s) => s.loadGameConfig);
  const [tab, setTab]   = useState('dashboard');
  const [error, setError] = useState('');

  // ── Players tab ──
  const [query, setQuery]               = useState('');
  const [users, setUsers]               = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer]   = useState(false);
  const [expandedBase, setExpandedBase]     = useState(null);
  const [editModal, setEditModal]           = useState(null);

  // ── Seasons tab ──
  const [seasons, setSeasons]         = useState([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingSeasonOps, setLoadingSeasonOps] = useState({}); // { [seasonId]: 'activating'|'ending'|'deleting'|'saving', _create: true }
  const [newSeason, setNewSeason]     = useState({ name: '', startDate: '', endDate: '', activate: false });
  const [seasonMsg, setSeasonMsg]     = useState('');
  const [editingSeason, setEditingSeason] = useState(null);

  // ── Server tab ──
  const [allUsers, setAllUsers]         = useState([]);
  const [preserveIds, setPreserveIds]   = useState(new Set());
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetMsg, setResetMsg]         = useState('');
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [protectionMsg, setProtectionMsg] = useState('');
  const [battleFilter, setBattleFilter] = useState('');

  // ── Player password reset ──
  const [resetPwInput, setResetPwInput] = useState('');
  const [resetPwMsg, setResetPwMsg]     = useState('');

  // ── Week configs (per season) ──
  const [weekConfigs, setWeekConfigs]     = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState(new Set());
  const [weekMsg, setWeekMsg]             = useState('');
  const [editingWeek, setEditingWeek]     = useState(null);

  // ── Game Config tab ──
  const [gameConfig, setGameConfig]   = useState(null);
  const [configSection, setConfigSection] = useState('buildings');
  const [configMsg, setConfigMsg]     = useState('');

  // ── Dashboard tab ──
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [activeAttacks, setActiveAttacks] = useState([]);
  const [battleReports, setBattleReports] = useState([]);

  // ── Alliances tab ──
  const [alliances, setAlliances] = useState([]);
  const [loadingAlliances, setLoadingAlliances] = useState(false);
  const [expandedAlliance, setExpandedAlliance] = useState(null);
  const [allianceMsg, setAllianceMsg] = useState('');

  // ── Announcement ──
  const [announcement, setAnnouncement] = useState('');
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [announcementMsg, setAnnouncementMsg] = useState('');

  useEffect(() => { if (user && !user.isAdmin) navigate('/base'); }, [user]);

  // ── Dashboard fetch ──
  async function loadDashboard() {
    setLoadingDashboard(true);
    try {
      const [dash, attacks, reports] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/attacks?active=true').catch(() => ({ attacks: [] })),
        api.get('/admin/battle-reports').catch(() => ({ rows: [] })),
      ]);
      setDashboardData(dash);
      setActiveAttacks(attacks.attacks ?? []);
      const mapped = (reports.rows ?? []).map((r) => ({
        ...r,
        attackerName: r.attack?.attackerBase?.user?.username ?? '?',
        defenderName: r.attack?.defenderBase?.user?.username ?? '?',
      }));
      setBattleReports(mapped);
    } catch {}
    setLoadingDashboard(false);
  }
  useEffect(() => { if (tab === 'dashboard') loadDashboard(); }, [tab]);

  // ── Alliances fetch ──
  async function loadAlliances() {
    setLoadingAlliances(true);
    try {
      const res = await api.get('/admin/alliances');
      console.log('[Admin] alliances response:', res);
      setAlliances(res.alliances ?? res.rows ?? []);
    } catch (err) {
      console.error('[Admin] Failed to load alliances:', err);
    }
    setLoadingAlliances(false);
  }
  useEffect(() => { if (tab === 'alliances') loadAlliances(); }, [tab]);

  // ── Announcement fetch ──
  async function loadAnnouncement() {
    try {
      const res = await api.get('/admin/announcement');
      const text = res.text ?? '';
      setAnnouncement(text);
      setAnnouncementDraft(text);
    } catch {}
  }
  useEffect(() => { if (tab === 'server') loadAnnouncement(); }, [tab]);

  // ── Search (debounced 300ms) ──
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await api.get(`/admin/players/search?q=${encodeURIComponent(query)}`);
        setUsers(res.users ?? []);
      } catch { setUsers([]); }
      setLoadingSearch(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function selectPlayer(u) {
    setLoadingPlayer(true);
    setSelectedPlayer(null);
    setError('');
    setResetPwInput('');
    setResetPwMsg('');
    try {
      const data = await api.get(`/admin/players/${u.id}`);
      setSelectedPlayer(data);
      setExpandedBase(data.bases?.[0]?.id ?? null);
    } catch (e) { setError(e.message); }
    setLoadingPlayer(false);
  }

  async function refreshPlayer() {
    if (!selectedPlayer) return;
    try {
      const data = await api.get(`/admin/players/${selectedPlayer.user.id}`);
      setSelectedPlayer(data);
    } catch (e) {
      console.error('[admin/refreshPlayer]', e.message);
    }
  }

  function openEdit(label, value, onSave) {
    setEditModal({ label, value, onSave: async (val) => {
      try {
        await onSave(val);
        await refreshPlayer();
      } catch (e) { setError(e.message); }
      setEditModal(null);
    }});
  }

  async function toggleFlag(field, val) {
    try {
      const res = await api.put(`/admin/players/${selectedPlayer.user.id}`, { [field]: val });
      setSelectedPlayer((prev) => ({ ...prev, user: { ...prev.user, ...res.row } }));
    } catch (e) { setError(e.message); }
  }

  // ── Seasons ──
  async function loadSeasons() {
    setLoadingSeasons(true);
    try {
      const res = await api.get('/admin/seasons');
      const rows = res.rows ?? [];
      setSeasons(rows);
    } catch {}
    setLoadingSeasons(false);
  }
  useEffect(() => { if (tab === 'seasons') loadSeasons(); }, [tab]);

  async function createSeason() {
    setSeasonMsg('');
    setLoadingSeasonOps((prev) => ({ ...prev, _create: true }));
    try {
      await api.post('/admin/season', {
        ...newSeason,
        startDate: localToUTC(newSeason.startDate),
        endDate:   localToUTC(newSeason.endDate),
      });
      setNewSeason({ name: '', startDate: '', endDate: '', activate: false });
      setSeasonMsg('OK Season created!');
      loadSeasons();
    } catch (e) { setSeasonMsg(`[Error] ${e.message}`); }
    finally { setLoadingSeasonOps((prev) => { const n = { ...prev }; delete n._create; return n; }); }
  }

  async function activateSeason(id) {
    setLoadingSeasonOps((prev) => ({ ...prev, [id]: 'activating' }));
    try { await api.put(`/admin/seasons/${id}`, { isActive: true }); loadSeasons(); }
    catch (e) { setError(e.message); }
    finally { setLoadingSeasonOps((prev) => { const n = { ...prev }; delete n[id]; return n; }); }
  }

  async function endSeason(id) {
    if (!window.confirm('End season and award victory medals?')) return;
    setLoadingSeasonOps((prev) => ({ ...prev, [id]: 'ending' }));
    try {
      const res = await api.post(`/admin/season/${id}/end`, {});
      setSeasonMsg(`OK Season ended. Winner: ${res.winningAlliance ?? 'None'}`);
      loadSeasons();
    } catch (e) { setError(e.message); }
    finally { setLoadingSeasonOps((prev) => { const n = { ...prev }; delete n[id]; return n; }); }
  }

  async function deleteSeason(id) {
    if (!window.confirm('Delete season? This cannot be undone.')) return;
    setLoadingSeasonOps((prev) => ({ ...prev, [id]: 'deleting' }));
    try { await api.delete(`/admin/seasons/${id}`); loadSeasons(); }
    catch (e) { setError(e.message); }
    finally { setLoadingSeasonOps((prev) => { const n = { ...prev }; delete n[id]; return n; }); }
  }

  async function saveSeasonEdit() {
    if (!editingSeason) return;
    setLoadingSeasonOps((prev) => ({ ...prev, [editingSeason.id]: 'saving' }));
    try {
      await api.put(`/admin/seasons/${editingSeason.id}`, {
        name:      editingSeason.name,
        startDate: localToUTC(editingSeason.startDate),
        endDate:   localToUTC(editingSeason.endDate),
      });
      setEditingSeason(null);
      setSeasonMsg('OK Season updated!');
      loadSeasons();
    } catch (e) { setSeasonMsg(`[Error] ${e.message}`); }
    finally { setLoadingSeasonOps((prev) => { const n = { ...prev }; delete n[editingSeason?.id]; return n; }); }
  }

  // ── Server reset ──
  async function loadAllUsers() {
    try { const res = await api.get('/admin/players/search?q='); setAllUsers(res.users ?? []); } catch {}
  }
  async function loadProtection() {
    try { const res = await api.get('/admin/config/protection'); setProtectionEnabled(res.enabled); } catch {}
  }
  useEffect(() => { if (tab === 'server') { loadAllUsers(); loadProtection(); loadBattleReports(); } }, [tab]);

  async function loadBattleReports(username) {
    try {
      const res = await api.get('/admin/battle-reports' + (username ? '?username=' + encodeURIComponent(username) : ''));
      const mapped = (res.rows ?? []).map((r) => ({
        ...r,
        attackerName: r.attack?.attackerBase?.user?.username ?? '?',
        defenderName: r.attack?.defenderBase?.user?.username ?? '?',
      }));
      setBattleReports(mapped);
    } catch { setBattleReports([]); }
  }

  async function resetPlayerPassword() {
    if (!selectedPlayer || !resetPwInput || resetPwInput.length < 6) {
      setResetPwMsg('[Error] Password must be at least 6 characters');
      return;
    }
    try {
      await api.post('/admin/reset-password', { userId: selectedPlayer.user.id, newPassword: resetPwInput });
      setResetPwMsg('OK Password reset successfully');
      setResetPwInput('');
      setTimeout(() => setResetPwMsg(''), 3000);
    } catch (e) { setResetPwMsg(`[Error] ${e.message}`); }
  }
  useEffect(() => {
    if (tab === 'config') {
      api.get('/admin/game-config').then(setGameConfig).catch(() => {});
    }
  }, [tab]);

  async function deletePlayer(userId) {
    if (!window.confirm('Delete this player account permanently? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setSelectedPlayer(null);
      setQuery('');
    } catch (e) { setError(e.message); }
  }

  async function saveConfigField(section, key, value) {
    try {
      const payload = typeof value === 'object' ? { [key]: value } : { [key]: value };
      const updated = await api.put(`/admin/game-config/${section}`, payload);
      setGameConfig(updated.config);
      setConfigMsg('OK Saved');
      setTimeout(() => setConfigMsg(''), 2000);
    } catch (e) { setConfigMsg(`[Error] ${e.message}`); }
  }

  async function saveUnitStat(unit, field, value) {
    try {
      const current = gameConfig?.unitStats?.[unit] ?? {};
      let payload;
      if (field.startsWith('cost.')) {
        const costField = field.replace('cost.', '');
        payload = { ...current, cost: { ...current.cost, [costField]: parseFloat(value) } };
      } else {
        payload = { ...current, [field]: parseFloat(value) };
      }
      const updated = await api.put('/admin/game-config/unitStats', { [unit]: payload });
      setGameConfig(updated.config);
      loadGameConfig(); // refresh store so AttackModal gets new speeds immediately
      setConfigMsg('OK Saved');
      setTimeout(() => setConfigMsg(''), 2000);
    } catch (e) { setConfigMsg(`[Error] ${e.message}`); }
  }

  async function toggleProtection() {
    try {
      const res = await api.put('/admin/config/protection', { enabled: !protectionEnabled });
      setProtectionEnabled(res.enabled);
      setProtectionMsg(`OK Protection ${res.enabled ? 'enabled' : 'disabled'}`);
      setTimeout(() => setProtectionMsg(''), 3000);
    } catch (e) { setProtectionMsg(`[Error] ${e.message}`); }
  }

  async function loadWeeks(seasonId) {
    try {
      const res = await api.get(`/admin/season/${seasonId}/weeks`);
      setWeekConfigs((prev) => ({ ...prev, [seasonId]: res.rows ?? [] }));
    } catch (e) { setWeekMsg(`[Error] ${e.message}`); }
  }

  async function saveWeek(weekId, seasonId, endDate) {
    try {
      await api.put(`/admin/week-configs/${weekId}`, { endDate: localToUTC(endDate) });
      setEditingWeek(null);
      loadWeeks(seasonId);
    } catch (e) { setWeekMsg(`[Error] ${e.message}`); }
  }

  async function regenerateWeeks(seasonId) {
    if (!window.confirm('Delete and regenerate all weeks for this season?')) return;
    try {
      const res = await api.post(`/admin/seasons/${seasonId}/regenerate-weeks`, {});
      setWeekConfigs((prev) => ({ ...prev, [seasonId]: res.rows ?? [] }));
      setWeekMsg('OK Weeks regenerated!');
      setTimeout(() => setWeekMsg(''), 3000);
    } catch (e) { setWeekMsg(`[Error] ${e.message}`); }
  }

  async function deleteWeek(weekId, seasonId) {
    if (!window.confirm('Delete this week config? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/week-configs/${weekId}`);
      loadWeeks(seasonId);
    } catch (e) { setWeekMsg(`[Error] ${e.message}`); }
  }

  async function doReset() {
    const resetCount = allUsers.filter((u) => !u.isAdmin && !preserveIds.has(u.id)).length;
    if (!window.confirm(`Reset ${resetCount} players? This cannot be undone.`)) return;
    setResetMsg('Resetting…');
    try {
      const res = await api.post('/admin/reset', { preserveUserIds: [...preserveIds] });
      setResetMsg(`OK Done — ${res.basesReset ?? 0} bases cleared.`);
      setResetConfirm(false);
    } catch (e) { setResetMsg(`[Error] ${e.message}`); }
  }

  // ── Alliance management ──
  async function disbandAlliance(id) {
    if (!window.confirm('Disband this alliance? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/alliances/${id}`);
      setAllianceMsg('OK Alliance disbanded');
      loadAlliances();
      setTimeout(() => setAllianceMsg(''), 3000);
    } catch (e) { setAllianceMsg(`[Error] ${e.message}`); }
  }

  async function kickMember(allianceId, userId) {
    if (!window.confirm('Kick this member from the alliance?')) return;
    try {
      await api.delete(`/admin/alliances/${allianceId}/members/${userId}`);
      setAllianceMsg('OK Member kicked');
      loadAlliances();
      setTimeout(() => setAllianceMsg(''), 3000);
    } catch (e) { setAllianceMsg(`[Error] ${e.message}`); }
  }

  async function transferLeadership(allianceId, userId) {
    if (!window.confirm('Transfer leadership to this member?')) return;
    try {
      await api.put(`/admin/alliances/${allianceId}/leader`, { userId });
      setAllianceMsg('OK Leadership transferred');
      loadAlliances();
      setTimeout(() => setAllianceMsg(''), 3000);
    } catch (e) { setAllianceMsg(`[Error] ${e.message}`); }
  }

  // ── Announcement ──
  async function saveAnnouncement() {
    try {
      await api.put('/admin/announcement', { text: announcementDraft });
      setAnnouncement(announcementDraft);
      setAnnouncementMsg('OK Announcement updated');
      setTimeout(() => setAnnouncementMsg(''), 3000);
    } catch (e) { setAnnouncementMsg(`[Error] ${e.message}`); }
  }

  // ── Quick actions ──
  async function giveStarterKit() {
    try {
      await api.post(`/admin/players/${selectedPlayer.user.id}/starter-kit`, {});
      await refreshPlayer();
      setError('');
    } catch (e) { setError(e.message); }
  }

  async function maxAllBuildings() {
    try {
      await api.post(`/admin/players/${selectedPlayer.user.id}/max-buildings`, {});
      await refreshPlayer();
      setError('');
    } catch (e) { setError(e.message); }
  }

  async function resetBases() {
    if (!window.confirm('Reset all bases for this player? This cannot be undone.')) return;
    try {
      await api.post(`/admin/players/${selectedPlayer.user.id}/reset-bases`, {});
      await refreshPlayer();
      setError('');
    } catch (e) { setError(e.message); }
  }

  // ── Config reset / export / import ──
  async function resetConfigToDefaults() {
    if (!window.confirm('Reset game config to defaults? This cannot be undone.')) return;
    try {
      const res = await api.post('/admin/game-config/reset', {});
      setGameConfig(res.config ?? res);
      setConfigMsg('OK Config reset to defaults');
      loadGameConfig();
      setTimeout(() => setConfigMsg(''), 3000);
    } catch (e) { setConfigMsg(`[Error] ${e.message}`); }
  }

  async function exportConfig() {
    try {
      const data = await api.get('/admin/game-config/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game-config-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setConfigMsg(`[Error] ${e.message}`); }
  }

  async function importConfig(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await api.post('/admin/game-config/import', json);
      setGameConfig(res.config ?? res);
      setConfigMsg('OK Config imported successfully');
      loadGameConfig();
      setTimeout(() => setConfigMsg(''), 3000);
    } catch (e) { setConfigMsg(`[Error] ${e.message}`); }
  }

  const switchTab = (t) => { setTab(t); setSelectedPlayer(null); setError(''); setSeasonMsg(''); setResetMsg(''); setResetConfirm(false); setAllianceMsg(''); setAnnouncementMsg(''); };

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-white flex items-center gap-1.5"><Wrench size={16} /> Admin Panel</h1>
        {selectedPlayer && tab === 'players' ? (
          <button onClick={() => setSelectedPlayer(null)} className="text-xs text-blue-400 hover:text-blue-300">← Players</button>
        ) : (
          <button onClick={() => navigate('/base')} className="text-xs text-slate-400 hover:text-white">← Back</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-space-600/50 overflow-x-auto px-2">
        {[['dashboard', Home],['players', Users],['alliances', Handshake],['seasons', Calendar],['server', Monitor],['config', Settings]].map(([key, Icon]) => (
          <button key={key} onClick={() => switchTab(key)}
            className={`flex-none px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${tab === key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}>
            <Icon size={14} /> {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-red-900/40 border border-red-700/50 text-red-300 text-xs rounded-lg px-4 py-2.5 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-400"><XCircle size={16} /></button>
        </div>
      )}

      {/* ═══════════════════════════════ DASHBOARD ═════════════════════════════ */}
      {tab === 'dashboard' && (
        <div className="px-4 py-4 space-y-4 pb-24">
          {loadingDashboard ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading dashboard…</div>
          ) : dashboardData ? (
            <>
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  [Users, 'Total Players',       dashboardData.totalPlayers],
                  [Home, 'Total Bases',          dashboardData.totalBases],
                  [Swords, 'Active Attacks',       dashboardData.activeAttacks ?? activeAttacks.length],
                  [Trophy, 'Recent Battles',       battleReports.length],
                  [Handshake, 'Total Alliances',      dashboardData.totalAlliances],
                  [Clock, 'Recent Registrations', dashboardData.recentRegistrations],
                ].map(([Icon, label, val]) => (
                  <div key={label} className="card flex items-center gap-3">
                    <span className="text-slate-400"><Icon size={24} /></span>
                    <div>
                      <div className="text-lg font-bold text-white">{val ?? 0}</div>
                      <div className="text-[10px] text-slate-500">{label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active season */}
              {dashboardData.activeSeason && (
                <div className="card space-y-2">
                  <p className="section-title flex items-center gap-1"><Calendar size={16} /> Active Season</p>
                  <div className="text-sm font-semibold text-white">{dashboardData.activeSeason.name}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(dashboardData.activeSeason.startDate).toLocaleDateString()} → {new Date(dashboardData.activeSeason.endDate).toLocaleDateString()}
                  </div>
                  {dashboardData.activeSeason.daysRemaining != null && (
                    <div className="text-xs text-blue-300 font-mono">{dashboardData.activeSeason.daysRemaining} days remaining</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-slate-600 text-sm">Failed to load dashboard</div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════ PLAYERS ═══════════════════════════════ */}
      {tab === 'players' && !selectedPlayer && (
        <div className="px-4 py-4 space-y-3">
          <input
            className="input w-full text-sm py-2.5"
            placeholder="Search by username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loadingSearch ? (
            <div className="text-center py-8 text-slate-500 text-sm">Searching…</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">No users found</div>
          ) : (
            <div className="space-y-1.5">
              {users.map((u, i) => (
                <button key={u.id} onClick={() => selectPlayer(u)}
                  className={`w-full card text-left flex items-center justify-between py-3 ${i % 2 === 1 ? 'bg-space-800/40' : ''}`}>
                  <div>
                    <div className="text-sm font-medium text-white">{u.username}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {u.isAdmin  && <span className="badge bg-yellow-900/50 text-yellow-300 border-yellow-700/40">Admin</span>}
                    {u.isBanned && <span className="badge bg-red-900/50 text-red-300 border-red-700/40">Banned</span>}
                    <span className="text-slate-600 text-xl">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Player Detail ─── */}
      {tab === 'players' && (loadingPlayer || selectedPlayer) && (
        <div className="px-4 py-4 space-y-4 pb-24">
          {loadingPlayer ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading…</div>
          ) : (
            <>
              {/* User info */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-white">{selectedPlayer.user.username}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{selectedPlayer.user.email}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleFlag('isAdmin', !selectedPlayer.user.isAdmin)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedPlayer.user.isAdmin ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700/40' : 'bg-space-700 text-slate-500 border-space-600/40'}`}>
                      {selectedPlayer.user.isAdmin ? <><Star size={12} className="text-amber-400 inline" /> Admin</> : 'Grant Admin'}
                    </button>
                    <button onClick={() => toggleFlag('isBanned', !selectedPlayer.user.isBanned)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedPlayer.user.isBanned ? 'bg-red-900/50 text-red-300 border-red-700/40' : 'bg-space-700 text-slate-500 border-space-600/40'}`}>
                      {selectedPlayer.user.isBanned ? <><XCircle size={12} className="inline" /> Banned</> : 'Ban'}
                    </button>
                    <button onClick={() => deletePlayer(selectedPlayer.user.id)}
                      className="text-xs px-2.5 py-1 rounded-full border bg-red-950/50 text-red-400 border-red-800/50 hover:bg-red-900/50 flex items-center gap-1">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-slate-600">
                  {selectedPlayer.bases.length} base{selectedPlayer.bases.length !== 1 ? 's' : ''} · {selectedPlayer.medals.length} medal record{selectedPlayer.medals.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card space-y-2">
                <p className="section-title flex items-center gap-1"><Rocket size={16} /> Quick Actions</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={giveStarterKit}
                    className="btn-ghost text-xs py-1.5 px-3 text-green-400 border-green-800/50 hover:bg-green-900/30">
                    <Gift size={14} className="inline" /> Give Starter Kit
                  </button>
                  <button onClick={maxAllBuildings}
                    className="btn-ghost text-xs py-1.5 px-3 text-blue-400 border-blue-800/50 hover:bg-blue-900/30">
                    <ArrowUp size={14} className="inline" /> Max All Buildings
                  </button>
                  <button onClick={resetBases}
                    className="btn-ghost text-xs py-1.5 px-3 text-red-400 border-red-800/50 hover:bg-red-900/30">
                    <Trash2 size={14} className="inline" /> Reset Bases
                  </button>
                </div>
              </div>

              {/* Password Reset */}
              <div className="card space-y-2">
                <p className="section-title flex items-center gap-1"><Wrench size={16} /> Reset Password</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    type="password"
                    placeholder="New password (min 6 chars)…"
                    value={resetPwInput}
                    onChange={(e) => setResetPwInput(e.target.value)}
                  />
                  <button onClick={resetPlayerPassword} className="btn-primary text-xs px-3">Reset</button>
                </div>
                {resetPwMsg && <div className={`text-xs ${resetPwMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{resetPwMsg}</div>}
              </div>

              {/* Medals summary */}
              {selectedPlayer.medals.length > 0 && (
                <div className="card">
                  <p className="section-title mb-2 flex items-center gap-1"><Trophy size={14} /> Medals</p>
                  <div className="space-y-1">
                    {selectedPlayer.medals.map((m) => (
                      <div key={m.id} className="flex justify-between text-xs">
                        <span className="text-slate-400">{m.season?.name ?? '?'} {m.weekNumber === 0 ? <><Trophy size={12} className="inline" /> Victory</> : `Week ${m.weekNumber}`}</span>
                        <span className="text-slate-300 font-mono">
                          {m.weekNumber === 0 ? '1 Victory Medal' : <><Swords size={12} className="inline" />{m.attackerPoints} <Shield size={12} className="inline" />{m.defenderPoints} <Coins size={12} className="inline" />{m.raiderPoints}</>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bases */}
              {selectedPlayer.bases.map((base) => (
                <div key={base.id}>
                  <button onClick={() => setExpandedBase(expandedBase === base.id ? null : base.id)}
                    className="w-full card text-left flex items-center justify-between py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{base.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {base.season?.name ?? '?'} · ({base.x.toFixed(0)}, {base.y.toFixed(0)})
                        {base.season?.isActive && <span className="text-green-400 ml-1">● Active</span>}
                      </div>
                    </div>
                    <span className="text-slate-500">{expandedBase === base.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                  </button>

                  {expandedBase === base.id && (
                    <div className="space-y-2 mt-2 pl-1">
                      {/* Resources */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase">Resources</p>
                          <span className="text-[9px] text-slate-600 flex items-center gap-0.5">tap to edit <Pencil size={10} /></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {['oxygen','water','iron','helium3'].map((f) => (
                            <button key={f} onClick={() => openEdit(`${RES_LABELS[f]} amount`, Math.floor(base.resourceState?.[f] ?? 0),
                                (v) => api.put(`/admin/players/${selectedPlayer.user.id}/resources/${base.id}`, { [f]: parseFloat(v) }))}
                              className="flex items-center justify-between active:bg-space-700/40 rounded px-1 -mx-1">
                              <span className="text-[11px] text-slate-400 flex items-center gap-1"><ResourceIcon type={RES_TYPE_MAP[f]} size={14} /> {RES_LABELS[f]}</span>
                              <span className="text-[11px] text-blue-300 font-mono">{formatNumber(Math.floor(base.resourceState?.[f] ?? 0))}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Buildings */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase">Buildings</p>
                          <span className="text-[9px] text-slate-600 flex items-center gap-0.5">tap to edit <Pencil size={10} /></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {base.buildings.map((b) => (
                            <button key={b.id} onClick={() => openEdit(`${b.type.replace(/_/g,' ')} level`, b.level,
                                (v) => api.put(`/admin/buildings/${b.id}`, { level: parseInt(v) }))}
                              className="flex items-center justify-between active:bg-space-700/40 rounded px-1 -mx-1">
                              <span className="text-[11px] text-slate-400 flex items-center gap-1"><BuildingIcon type={b.type} size={12} /> {b.type.replace(/_/g,' ')}</span>
                              <span className="text-[11px] text-blue-300 font-mono">L{b.level}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mines */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase">Mines</p>
                          <span className="text-[9px] text-slate-600 flex items-center gap-0.5">tap to edit <Pencil size={10} /></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {base.mines.map((m) => (
                            <button key={m.id} onClick={() => openEdit(`${m.resourceType} Mine ${m.slot} level`, m.level,
                                (v) => api.put(`/admin/mines/${m.id}`, { level: parseInt(v) }))}
                              className="flex items-center justify-between active:bg-space-700/40 rounded px-1 -mx-1">
                              <span className="text-[11px] text-slate-400 flex items-center gap-1"><ResourceIcon type={m.resourceType} size={14} /> {m.resourceType} #{m.slot}</span>
                              <span className="text-[11px] text-blue-300 font-mono">L{m.level}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Units */}
                      <div className="card">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-slate-500 uppercase">Units</p>
                          <span className="text-[9px] text-slate-600 flex items-center gap-0.5">tap to edit <Pencil size={10} /></span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {base.unitStocks.map((u) => (
                            <button key={u.id} onClick={() => openEdit(`${u.type} count`, u.count,
                                (v) => api.put(`/admin/units/${u.id}`, { count: parseInt(v) }))}
                              className="flex items-center justify-between active:bg-space-700/40 rounded px-1 -mx-1">
                              <span className="text-[11px] text-slate-400 flex items-center gap-1"><UnitIcon type={u.type} size={14} /> {u.type}</span>
                              <span className="text-[11px] text-blue-300 font-mono">{u.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════ SEASONS ═══════════════════════════════ */}
      {tab === 'seasons' && (
        <div className="px-4 py-4 space-y-4">
          {/* Create form */}
          <div className="card space-y-3">
            <p className="section-title">Create New Season</p>
            <input className="input w-full text-sm py-2.5" placeholder="Season name" value={newSeason.name}
              onChange={(e) => setNewSeason((s) => ({ ...s, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Start Date & Time</div>
                <input type="datetime-local" className="input w-full text-sm py-2" value={newSeason.startDate}
                  onChange={(e) => setNewSeason((s) => ({ ...s, startDate: e.target.value }))} />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1">End Date & Time</div>
                <input type="datetime-local" className="input w-full text-sm py-2" value={newSeason.endDate}
                  onChange={(e) => setNewSeason((s) => ({ ...s, endDate: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={newSeason.activate}
                onChange={(e) => setNewSeason((s) => ({ ...s, activate: e.target.checked }))} />
              Activate immediately
            </label>
            <button onClick={createSeason} disabled={!!loadingSeasonOps._create} className="btn-primary w-full text-sm py-2.5">
              {loadingSeasonOps._create ? 'Creating…' : 'Create Season'}
            </button>
            {seasonMsg && <div className={`text-xs ${seasonMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{seasonMsg}</div>}
          </div>

          {/* Seasons list */}
          {loadingSeasons ? (
            <div className="text-center py-6 text-slate-500 text-sm">Loading…</div>
          ) : (
            <div className="space-y-2">
              {seasons.map((s) => (
                <div key={s.id} className="card">
                  {editingSeason?.id === s.id ? (
                    /* ── Inline edit form ── */
                    <div className="space-y-2">
                      <input className="input w-full text-sm py-2" placeholder="Name"
                        value={editingSeason.name}
                        onChange={(e) => setEditingSeason((es) => ({ ...es, name: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10px] text-slate-500 mb-1">Start</div>
                          <input type="datetime-local" className="input w-full text-xs py-1.5"
                            value={editingSeason.startDate}
                            onChange={(e) => setEditingSeason((es) => ({ ...es, startDate: e.target.value }))} />
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 mb-1">End</div>
                          <input type="datetime-local" className="input w-full text-xs py-1.5"
                            value={editingSeason.endDate}
                            onChange={(e) => setEditingSeason((es) => ({ ...es, endDate: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveSeasonEdit} disabled={!!loadingSeasonOps[s.id]} className="btn-primary flex-1 text-xs py-1.5">
                          {loadingSeasonOps[s.id] === 'saving' ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingSeason(null)} className="btn-ghost flex-1 text-xs py-1.5">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal view ── */
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{s.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(s.startDate).toLocaleString()} → {new Date(s.endDate).toLocaleString()}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.isActive ? 'bg-green-900/50 text-green-300 border-green-700/40' : 'bg-space-700 text-slate-500 border-space-600/50'}`}>
                          {s.isActive ? '● Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setEditingSeason({
                          id: s.id,
                          name: s.name,
                          startDate: s.startDate ? toLocalInput(s.startDate) : '',
                          endDate:   s.endDate   ? toLocalInput(s.endDate)   : '',
                        })} className="btn-ghost text-xs py-1.5 px-3 text-blue-400 border-blue-800/50">
                          Edit
                        </button>
                        {!s.isActive && (
                          <button onClick={() => activateSeason(s.id)} disabled={!!loadingSeasonOps[s.id]} className="btn-ghost text-xs py-1.5 px-3 text-green-400 border-green-800/50">
                            {loadingSeasonOps[s.id] === 'activating' ? '…' : 'Activate'}
                          </button>
                        )}
                        {s.isActive && (
                          <button onClick={() => endSeason(s.id)} disabled={!!loadingSeasonOps[s.id]} className="btn-ghost text-xs py-1.5 px-3 text-yellow-400 border-yellow-800/50">
                            {loadingSeasonOps[s.id] === 'ending' ? '…' : 'End Season'}
                          </button>
                        )}
                        <button onClick={() => deleteSeason(s.id)} disabled={!!loadingSeasonOps[s.id]}
                          className="btn-ghost text-xs py-1.5 px-3 text-red-400 border-red-800/50 hover:bg-red-900/30">
                          {loadingSeasonOps[s.id] === 'deleting' ? 'Deleting…' : <><Trash2 size={12} className="inline" /> Delete</>}
                        </button>
                        <button
                          onClick={() => {
                            setExpandedWeeks((prev) => {
                              const next = new Set(prev);
                              next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                              return next;
                            });
                            if (!weekConfigs[s.id]) loadWeeks(s.id);
                          }}
                          className="btn-ghost text-xs py-1.5 px-3 text-purple-400 border-purple-800/50">
                          <Calendar size={14} className="inline" /> Weeks {expandedWeeks.has(s.id) ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />}
                        </button>
                      </div>

                      {/* Week configs */}
                      {expandedWeeks.has(s.id) && (
                        <div className="mt-3 border-t border-space-600/30 pt-3 space-y-1.5">
                          {weekMsg && <div className={`text-xs ${weekMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{weekMsg}</div>}
                          {(weekConfigs[s.id] ?? []).map((wc, wi) => (
                            <div key={wc.id} className={`rounded-lg px-3 py-2 ${wi % 2 === 0 ? 'bg-space-700/50' : 'bg-space-800/40'}`}>
                              {editingWeek?.id === wc.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-400 flex-shrink-0">W{wc.weekNumber}</span>
                                  <input
                                    type="datetime-local"
                                    className="input text-xs py-1 flex-1"
                                    value={editingWeek.endDate}
                                    onChange={(e) => setEditingWeek((w) => ({ ...w, endDate: e.target.value }))}
                                  />
                                  <button onClick={() => saveWeek(wc.id, s.id, editingWeek.endDate)} className="btn-primary text-xs py-1 px-2">OK</button>
                                  <button onClick={() => setEditingWeek(null)} className="btn-ghost text-xs py-1 px-2">x</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-xs text-white font-medium">Week {wc.weekNumber}</span>
                                    <span className="text-[10px] text-slate-500 ml-2">
                                      ends {new Date(wc.endDate).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => setEditingWeek({
                                        id: wc.id,
                                        seasonId: s.id,
                                        endDate: toLocalInput(wc.endDate),
                                      })}
                                      className="text-blue-400 hover:text-blue-300 text-xs"><Pencil size={12} /></button>
                                    <button onClick={() => deleteWeek(wc.id, s.id)} className="text-red-500 hover:text-red-400 text-xs">x</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {(weekConfigs[s.id] ?? []).length === 0 && (
                            <div className="text-xs text-slate-600 text-center py-2">No weeks — click Regenerate to create</div>
                          )}
                          <button onClick={() => regenerateWeeks(s.id)} className="btn-ghost text-xs py-1.5 w-full text-orange-400 border-orange-800/50 mt-1">
                            <RefreshCw size={14} className="inline" /> Regenerate Weeks
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════ ALLIANCES ═════════════════════════════ */}
      {tab === 'alliances' && (
        <div className="px-4 py-4 space-y-4 pb-24">
          {allianceMsg && (
            <div className={`text-xs text-center py-2 ${allianceMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{allianceMsg}</div>
          )}
          {loadingAlliances ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading alliances…</div>
          ) : alliances.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-sm">No alliances found</div>
          ) : (
            <div className="space-y-2">
              {alliances.map((a) => (
                <div key={a.id} className="card">
                  <button onClick={() => setExpandedAlliance(expandedAlliance === a.id ? null : a.id)}
                    className="w-full text-left flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{a.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Leader: {a.leader?.username ?? '?'} · {a.members?.length ?? 0} members
                      </div>
                    </div>
                    <span className="text-slate-500">{expandedAlliance === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                  </button>

                  {expandedAlliance === a.id && (
                    <div className="mt-3 border-t border-space-600/30 pt-3 space-y-2">
                      {/* Members list */}
                      {(a.members ?? []).length === 0 ? (
                        <div className="text-xs text-slate-600 text-center py-2">No members loaded</div>
                      ) : (
                        <div className="space-y-1">
                          {(a.members ?? []).map((m, mi) => (
                            <div key={m.id ?? m.userId} className={`flex items-center justify-between rounded-lg px-3 py-2 ${mi % 2 === 0 ? 'bg-space-700/50' : 'bg-space-800/40'}`}>
                              <div>
                                <span className="text-xs text-white">{m.user?.username ?? '?'}</span>
                                {(m.userId === a.leaderId) && (
                                  <span className="ml-1.5 text-[9px] text-yellow-400 inline-flex items-center gap-0.5"><Crown size={12} className="text-amber-400" /> Leader</span>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                {m.userId !== a.leaderId && (
                                  <>
                                    <button onClick={() => transferLeadership(a.id, m.userId)}
                                      className="text-[10px] px-2 py-0.5 rounded border bg-yellow-900/30 text-yellow-400 border-yellow-800/50 hover:bg-yellow-800/40 flex items-center gap-0.5">
                                      <Crown size={12} /> Lead
                                    </button>
                                    <button onClick={() => kickMember(a.id, m.userId)}
                                      className="text-[10px] px-2 py-0.5 rounded border bg-red-900/30 text-red-400 border-red-800/50 hover:bg-red-800/40 flex items-center gap-0.5">
                                      <Trash2 size={12} /> Kick
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Disband button */}
                      <button onClick={() => disbandAlliance(a.id)}
                        className="btn-danger w-full text-xs py-2 mt-2">
                        <Trash2 size={14} className="inline" /> Disband Alliance
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════ SERVER ════════════════════════════════ */}
      {tab === 'server' && (
        <div className="px-4 py-4 space-y-4">
          {/* Protection toggle */}
          <div className="card space-y-3">
            <p className="section-title flex items-center gap-1"><Shield size={16} /> New Player Protection</p>
            <p className="text-xs text-slate-400">When enabled, new players cannot be attacked for 24 hours after joining.</p>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${protectionEnabled ? 'text-green-400' : 'text-slate-400'}`}>
                {protectionEnabled ? '● Enabled' : '○ Disabled'}
              </span>
              <button
                onClick={toggleProtection}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  protectionEnabled
                    ? 'bg-red-900/40 border-red-700/50 text-red-300 hover:bg-red-800/50'
                    : 'bg-green-900/40 border-green-700/50 text-green-300 hover:bg-green-800/50'
                }`}>
                {protectionEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>
            {protectionMsg && <div className={`text-xs ${protectionMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{protectionMsg}</div>}
          </div>

          {/* Announcement banner */}
          <div className="card space-y-3">
            <p className="section-title flex items-center gap-1"><Megaphone size={16} /> Announcement Banner</p>
            <p className="text-xs text-slate-400">Set a banner message visible to all players.</p>
            <input
              className="input w-full text-sm py-2.5"
              placeholder="Announcement text…"
              value={announcementDraft}
              onChange={(e) => setAnnouncementDraft(e.target.value)}
            />
            {announcementDraft && (
              <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/40 px-3 py-2">
                <div className="text-[10px] text-yellow-500 mb-1">Preview:</div>
                <div className="text-xs text-yellow-200">{announcementDraft}</div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={saveAnnouncement} className="btn-primary flex-1 text-sm py-2.5">
                {announcementDraft ? 'Update Announcement' : 'Clear Announcement'}
              </button>
              {announcement && (
                <button onClick={() => { setAnnouncementDraft(''); }} className="btn-ghost text-sm py-2.5 px-4">Clear</button>
              )}
            </div>
            {announcementMsg && <div className={`text-xs ${announcementMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{announcementMsg}</div>}
          </div>

          <div className="card bg-red-950/20 border-red-800/30 space-y-3">
            <p className="section-title text-red-400 flex items-center gap-1"><AlertTriangle size={16} className="text-red-400" /> Reset Gameplay</p>
            <p className="text-xs text-slate-400">
              Deletes all bases, units, resources, and medals for non-selected players.
              Admin accounts are always preserved. Tick players below to keep their data:
            </p>

            <div className="max-h-64 overflow-y-auto space-y-0.5 rounded-xl border border-space-600/40 p-2 bg-space-800/60">
              {allUsers.filter((u) => !u.isAdmin).map((u, i) => (
                <label key={u.id} className={`flex items-center gap-3 text-sm text-slate-300 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-space-700/50 ${i % 2 === 1 ? 'bg-space-800/30' : ''}`}>
                  <input type="checkbox" className="accent-blue-500 w-4 h-4"
                    checked={preserveIds.has(u.id)}
                    onChange={(e) => setPreserveIds((prev) => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(u.id) : next.delete(u.id);
                      return next;
                    })}
                  />
                  <span>{u.username}</span>
                  {u.isBanned && <span className="text-[10px] text-red-400">banned</span>}
                </label>
              ))}
              {allUsers.filter((u) => !u.isAdmin).length === 0 && (
                <div className="text-center py-3 text-slate-600 text-xs">No non-admin users</div>
              )}
            </div>

            <div className="text-xs text-slate-500">
              {allUsers.filter((u) => !u.isAdmin && !preserveIds.has(u.id)).length} players will be reset ·{' '}
              {preserveIds.size} preserved
            </div>

            {!resetConfirm ? (
              <button onClick={() => setResetConfirm(true)}
                className="btn-danger w-full text-sm py-2.5">
                <RefreshCw size={14} className="inline" /> Reset Gameplay
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-red-300 font-semibold text-center">This cannot be undone — confirm?</div>
                <div className="flex gap-2">
                  <button onClick={doReset} className="btn-danger flex-1 text-sm py-2.5">
                    Yes, Reset Now
                  </button>
                  <button onClick={() => setResetConfirm(false)} className="flex-1 btn-ghost text-sm py-2.5">Cancel</button>
                </div>
              </div>
            )}
            {resetMsg && <div className={`text-xs text-center ${resetMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{resetMsg}</div>}
          </div>

          {/* Battle reports with filter */}
          <div className="card space-y-3">
            <p className="section-title flex items-center gap-1"><Trophy size={16} /> Battle Reports</p>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs"
                placeholder="Filter by username…"
                value={battleFilter}
                onChange={(e) => setBattleFilter(e.target.value)}
              />
              <button onClick={() => loadBattleReports(battleFilter)} className="btn-primary text-xs px-3">Search</button>
            </div>
            {battleReports.length === 0 ? (
              <div className="text-xs text-slate-600 text-center py-2">No battle reports</div>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {battleReports.map((r, i) => (
                  <div key={r.id ?? i} className={`rounded-lg px-3 py-2 ${i % 2 === 0 ? 'bg-space-700/50' : 'bg-space-800/40'}`}>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white">
                        <span className="text-red-400">{r.attackerName ?? '?'}</span>
                        {' vs '}
                        <span className="text-blue-400">{r.defenderName ?? '?'}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.attackerWon ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
                        {r.attackerWon ? 'Attacker Won' : 'Defender Won'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[10px] text-slate-500">
                        {r.resourcesLooted && Object.values(r.resourcesLooted).reduce((s, v) => s + (v ?? 0), 0) > 0
                          ? `Looted: ${Object.entries(r.resourcesLooted).filter(([,v]) => v > 0).map(([k,v]) => `${k} ${v}`).join(', ')}`
                          : 'No loot'}
                      </div>
                      <div className="text-[10px] text-slate-600">
                        {r.reportedAt ? new Date(r.reportedAt).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════ GAME CONFIG ═══════════════════════════ */}
      {tab === 'config' && (
        <div className="px-4 py-4 space-y-3 pb-24">
          {configMsg && (
            <div className={`text-xs text-center py-2 ${configMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>{configMsg}</div>
          )}

          {/* Sub-section tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {['buildings','mines','units','special'].map((key) => {
              const cfgIcons = { buildings: <Hammer size={14} />, mines: <Pickaxe size={14} />, units: <Swords size={14} />, special: <Wrench size={14} /> };
              const cfgLabels = { buildings: 'Buildings', mines: 'Mines', units: 'Units', special: 'Special' };
              return (
                <button key={key} onClick={() => setConfigSection(key)}
                  className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap border transition-colors flex items-center gap-1 ${configSection === key ? 'bg-blue-900/50 text-blue-300 border-blue-700/50' : 'bg-space-700/50 text-slate-400 border-space-600/40'}`}>
                  {cfgIcons[key]} {cfgLabels[key]}
                </button>
              );
            })}
          </div>

          {/* Config actions */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={exportConfig}
              className="btn-ghost text-xs py-1.5 px-3 text-green-400 border-green-800/50 hover:bg-green-900/30">
              <Package size={14} className="inline" /> Export Config
            </button>
            <label className="btn-ghost text-xs py-1.5 px-3 text-blue-400 border-blue-800/50 hover:bg-blue-900/30 cursor-pointer">
              <ArrowUp size={14} className="inline" /> Import Config
              <input type="file" accept=".json" className="hidden" onChange={(e) => { importConfig(e.target.files[0]); e.target.value = ''; }} />
            </label>
            <button onClick={resetConfigToDefaults}
              className="btn-ghost text-xs py-1.5 px-3 text-red-400 border-red-800/50 hover:bg-red-900/30">
              <AlertTriangle size={14} className="text-red-400 inline" /> Reset to Defaults
            </button>
          </div>

          {!gameConfig ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading…</div>
          ) : (
            <>
              {/* Buildings */}
              {configSection === 'buildings' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Base costs (level 1) — multiplied by 1.2ⁿ per level</p>
                  {Object.entries(gameConfig.buildingBases ?? {}).map(([type, b]) => (
                    <div key={type} className="card space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white flex items-center gap-1"><BuildingIcon type={type} size={14} /> {type.replace(/_/g,' ')}</p>
                        <span className="text-[9px] text-slate-500">tap value to edit</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {['oxygen','water','iron','helium3','time'].map((f) => (
                          <button key={f} onClick={() => openEdit(
                            `${type} base ${f}`, b[f],
                            (v) => saveConfigField('buildingBases', type, { ...b, [f]: parseFloat(v) })
                          )} className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                            <div className="text-[9px] text-slate-500">{f}</div>
                            <div className="text-xs text-blue-300 font-mono">{b[f]}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Mines */}
              {configSection === 'mines' && (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Base costs (level 1) — multiplied by 1.5ⁿ per level</p>
                  {Object.entries(gameConfig.mineBases ?? {}).map(([type, b]) => (
                    <div key={type} className="card space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white flex items-center gap-1"><ResourceIcon type={type} size={14} /> {type} Mine</p>
                        <span className="text-[9px] text-slate-500">tap value to edit</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {['oxygen','water','iron','helium3','time'].map((f) => (
                          <button key={f} onClick={() => openEdit(
                            `${type} mine base ${f}`, b[f],
                            (v) => saveConfigField('mineBases', type, { ...b, [f]: parseFloat(v) })
                          )} className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                            <div className="text-[9px] text-slate-500">{f}</div>
                            <div className="text-xs text-blue-300 font-mono">{b[f]}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="card space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white flex items-center gap-1"><ArrowUp size={14} /> Production Rate per Level (units/min)</p>
                      <span className="text-[9px] text-slate-500 flex items-center gap-0.5">tap to edit <Pencil size={10} /></span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(gameConfig.mineRatePerLevel ?? {}).map(([type, rate]) => (
                        <button key={type} onClick={() => openEdit(
                          `${type} rate/level`, rate,
                          (v) => saveConfigField('mineRatePerLevel', type, parseFloat(v))
                        )} className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                          <div className="text-[9px] text-slate-500">{type}</div>
                          <div className="text-xs text-blue-300 font-mono">{rate}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Units */}
              {configSection === 'units' && (
                <div className="space-y-2">
                  {Object.entries(gameConfig.unitStats ?? {}).map(([unit, s]) => (
                    <div key={unit} className="card space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white flex items-center gap-1"><UnitIcon type={unit} size={16} /> {unit}</p>
                        <span className="text-[9px] text-slate-500 flex items-center gap-0.5">tap value to edit <Pencil size={10} /></span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['attack','defense','carryCapacity','speed','buildTime'].map((f) => (
                          <button key={f} onClick={() => openEdit(`${unit} ${f}`, s[f], (v) => saveUnitStat(unit, f, v))}
                            className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                            <div className="text-[9px] text-slate-500">{f}</div>
                            <div className="text-xs text-blue-300 font-mono">{s[f]}</div>
                          </button>
                        ))}
                        <button onClick={() => openEdit(`${unit} upkeep He3/min`, gameConfig.heliumUpkeep?.[unit] ?? 0,
                          (v) => saveConfigField('heliumUpkeep', unit, parseFloat(v)))}
                          className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                          <div className="text-[9px] text-slate-500">upkeep</div>
                          <div className="text-xs text-blue-300 font-mono">{gameConfig.heliumUpkeep?.[unit] ?? 0}</div>
                        </button>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-500 mb-1">Build Costs</p>
                        <div className="grid grid-cols-4 gap-1">
                          {['oxygen','water','iron','helium3'].map((f) => (
                            <button key={f} onClick={() => openEdit(`${unit} cost ${f}`, s.cost?.[f] ?? 0, (v) => saveUnitStat(unit, `cost.${f}`, v))}
                              className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                              <div className="text-[9px] text-slate-500">{f}</div>
                              <div className="text-xs text-blue-300 font-mono">{s.cost?.[f] ?? 0}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Special */}
              {configSection === 'special' && (
                <div className="card space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white mb-3 flex items-center gap-1"><Wrench size={14} /> Special Values</p>
                    <span className="text-[9px] text-slate-500 flex items-center gap-0.5">tap to edit <Pencil size={10} /></span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(gameConfig.special ?? {}).map(([key, val]) => (
                      <button key={key} onClick={() => openEdit(key, val, (v) => saveConfigField('special', key, parseFloat(v)))}
                        className="text-left rounded-lg bg-space-700/60 px-2 py-1.5 active:bg-space-600/60">
                        <div className="text-[9px] text-slate-500">{key}</div>
                        <div className="text-xs text-blue-300 font-mono">{val}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Edit bottom sheet */}
      {editModal && (
        <EditModal
          label={editModal.label}
          value={editModal.value}
          onSave={editModal.onSave}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
