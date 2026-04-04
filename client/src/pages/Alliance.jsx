import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';
import { getInitials } from '../utils/format.js';
import { UNIT_META } from '../utils/gameConstants.js';
import PlayerProfileModal from '../components/PlayerProfileModal.jsx';

export default function Alliance() {
  const { user } = useAuthStore();
  const activeBaseId = useAuthStore((s) => s.activeBaseId);
  const { socket } = useSocketStore();
  const [alliance,  setAlliance]  = useState(null);
  const [invites,   setInvites]   = useState([]);
  const [alliances, setAlliances] = useState([]);
  const [tab,       setTab]       = useState('info');
  const [messages,  setMessages]  = useState([]);
  const [msgInput,  setMsgInput]  = useState('');
  const [inviteUser,setInviteUser]= useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [createName,setCreateName]= useState('');
  const [joinRequests, setJoinRequests] = useState([]);
  const [profileUser,  setProfileUser]  = useState(null);
  // Send Resources / Reinforcements modals
  const [sendModal,    setSendModal]    = useState(null); // { type: 'resources'|'reinforce', member }
  const [sendAmounts,  setSendAmounts]  = useState({});
  const [sendUnits,    setSendUnits]    = useState({});
  const [sendLoading,  setSendLoading]  = useState(false);
  const [sendSuccess,  setSendSuccess]  = useState('');
  const [sendError,    setSendError]    = useState('');
  const [myResources,  setMyResources]  = useState(null);  // { oxygen, water, iron, helium3 }
  const [myUnitStocks, setMyUnitStocks] = useState([]);     // [{ type, count }]
  const chatRef = useRef(null);

  async function load() {
    try {
      const d = await api.get('/alliance/my/info');
      setAlliance(d.alliance);
      if (d.alliance) {
        const msgs = await api.get(`/chat/alliance/${d.alliance.id}`);
        setMessages(msgs.messages ?? []);
        socket?.emit('chat:join_alliance', { allianceId: d.alliance.id });
        // Load join requests if leader
        if (d.alliance.leaderId === user?.id) {
          const rq = await api.get(`/alliance/${d.alliance.id}/requests`);
          setJoinRequests(rq.requests ?? []);
        }
      } else {
        const inv = await api.get('/alliance/invites/mine');
        setInvites(inv.invites ?? []);
        const lst = await api.get('/alliance/list/all');
        setAlliances(lst.alliances ?? []);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('chat:message', (msg) => {
      if (msg.allianceId === alliance?.id) {
        setMessages((m) => [...m, msg]);
        setTimeout(() => chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);
      }
    });
    return () => socket.off('chat:message');
  }, [socket, alliance]);

  async function requestToJoin(allianceId) {
    setError('');
    try {
      await api.post(`/alliance/${allianceId}/request`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function acceptJoinRequest(requestId) {
    try {
      await api.post(`/alliance/request/${requestId}/accept`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function declineJoinRequest(requestId) {
    try {
      await api.post(`/alliance/request/${requestId}/decline`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function createAlliance() {
    setError('');
    try {
      const d = await api.post('/alliance/create', { name: createName });
      await load();
      setTab('info');
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendInvite() {
    setError('');
    try {
      await api.post(`/alliance/${alliance.id}/invite`, { invitedUsername: inviteUser });
      setInviteUser('');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function kickMember(userId) {
    try {
      await api.post(`/alliance/${alliance.id}/kick/${userId}`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function promoteMember(userId) {
    try {
      await api.post(`/alliance/${alliance.id}/promote/${userId}`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function demoteMember(userId) {
    try {
      await api.post(`/alliance/${alliance.id}/demote/${userId}`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function acceptInvite(inviteId) {
    try {
      await api.post(`/alliance/invite/${inviteId}/accept`, {});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function leaveAlliance() {
    if (!window.confirm('Leave this alliance?')) return;
    try {
      await api.post(`/alliance/${alliance.id}/leave`, {});
      setAlliance(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function disbandAlliance() {
    if (!window.confirm(`Disband "${alliance.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/alliance/${alliance.id}`);
      setAlliance(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function openSendModal(type, member) {
    setSendModal({ type, member });
    setSendAmounts({});
    setSendUnits({});
    setSendSuccess('');
    setSendError('');
    // Load my current stocks so we can show available amounts
    try {
      if (type === 'resources') {
        const d = await api.get(`/base/${activeBaseId}/resources`);
        setMyResources(d.resourceState ?? null);
      } else {
        const d = await api.get(`/warroom/${activeBaseId}`);
        setMyUnitStocks(d.unitStocks ?? []);
      }
    } catch {}
  }

  async function submitSendResources() {
    const targetBaseId = sendModal.member.primaryBase?.id;
    if (!targetBaseId) { setSendError('Member has no active base'); return; }
    const resources = {
      oxygen:  parseInt(sendAmounts.oxygen)  || 0,
      water:   parseInt(sendAmounts.water)   || 0,
      iron:    parseInt(sendAmounts.iron)    || 0,
      helium3: parseInt(sendAmounts.helium3) || 0,
    };
    if (Object.values(resources).every((v) => v === 0)) { setSendError('Enter at least one resource amount'); return; }
    setSendLoading(true);
    setSendError('');
    try {
      await api.post(`/tradepod/${activeBaseId}/send`, { toBaseId: targetBaseId, resources });
      const lines = [
        resources.oxygen  > 0 ? `O₂ ${resources.oxygen}`   : null,
        resources.water   > 0 ? `H₂O ${resources.water}`   : null,
        resources.iron    > 0 ? `Fe ${resources.iron}`      : null,
        resources.helium3 > 0 ? `He3 ${resources.helium3}`  : null,
      ].filter(Boolean);
      setSendSuccess(`Sent to ${sendModal.member.user?.username}:\n${lines.join(' · ')}`);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSendLoading(false);
    }
  }

  async function submitSendReinforcements() {
    const targetBaseId = sendModal.member.primaryBase?.id;
    if (!targetBaseId) { setSendError('Member has no active base'); return; }
    const units = Object.fromEntries(
      Object.entries(sendUnits).filter(([, v]) => parseInt(v) > 0).map(([k, v]) => [k, parseInt(v)])
    );
    if (Object.keys(units).length === 0) { setSendError('Select at least one unit type'); return; }
    setSendLoading(true);
    setSendError('');
    try {
      await api.post(`/reinforcement/${activeBaseId}/send`, { targetBaseId, units });
      const lines = Object.entries(units).map(([type, qty]) => `${UNIT_META[type]?.icon ?? type} ${qty}× ${UNIT_META[type]?.label ?? type}`);
      setSendSuccess(`Sent to ${sendModal.member.user?.username}:\n${lines.join(' · ')}`);
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSendLoading(false);
    }
  }

  async function sendMessage() {
    if (!msgInput.trim() || !alliance) return;
    socket?.emit('chat:send', { allianceId: alliance.id, message: msgInput.trim() });
    setMsgInput('');
  }

  if (!alliance) {
    return (
      <div className="page">
        <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3">
          <h1 className="text-sm font-semibold text-white">🛡️ Alliance</h1>
        </div>
        <div className="px-4 py-4 space-y-5">
          {error && <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

          {invites.length > 0 && (
            <div>
              <p className="section-title">Pending Invites</p>
              {invites.map((inv) => (
                <div key={inv.id} className="card flex items-center justify-between">
                  <span className="text-sm text-white">{inv.alliance.name}</span>
                  <button onClick={() => acceptInvite(inv.id)} className="btn-primary text-xs py-2 px-4">
                    Accept
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-white">Create Alliance</h2>
            <p className="text-xs text-slate-400">Requires Alliance building level 1</p>
            <input
              className="input"
              placeholder="Alliance name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <button onClick={createAlliance} className="btn-primary w-full">
              Create Alliance
            </button>
          </div>

          {alliances.length > 0 && (
            <div>
              <p className="section-title">Browse Alliances</p>
              <div className="space-y-2">
                {alliances.map((a) => (
                  <AllianceCard key={a.id} alliance={a} onRequest={requestToJoin} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isLeader = alliance.leaderId === user?.id;
  const myMember = (alliance.members ?? []).find((m) => m.userId === user?.id);
  const myRole   = isLeader ? 'LEADER' : (myMember?.role ?? 'MEMBER');

  return (
    <div className={tab === 'chat' ? 'flex flex-col overflow-hidden' : 'page'} style={tab === 'chat' ? { height: '100dvh' } : undefined}>
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3">
        <h1 className="text-sm font-semibold text-white">🛡️ {alliance.name}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-space-600/50">
        {['info', 'members', 'chat'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-medium capitalize transition-colors
              ${tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {tab === 'info' && (
        <div className="px-4 py-4 space-y-4">
          <div className="card space-y-2">
            <div className="stat-row"><span className="text-slate-400 text-sm">Alliance</span><span className="text-white font-semibold">{alliance.name}</span></div>
            <div className="stat-row"><span className="text-slate-400 text-sm">Members</span><span className="text-white">{alliance.members?.length ?? 0}</span></div>
            <div className="stat-row"><span className="text-slate-400 text-sm">Role</span><span className={myRole === 'LEADER' ? 'text-yellow-400' : myRole === 'ADMIN' ? 'text-purple-400' : 'text-slate-300'}>{myRole === 'LEADER' ? '👑 Leader' : myRole === 'ADMIN' ? '⭐ Admin' : 'Member'}</span></div>
          </div>

          {isLeader ? (
            <button onClick={disbandAlliance} className="btn-danger w-full text-sm">
              💥 Disband Alliance
            </button>
          ) : (
            <button onClick={leaveAlliance} className="btn-ghost w-full text-sm border-red-800/50 text-red-400">
              🚪 Leave Alliance
            </button>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="px-4 py-4 space-y-4">
          {isLeader && joinRequests.length > 0 && (
            <div className="space-y-2">
              <p className="section-title" style={{color:'#facc15'}}>⏳ Join Requests</p>
              {joinRequests.map((req) => (
                <div key={req.id} className="card flex items-center justify-between">
                  <span className="text-sm text-white">{req.invitedUser?.username}</span>
                  <div className="flex gap-2">
                    <button onClick={() => acceptJoinRequest(req.id)} className="btn-primary text-xs px-3 py-1">Accept</button>
                    <button onClick={() => declineJoinRequest(req.id)} className="btn-ghost text-xs px-3 py-1 text-red-400">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {(alliance.members ?? []).map((m) => {
              const memberRole = m.userId === alliance.leaderId ? 'LEADER' : (m.role ?? 'MEMBER');
              const isAdmin = memberRole === 'ADMIN';
              const canKick = (isLeader && m.userId !== user?.id) || (myRole === 'ADMIN' && memberRole === 'MEMBER' && m.userId !== user?.id);
              // Contribution score: sum available points fields from server enrichment
              const contribution = (m.populationPoints ?? 0) + (m.attackerPoints ?? 0) + (m.defenderPoints ?? 0) + (m.raiderPoints ?? 0);

              return (
                <div key={m.userId} className="card">
                  <div className="flex items-center justify-between">
                    <button
                      className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                      onClick={() => setProfileUser({ userId: m.userId, username: m.user?.username ?? '?' })}
                    >
                      <div className="w-8 h-8 rounded-full bg-space-600 flex items-center justify-center text-xs font-bold text-white">
                        {getInitials(m.user?.username ?? '?')}
                      </div>
                      <div>
                        <div className="text-sm text-white flex items-center gap-1.5">
                          {m.user?.username}
                          {memberRole === 'LEADER' && <span className="text-[10px] text-yellow-400">👑 Leader</span>}
                          {memberRole === 'ADMIN'  && <span className="text-[10px] text-purple-400">⭐ Admin</span>}
                        </div>
                        {contribution > 0 && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{contribution.toLocaleString()} contribution pts</div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {m.userId !== user?.id && (
                        <>
                          <button
                            onClick={() => openSendModal('resources', m)}
                            className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700/40 px-2 py-1 rounded-lg hover:bg-blue-800/60 transition-colors"
                            title="Send Resources"
                          >💰</button>
                          <button
                            onClick={() => openSendModal('reinforce', m)}
                            className="text-xs bg-green-900/50 text-green-300 border border-green-700/40 px-2 py-1 rounded-lg hover:bg-green-800/60 transition-colors"
                            title="Send Reinforcements"
                          >🛡</button>
                        </>
                      )}
                      {isLeader && m.userId !== user?.id && memberRole !== 'LEADER' && (
                        isAdmin ? (
                          <button onClick={() => demoteMember(m.userId)} className="text-xs text-purple-400 hover:text-purple-300 px-1" title="Demote to Member">
                            Demote
                          </button>
                        ) : (
                          <button onClick={() => promoteMember(m.userId)} className="text-xs text-purple-400 hover:text-purple-300 px-1" title="Promote to Admin">
                            Promote
                          </button>
                        )
                      )}
                      {canKick && (
                        <button onClick={() => kickMember(m.userId)} className="text-xs text-red-400 hover:text-red-300 px-1">
                          Kick
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isLeader && (
            <div className="card space-y-2">
              <p className="section-title">Invite Player</p>
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm py-2"
                  placeholder="Username"
                  value={inviteUser}
                  onChange={(e) => setInviteUser(e.target.value)}
                />
                <button onClick={sendInvite} className="btn-primary px-4 py-2 text-sm">Invite</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="flex flex-col" style={{ height: 'calc(100dvh - 112px - 56px)' }}>
          <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.fromUserId === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm
                  ${msg.fromUserId === user?.id ? 'bg-blue-700 text-white' : 'bg-space-700 text-slate-200'}`}>
                  {msg.fromUserId !== user?.id && (
                    <div className="text-[10px] text-slate-400 mb-1">{msg.fromUser?.username}</div>
                  )}
                  {msg.message}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 px-4 py-3 border-t border-space-600/50 bg-space-800 flex-shrink-0">
            <input
              className="input flex-1 text-sm py-2"
              placeholder="Message alliance…"
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage} className="btn-primary px-4 py-2">Send</button>
          </div>
        </div>
      )}

      {profileUser && (
        <PlayerProfileModal
          userId={profileUser.userId}
          username={profileUser.username}
          onClose={() => setProfileUser(null)}
        />
      )}

      {/* Send Resources / Reinforcements Modal — z-[100] to sit above nav */}
      {sendModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex flex-col justify-end">
          <div className="w-full bg-space-800 rounded-t-2xl border-t border-space-600/50 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
              <h3 className="text-sm font-semibold text-white">
                {sendModal.type === 'resources' ? '💰 Send Resources' : '🛡 Send Reinforcements'}
                <span className="text-slate-400 font-normal"> → {sendModal.member.user?.username}</span>
              </h3>
              <button onClick={() => setSendModal(null)} className="text-slate-500 text-xl leading-none px-2">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3">
              {sendSuccess ? (
                <div className="text-center py-6 space-y-3">
                  <div className="text-2xl">✅</div>
                  <div className="text-green-400 text-sm font-semibold">Dispatched!</div>
                  <div className="bg-space-700/60 rounded-xl px-4 py-3 text-xs text-slate-300 text-left space-y-1">
                    {sendSuccess.split('\n').map((line, i) => (
                      <div key={i} className={i === 0 ? 'text-slate-400' : 'font-mono text-white'}>{line}</div>
                    ))}
                  </div>
                  <button onClick={() => setSendModal(null)} className="btn-ghost text-sm px-8">Close</button>
                </div>
              ) : (
                <>
                  {sendModal.type === 'resources' ? (
                    <div className="space-y-2">
                      {[
                        ['oxygen',  'O₂',  'text-sky-400',    myResources?.oxygen  ?? 0],
                        ['water',   'H₂O', 'text-blue-400',   myResources?.water   ?? 0],
                        ['iron',    'Fe',  'text-orange-400', myResources?.iron    ?? 0],
                        ['helium3', 'He3', 'text-red-400',    myResources?.helium3 ?? 0],
                      ].map(([key, label, color, available]) => (
                        <div key={key} className="flex items-center gap-3">
                          <div className="w-12 text-right">
                            <span className={`text-xs font-bold ${color}`}>{label}</span>
                          </div>
                          <div className="flex-1">
                            <input
                              type="number" min="0" max={available} placeholder="0"
                              value={sendAmounts[key] ?? ''}
                              onChange={(e) => setSendAmounts((a) => ({ ...a, [key]: e.target.value }))}
                              className="input w-full text-sm py-2"
                            />
                          </div>
                          <div className="text-xs text-slate-500 w-20 text-right">
                            / {formatNumber(available)} avail
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(UNIT_META).map(([type, meta]) => {
                        const stock = myUnitStocks.find((s) => s.type === type);
                        const available = stock?.count ?? 0;
                        if (available === 0) return null; // only show units you have
                        return (
                          <div key={type} className="flex items-center gap-3">
                            <span className="text-xl w-8 text-center">{meta.icon}</span>
                            <div className="flex-1">
                              <div className="text-xs text-slate-400 mb-1">{meta.label}</div>
                              <input
                                type="number" min="0" max={available} placeholder="0"
                                value={sendUnits[type] ?? ''}
                                onChange={(e) => setSendUnits((u) => ({ ...u, [type]: e.target.value }))}
                                className="input w-full text-xs py-1.5"
                              />
                            </div>
                            <div className="text-xs text-slate-500 w-20 text-right">
                              / {formatNumber(available)} avail
                            </div>
                          </div>
                        );
                      })}
                      {myUnitStocks.every((s) => s.count === 0) && (
                        <p className="text-slate-500 text-sm text-center py-4">No units available to send</p>
                      )}
                    </div>
                  )}
                  {sendError && <p className="text-red-400 text-xs bg-red-900/20 rounded-lg px-3 py-2">{sendError}</p>}
                  <button
                    onClick={sendModal.type === 'resources' ? submitSendResources : submitSendReinforcements}
                    disabled={sendLoading}
                    className="btn-primary w-full text-sm py-3"
                  >
                    {sendLoading ? 'Sending…' : sendModal.type === 'resources' ? '💰 Send Resources' : '🛡 Send Reinforcements'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AllianceCard({ alliance: a, onRequest }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-white font-medium">{a.name}</div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
          >
            {a.memberCount} member{a.memberCount !== 1 ? 's' : ''} {expanded ? '▲' : '▼'}
          </button>
        </div>
        {a.hasRequested ? (
          <span className="text-xs text-yellow-400 font-medium">Requested</span>
        ) : (
          <button
            onClick={() => onRequest(a.id)}
            className="btn-ghost text-xs px-3 py-1 text-blue-400"
          >
            Request to Join
          </button>
        )}
      </div>
      {expanded && a.members?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-space-600/40 flex flex-wrap gap-1">
          {a.members.map((username) => (
            <span key={username} className="text-xs bg-space-700 text-slate-300 px-2 py-0.5 rounded-full">
              {username}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
