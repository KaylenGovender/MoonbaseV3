import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import { getInitials } from '../utils/format.js';
import { MessageCircle, Search, Trash2, ArrowLeft, Check, CheckCheck } from 'lucide-react';

export default function ChatPage() {
  const { targetId } = useParams();
  const [searchParams] = useSearchParams();
  const targetUsername = searchParams.get('name') ?? '?';
  const navigate = useNavigate();

  if (targetId) {
    return <DMView targetUserId={targetId} targetUsername={targetUsername} onBack={() => navigate('/chat')} />;
  }
  return <ConversationList navigate={navigate} />;
}

/* ── Conversation List ────────────────────────────────────────────────────── */
function ConversationList({ navigate }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get('/chat/conversations')
      .then((d) => setConversations(d.conversations ?? []))
      .catch((e) => console.error('Failed to load conversations:', e))
      .finally(() => setLoading(false));
  }, []);

  async function handleDeleteConversation(userId) {
    try {
      await api.delete(`/chat/conversation/${userId}`);
      setConversations((prev) => prev.filter((c) => c.userId !== userId));
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
    setDeleteTarget(null);
  }

  // Debounced player search
  const handleSearch = useCallback((q) => {
    setSearchQ(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await api.get(`/chat/search?q=${encodeURIComponent(q.trim())}`);
        setSearchResults(d.users ?? []);
      } catch {}
      setSearching(false);
    }, 350);
  }, []);

  const showSearch = searchQ.trim().length >= 2;

  return (
    <div className="page flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3">
        <h1 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5"><MessageCircle size={16} className="text-blue-400" /> Messages</h1>
        {/* Player search */}
        <div className="relative">
          <input
            ref={searchRef}
            className="input w-full text-sm py-2 pl-8"
            placeholder="Search players to message…"
            value={searchQ}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm"><Search size={14} className="text-slate-500" /></span>
          {searchQ && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
              onClick={() => { setSearchQ(''); setSearchResults([]); }}
            >×</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Search results */}
        {showSearch ? (
          <div>
            <div className="px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
              Players
            </div>
            {searching ? (
              <div className="text-center py-6 text-slate-500 text-sm">Searching…</div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-6 text-slate-600 text-sm">No players found</div>
            ) : (
              <div className="divide-y divide-space-700/50">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => navigate(`/chat/${u.id}?name=${encodeURIComponent(u.username)}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-space-700/40 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-900/60 border border-blue-700/40 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                      {getInitials(u.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{u.username}</div>
                      <div className="text-xs text-slate-500">Tap to message</div>
                    </div>
                    <MessageCircle size={14} className="text-blue-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Conversation list */
          <>
            {conversations.length > 0 && (
              <div className="px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wide font-semibold">
                Recent
              </div>
            )}
            {loading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 text-slate-600 text-sm">
                <div className="mb-3 flex justify-center"><MessageCircle size={40} className="text-slate-600" /></div>
                <div className="font-medium text-slate-500 mb-1">No conversations yet</div>
                <div className="text-xs text-slate-600">Search for a player above to start chatting</div>
              </div>
            ) : (
              <div className="divide-y divide-space-700/50">
                {conversations.map((c) => (
                  <div
                    key={c.userId}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-space-700/40 transition-colors text-left"
                  >
                    <button
                      onClick={() => navigate(`/chat/${c.userId}?name=${encodeURIComponent(c.username)}`)}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div className="w-10 h-10 rounded-full bg-space-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                        {getInitials(c.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{c.username}</div>
                        <div className="text-xs text-slate-500 truncate">{c.lastMessage}</div>
                      </div>
                      <div className="text-[10px] text-slate-600 flex-shrink-0">
                        {formatTime(c.sentAt)}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                      className="text-slate-600 hover:text-red-400 transition-colors text-sm flex-shrink-0 p-1"
                      title="Delete conversation"
                    ><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-space-800 border border-space-600/50 rounded-xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-white mb-2">Delete conversation?</div>
            <div className="text-xs text-slate-400 mb-4">Delete conversation with {deleteTarget.username}? This cannot be undone.</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={() => handleDeleteConversation(deleteTarget.userId)} className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── DM View ──────────────────────────────────────────────────────────────── */
function DMView({ targetUserId, targetUsername, onBack }) {
  const user = useAuthStore((s) => s.user);
  const socket = useSocketStore((s) => s.socket);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const chatRef = useRef(null);

  useEffect(() => {
    if (!targetUserId) return;
    setLoading(true);
    api.get(`/chat/dm/${targetUserId}`)
      .then((d) => {
        const msgs = d.messages ?? [];
        setMessages(msgs);
        // Mark unread messages from the other user as read
        const unreadIds = msgs
          .filter((m) => m.fromUserId === targetUserId && m.toUserId === user?.id && !m.readAt)
          .map((m) => m.id);
        if (unreadIds.length > 0) {
          api.post('/chat/mark-read', { messageIds: unreadIds })
            .then(() => {
              setMessages((prev) => prev.map((m) =>
                unreadIds.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m
              ));
            })
            .catch(() => {});
        }
        setTimeout(() => {
          if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }, 50);
      })
      .catch((e) => console.error('Failed to load DM history:', e))
      .finally(() => setLoading(false));

    socket?.emit('chat:join_dm', { withUserId: targetUserId });
    return () => {
      socket?.emit('chat:leave_dm', { withUserId: targetUserId });
    };
  }, [targetUserId, socket]);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      if (!msg.allianceId &&
          ((msg.fromUserId === targetUserId && msg.toUserId === user?.id) ||
           (msg.fromUserId === user?.id && msg.toUserId === targetUserId))) {
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);
      }
    };
    socket.on('chat:message', handler);
    return () => socket.off('chat:message', handler);
  }, [socket, targetUserId, user?.id]);

  function send() {
    const text = input.trim();
    if (!text || !socket) return;
    socket.emit('chat:send', { toUserId: targetUserId, message: text }, (ack) => {
      if (ack?.success) {
        setInput('');
      } else {
        console.error('Failed to send:', ack?.error);
      }
    });
  }

  return (
    <div className="page flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1"><ArrowLeft size={14} /> Back</button>
        <div className="w-9 h-9 rounded-full bg-blue-900/60 border border-blue-700/40 flex items-center justify-center text-sm font-bold text-white">
          {getInitials(targetUsername)}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{targetUsername}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            <div className="mb-2 flex justify-center"><MessageCircle size={32} className="text-slate-600" /></div>
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id ?? i} className={`flex ${msg.fromUserId === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm
                ${msg.fromUserId === user?.id
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-space-700 text-slate-200 rounded-bl-sm'}`}>
                {msg.message}
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  {msg.sentAt && (
                    <span className="text-[9px] text-white/50">
                      {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {msg.fromUserId === user?.id && (
                    <span className={`${msg.readAt ? 'text-blue-400' : 'text-slate-500'}`}>
                      {msg.readAt ? <CheckCheck size={10} /> : <Check size={10} />}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-space-600/50 bg-space-800 pb-safe">
        <input
          className="input flex-1 text-sm py-2.5"
          placeholder={`Message ${targetUsername}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          autoFocus
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="btn-primary px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
