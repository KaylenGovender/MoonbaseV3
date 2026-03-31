import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import { formatNumber } from '../utils/format.js';

export default function Alliance() {
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const [alliance,  setAlliance]  = useState(null);
  const [invites,   setInvites]   = useState([]);
  const [tab,       setTab]       = useState('info');
  const [messages,  setMessages]  = useState([]);
  const [msgInput,  setMsgInput]  = useState('');
  const [inviteUser,setInviteUser]= useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [createName,setCreateName]= useState('');
  const chatRef = useRef(null);

  async function load() {
    try {
      const d = await api.get('/alliance/my/info');
      setAlliance(d.alliance);
      if (d.alliance) {
        const msgs = await api.get(`/chat/alliance/${d.alliance.id}`);
        setMessages(msgs.messages ?? []);
        socket?.emit('chat:join_alliance', { allianceId: d.alliance.id });
      } else {
        const inv = await api.get('/alliance/invites/mine');
        setInvites(inv.invites ?? []);
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

  async function acceptInvite(inviteId) {
    try {
      await api.post(`/alliance/invite/${inviteId}/accept`, {});
      await load();
    } catch (e) {
      setError(e.message);
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
        </div>
      </div>
    );
  }

  const isLeader = alliance.leaderId === user?.id;

  return (
    <div className="page">
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
            <div className="stat-row"><span className="text-slate-400 text-sm">Role</span><span className={isLeader ? 'text-yellow-400' : 'text-slate-300'}>{isLeader ? 'Leader' : 'Member'}</span></div>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="px-4 py-4 space-y-4">
          <div className="space-y-2">
            {(alliance.members ?? []).map((m) => (
              <div key={m.userId} className="card flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-space-600 flex items-center justify-center text-xs font-bold text-white">
                    {(m.user?.username ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm text-white">{m.user?.username}</div>
                    {m.userId === alliance.leaderId && <div className="text-[10px] text-yellow-400">Leader</div>}
                  </div>
                </div>
                {isLeader && m.userId !== user?.id && (
                  <button onClick={() => kickMember(m.userId)} className="text-xs text-red-400 hover:text-red-300">
                    Kick
                  </button>
                )}
              </div>
            ))}
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
        <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
          <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
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
          <div className="flex gap-2 px-4 py-3 border-t border-space-600/50 bg-space-800">
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
    </div>
  );
}
