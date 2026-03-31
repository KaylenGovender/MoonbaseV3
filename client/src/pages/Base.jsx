import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useBaseStore } from '../store/baseStore.js';
import { api } from '../utils/api.js';
import ResourceGauge from '../components/ResourceGauge.jsx';
import BuildingCard from '../components/BuildingCard.jsx';
import ActiveEvents from '../components/ActiveEvents.jsx';
import BattleReports from '../components/BattleReports.jsx';
import { siloCapacity } from '../utils/gameConstants.js';

export default function Base() {
  const navigate      = useNavigate();
  const activeBaseId  = useAuthStore((s) => s.activeBaseId);
  const user          = useAuthStore((s) => s.user);
  const logout        = useAuthStore((s) => s.logout);
  const { base, resources, rates, recentAttacks, setBase, setLoading, setError } = useBaseStore();

  const load = useCallback(async () => {
    if (!activeBaseId) return;
    setLoading(true);
    try {
      const data = await api.get(`/base/${activeBaseId}`);
      setBase(data);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBaseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!base) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading base…</div>
      </div>
    );
  }

  const siloBuilding = base.buildings?.find((b) => b.type === 'SILO');
  const cap = siloCapacity(siloBuilding?.level ?? 0);

  const resourceList = [
    { type: 'OXYGEN',  value: resources?.oxygen  ?? 0, rate: rates?.OXYGEN  ?? 0 },
    { type: 'WATER',   value: resources?.water   ?? 0, rate: rates?.WATER   ?? 0 },
    { type: 'IRON',    value: resources?.iron    ?? 0, rate: rates?.IRON    ?? 0 },
    { type: 'HELIUM3', value: resources?.helium3 ?? 0, rate: rates?.HELIUM3 ?? 0 },
  ];

  const buildings = base.buildings ?? [];

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-space-800/95 backdrop-blur border-b border-space-600/50 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{base.name}</div>
          <div className="text-xs text-slate-500">Commander {user?.username}</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="text-slate-400 hover:text-white transition-colors text-lg"
            title="Refresh"
          >
            🔄
          </button>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Resources */}
        <section>
          <p className="section-title">Resources</p>
          <div className="grid grid-cols-4 gap-2">
            {resourceList.map(({ type, value, rate }) => (
              <ResourceGauge
                key={type}
                type={type}
                value={value}
                max={cap}
                rate={rate}
                onClick={() => navigate(`/base/resource/${type.toLowerCase()}`)}
              />
            ))}
          </div>
        </section>

        {/* Buildings */}
        <section>
          <p className="section-title">Structures</p>
          <div className="grid grid-cols-4 gap-2">
            {buildings.map((building) => (
              <BuildingCard
                key={building.id}
                building={building}
                onClick={() => navigate(`/base/building/${building.type.toLowerCase()}`)}
              />
            ))}
          </div>
        </section>

        {/* Active Events */}
        <section>
          <ActiveEvents base={base} />
        </section>

        {/* Battle Reports */}
        <section>
          <BattleReports attacks={recentAttacks} baseId={base.id} />
        </section>
      </div>
    </div>
  );
}
