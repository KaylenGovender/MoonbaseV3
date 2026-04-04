import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useSocketStore } from '../store/socketStore.js';
import { api } from '../utils/api.js';

export default function DMChat({ targetUserId, targetUsername, onClose }) {
  const user = useAuthStore((s) => s.user);
  const socket = useSocketStore((s) => s.socket);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const chatRef = useRef(null);

  // Load message history and join DM room
  useEffect(() => {
    if (!targetUserId) return;
    api.get(`/chat/dm/${targetUserId}`)
      .then((d) => {
        setMessages(d.messages ?? []);
        setTimeout(() => chatRef.current?.scrollTo({ top: 99999 }), 50);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    socket?.emit('chat:join_dm', { withUserId: targetUserId });
  }, [targetUserId]);

  // Listen for incoming DM messages
  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      // Only show messages for this DM conversation
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
    <div className="fixed inset-0 z-50 flex flex-col bg-space-900/98" onClick={onClose}>
      <div className="flex flex-col h-full max-w-lg mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-space-600/50 bg-space-800/95 flex-shrink-0">
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">← Back</button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">💬 {targetUsername}</div>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
          {loading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading messages…</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-slate-600 text-sm">No messages yet. Say hello! 👋</div>
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
    </div>
  );
}
