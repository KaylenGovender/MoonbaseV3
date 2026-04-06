import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { getInitials } from '../utils/format.js';
import DMChat from './DMChat.jsx';
import { MessageCircle } from 'lucide-react';

export default function ChatList({ onClose }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);

  useEffect(() => {
    api.get('/chat/conversations')
      .then((d) => setConversations(d.conversations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (activeChat) {
    return (
      <DMChat
        targetUserId={activeChat.userId}
        targetUsername={activeChat.username}
        onClose={() => {
          setActiveChat(null);
          // Refresh conversation list
          api.get('/chat/conversations')
            .then((d) => setConversations(d.conversations ?? []))
            .catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-space-900/98" onClick={onClose}>
      <div className="flex flex-col h-full max-w-lg mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-space-600/50 bg-space-800/95 flex-shrink-0">
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">← Back</button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white flex items-center gap-1"><MessageCircle size={14} /> Messages</div>
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-sm">
              <div className="text-3xl mb-2"><MessageCircle size={32} className="mx-auto text-slate-600" /></div>
              No conversations yet.<br />
              <span className="text-slate-500">Tap a player profile to start chatting.</span>
            </div>
          ) : (
            <div className="divide-y divide-space-700/50">
              {conversations.map((c) => (
                <button
                  key={c.userId}
                  onClick={() => setActiveChat(c)}
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
