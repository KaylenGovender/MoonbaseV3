import { useEffect, useState, useCallback } from 'react';
import { useSocketStore } from '../store/socketStore.js';
import { useMapStore } from '../store/mapStore.js';
import { api } from '../utils/api.js';
import CanvasMap from '../components/CanvasMap.jsx';
import AttackModal from '../components/AttackModal.jsx';

export default function MapPage() {
  const { socket } = useSocketStore();
  const { bases, attacks, tradePods, playerBases, playerBaseIds, visRadius, setMapData, removeAttack, transitionAttackReturning } = useMapStore();
  const [selectedBase, setSelectedBase] = useState(null);
  const [showAttack,   setShowAttack]   = useState(false);
  const [showChat,     setShowChat]     = useState(false);
  const [loading,      setLoading]      = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/map/bases');
      setMapData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000); // refresh every 30s
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on('map:attack_returning',  transitionAttackReturning);
    socket.on('map:attack_completed',  ({ attackId }) => removeAttack(attackId));
    socket.on('map:attack_launched',   load);
    return () => {
      socket.off('map:attack_returning');
      socket.off('map:attack_completed');
      socket.off('map:attack_launched');
    };
  }, [socket]);

  function handleBaseClick(base) {
    setShowAttack(false);
    setShowChat(false);
    setSelectedBase(base);
    // If enemy base → go straight to attack modal
    if (!base.isOwn) {
      setShowAttack(true);
    }
  }

  const isOwnBase = selectedBase?.isOwn ?? false; // kept for reference

  return (
    <div className="page flex flex-col" style={{ paddingBottom: '56px' }}>
      {/* Header */}
      <div className="bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <h1 className="text-sm font-semibold text-white">Lunar Map</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Own
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Other
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Admin
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-space-900/80 z-10">
            <div className="text-slate-400 text-sm">Loading map…</div>
          </div>
        )}
        <CanvasMap
          bases={bases}
          attacks={attacks}
          tradePods={tradePods}
          playerBases={playerBases}
          visRadius={visRadius}
          onBaseClick={handleBaseClick}
        />
      </div>

      {/* Own-base info panel — shown when you tap your own base */}
      {selectedBase && selectedBase.isOwn && !showAttack && (
        <div className="bg-space-800 border-t border-space-600/50 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sky-400 font-medium text-sm">🏠 {selectedBase.name}</div>
              <div className="text-xs text-slate-400">Your base</div>
            </div>
            <button onClick={() => setSelectedBase(null)} className="text-slate-500 text-lg px-2">✕</button>
          </div>
        </div>
      )}

      {/* Enemy-base quick-attack bar — if user dismissed modal but base still selected */}
      {selectedBase && !selectedBase.isOwn && !showAttack && (
        <div className="bg-space-800 border-t border-space-600/50 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-red-400 font-medium text-sm">⚠️ {selectedBase.name}</div>
              <div className="text-xs text-slate-400">Commander {selectedBase.username}</div>
            </div>
            <button onClick={() => setSelectedBase(null)} className="text-slate-500 text-lg px-2">✕</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAttack(true)} className="btn-danger flex-1 text-sm">⚔️ Attack</button>
            <button onClick={() => setShowChat(true)} className="btn-ghost flex-1 text-sm">💬 Message</button>
          </div>
        </div>
      )}

      {/* Attack Modal */}
      {showAttack && selectedBase && (
        <AttackModal
          targetBase={selectedBase}
          playerBaseIds={playerBaseIds}
          onClose={() => { setShowAttack(false); setSelectedBase(null); }}
          onLaunched={() => { setShowAttack(false); setSelectedBase(null); load(); }}
        />
      )}
    </div>
  );
}
