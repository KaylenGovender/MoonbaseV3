import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';
import { getInitials } from '../utils/format.js';

export default function ChatPage() {
  const { targetId } = useParams();
  const [searchParams] = useSearchParams();
  const targetUsername = searchParams.get('name') ?? '?';
  const navigate = useNavigate();

  // If targetId is set, show the DM view; otherwise show conversation list
  if (targetId) {
    return <DMView targetUserId={targetId} targetUsername={targetUsername} onBack={() => navigate('/chat')} />;
  }
  return <ConversationList navigate={navigate} />;
}

/* ── Conversation List ────────────────────────────────────────────────────── */
function ConversationList({ navigate }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/chat/conversations')
      .then((d) => setConversations(d.conversations ?? []))
      .catch((e) => console.error('Failed to load conversations:', e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page flex flex-col">
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-sm font-semibold text-white">💬 Messages</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-10 text-slate-600 text-sm">
            <div className="text-3xl mb-2">💬</div>
            No conversations yet.<br />
            <span className="text-slate-500">Tap a player profile to start chatting.</span>
          </div>
        ) : (
          <div className="divide-y divide-space-700/50">
            {conversations.map((c) => (
              <button
                key={c.userId}
                onClick={() => navigate(`/chat/${c.userId}?name=${encodeURIComponent(c.username)}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-space-700/40 transition-colors text-left"
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
            ))}
          </div>
        )}
      </div>
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
    api.get(`/chat/dm/${targetUserId}`)
      .then((d) => {
        setMessages(d.messages ?? []);
        setTimeout(() => chatRef.current?.scrollTo({ top: 99999 }), 50);
      })
      .catch((e) => console.error('Failed to load DM history:', e))
      .finally(() => setLoading(false));

    socket?.emit('chat:join_dm', { withUserId: targetUserId });
  }, [targetUserId]);

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
    socket.emit('chat:send', { toUserId: targetUserId, message: text });
    setInput('');
  }

  return (
    <div className="page flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">💬 {targetUsername}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            <div className="text-3xl mb-2">👋</div>
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id ?? i} className={`flex ${msg.fromUserId === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm
                ${msg.fromUserId === user?.id ? 'bg-blue-700 text-white' : 'bg-space-700 text-slate-200'}`}>
                {msg.fromUserId !== user?.id && (
                  <div className="text-[10px] text-slate-400 mb-1">{msg.fromUser?.username ?? targetUsername}</div>
                )}
                {msg.message}
                {msg.sentAt && (
                  <div className="text-[9px] text-slate-400/60 mt-0.5 text-right">
                    {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-space-600/50 bg-space-800 flex-shrink-0 pb-safe">
        <input
          className="input flex-1 text-sm py-2"
          placeholder={`Message ${targetUsername}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          autoFocus
        />
        <button onClick={send} className="btn-primary px-4 py-2">Send</button>
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
