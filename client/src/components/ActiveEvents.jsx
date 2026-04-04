import { useEffect, useState } from 'react';
import { formatCountdown, formatEta } from '../utils/format.js';

export default function ActiveEvents({ base }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!base) return null;

  const incomingAttacks = base.attacksReceived ?? [];
  const outgoingAttacks = base.attacksLaunched ?? [];
  const buildQueues     = base.buildQueues ?? [];
  const tradePodsOut    = base.tradePodsOut ?? [];
  const tradePodsIn     = base.tradePodsIn ?? [];

  // Mine upgrades in progress
  const upgradingMines = (base.mines ?? []).filter((m) => m.upgradeEndsAt);
  // Building upgrades in progress
  const upgradingBuildings = (base.buildings ?? []).filter((b) => b.upgradeEndsAt);

  const RESOURCE_NAMES = { OXYGEN: 'Oxygen', WATER: 'Water', IRON: 'Iron', HELIUM3: 'Helium-3' };

  const hasEvents =
    incomingAttacks.length || outgoingAttacks.length ||
    buildQueues.length || tradePodsOut.length || tradePodsIn.length ||
    upgradingMines.length || upgradingBuildings.length;

  if (!hasEvents) return null;

  return (
    <div className="space-y-2">
      <p className="section-title">Active Events</p>

      {incomingAttacks.map((attack) => (
        <EventRow
          key={attack.id}
          icon="🚨"
          color="text-red-400"
          bg="bg-red-900/20 border-red-800/40"
          label={`Incoming attack from ${attack.attackerBase?.name ?? 'Unknown'}`}
          time={formatEta(attack.arrivalTime)}
        />
      ))}

      {outgoingAttacks.map((attack) => (
        <EventRow
          key={attack.id}
          icon={attack.status === 'RETURNING' ? '↩️' : '⚔️'}
          color="text-green-400"
          bg="bg-green-900/20 border-green-800/40"
          label={
            attack.status === 'RETURNING'
              ? `Returning from ${attack.defenderBase?.name ?? 'Unknown'}`
              : `Attacking ${attack.defenderBase?.name ?? 'Unknown'}`
          }
          time={formatEta(attack.status === 'RETURNING' ? attack.returnTime : attack.arrivalTime)}
        />
      ))}

      {upgradingBuildings.map((b) => (
        <EventRow
          key={b.id}
          icon="🏗️"
          color="text-purple-400"
          bg="bg-purple-900/20 border-purple-800/40"
          label={`${formatBuildingName(b.type)} upgrading → L${b.level}`}
          time={formatCountdown(b.upgradeEndsAt)}
        />
      ))}

      {upgradingMines.map((m) => (
        <EventRow
          key={m.id}
          icon="⛏️"
          color="text-yellow-400"
          bg="bg-yellow-900/20 border-yellow-800/40"
          label={`${RESOURCE_NAMES[m.resourceType] ?? m.resourceType} Mine #${m.slot} upgrading → L${m.level}`}
          time={formatCountdown(m.upgradeEndsAt)}
        />
      ))}

      {buildQueues.map((job) => (
        <EventRow
          key={job.id}
          icon="🏭"
          color="text-blue-400"
          bg="bg-blue-900/20 border-blue-800/40"
          label={`Building ${job.quantity}× ${formatUnitName(job.unitType)}`}
          time={formatCountdown(job.completesAt)}
        />
      ))}

      {tradePodsOut.map((pod) => (
        <EventRow
          key={pod.id}
          icon="📦"
          color="text-purple-400"
          bg="bg-purple-900/20 border-purple-800/40"
          label={`Trade pod → ${pod.toBase?.name ?? 'Unknown'}`}
          time={formatEta(pod.arrivalTime)}
        />
      ))}

      {tradePodsIn.map((pod) => (
        <EventRow
          key={pod.id}
          icon="📥"
          color="text-teal-400"
          bg="bg-teal-900/20 border-teal-800/40"
          label={`Incoming resources from ${pod.fromBase?.name ?? 'Unknown'}`}
          time={formatEta(pod.arrivalTime)}
        />
      ))}
    </div>
  );
}

function EventRow({ icon, color, bg, label, time }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${bg}`}>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-slate-300 text-xs">{label}</span>
      </div>
      <span className={`text-xs font-mono font-medium ${color}`}>{time}</span>
    </div>
  );
}

function formatUnitName(type) {
  return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatBuildingName(type) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
