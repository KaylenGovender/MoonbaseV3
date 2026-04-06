import { useEffect, useState } from 'react';
import { formatCountdown, formatEta } from '../utils/format.js';
import { BUILDING_META, UNIT_META } from '../utils/gameConstants.js';
import { useAuthStore } from '../store/authStore.js';
import UnitIcon from './UnitIcon.jsx';
import BuildingIcon from './BuildingIcon.jsx';
import { Swords, Hammer, Pickaxe, Wrench, AlertTriangle, ChevronUp, ChevronDown, ArrowDownLeft, Package } from 'lucide-react';

const CATEGORIES = [
  { key: 'incomingAttacks',    label: 'Incoming Attacks',   Icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800/40' },
  { key: 'outgoingAttacks',    label: 'Outgoing Attacks',   Icon: Swords,        color: 'text-green-400',  bg: 'bg-green-900/20 border-green-800/40' },
  { key: 'upgradingBuildings', label: 'Building Upgrades',  Icon: Hammer,        color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-800/40' },
  { key: 'upgradingMines',     label: 'Mine Upgrades',      Icon: Pickaxe,       color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800/40' },
  { key: 'buildQueues',        label: 'Unit Build Queue',   Icon: Wrench,        color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-800/40' },
  { key: 'tradePodsOut',       label: 'Trade Pods',         Icon: Package,       color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-800/40' },
  { key: 'tradePodsIn',        label: 'Incoming Resources', Icon: ArrowDownLeft, color: 'text-teal-400',   bg: 'bg-teal-900/20 border-teal-800/40' },
];

export default function ActiveEvents({ base }) {
  const [, tick] = useState(0);
  const [expanded, setExpanded] = useState({});
  const gameConfig = useAuthStore((s) => s.gameConfig);
  const unitSpeedMap = gameConfig?.unitStats ?? {};
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!base) return null;

  const toggleCategory = (cat) => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const incomingAttacks = base.attacksReceived ?? [];
  const outgoingAttacks = base.attacksLaunched ?? [];
  const rawBuildQueues  = base.buildQueues ?? [];

  // Filter out jobs that have already completed (2s buffer for server processing delay)
  const pendingJobs = rawBuildQueues.filter(j => new Date(j.completesAt).getTime() > Date.now() - 2000);

  const groupedBuildQueues = Object.values(
    pendingJobs.reduce((acc, job) => {
      if (!acc[job.unitType]) {
        acc[job.unitType] = { ...job, _remaining: 0, _latestCompletes: job.completesAt };
      }
      acc[job.unitType]._remaining += job.quantity ?? 1;
      if (!acc[job.unitType].completesAt || job.completesAt < acc[job.unitType].completesAt) {
        acc[job.unitType].completesAt = job.completesAt;
      }
      if (job.completesAt > acc[job.unitType]._latestCompletes) {
        acc[job.unitType]._latestCompletes = job.completesAt;
      }
      return acc;
    }, {})
  );
  const tradePodsOut    = base.tradePodsOut ?? [];
  const tradePodsIn     = base.tradePodsIn ?? [];

  const upgradingMines = (base.mines ?? []).filter((m) => m.upgradeEndsAt);
  const upgradingBuildings = (base.buildings ?? []).filter((b) => b.upgradeEndsAt);

  const RESOURCE_NAMES = { OXYGEN: 'Oxygen', WATER: 'Water', IRON: 'Iron', HELIUM3: 'Helium-3' };

  // Build category data with their rendered items
  const categoryItems = {
    incomingAttacks: incomingAttacks.map((attack) => (
      <EventRow
        key={attack.id}
        icon={<AlertTriangle size={14} className="text-red-400" />}
        color="text-red-400"
        bg="bg-red-900/20 border-red-800/40"
        label={`Incoming attack from ${attack.attackerBase?.name ?? 'Unknown'}`}
        time={formatEta(attack.arrivalTime)}
      />
    )),
    outgoingAttacks: outgoingAttacks.map((attack) => {
      const activeTypes = Object.entries(attack.units ?? {}).filter(([, n]) => n > 0).map(([t]) => t);
      const slowest = activeTypes.length > 0
        ? Math.min(...activeTypes.map((t) => unitSpeedMap[t]?.speed ?? 999))
        : null;
      return (
        <EventRow
          key={attack.id}
          icon={attack.status === 'RETURNING' ? <ArrowDownLeft size={14} /> : <Swords size={14} />}
          color="text-green-400"
          bg="bg-green-900/20 border-green-800/40"
          label={
            attack.status === 'RETURNING'
              ? `Returning from ${attack.defenderBase?.name ?? 'Unknown'}`
              : `Attacking ${attack.defenderBase?.name ?? 'Unknown'}`
          }
          time={formatEta(attack.status === 'RETURNING' ? attack.returnTime : attack.arrivalTime)}
          subtitle={slowest ? `Fleet speed: ${slowest} km/h` : null}
        />
      );
    }),
    upgradingBuildings: upgradingBuildings.map((b) => {
      const bMeta = BUILDING_META[b.type];
      return (
        <EventRow
          key={b.id}
          icon={<BuildingIcon type={b.type} size={14} />}
          color="text-purple-400"
          bg="bg-purple-900/20 border-purple-800/40"
          label={`${bMeta?.label ?? formatBuildingName(b.type)} upgrading → L${b.level}`}
          time={formatCountdown(b.upgradeEndsAt)}
        />
      );
    }),
    upgradingMines: upgradingMines.map((m) => (
      <EventRow
        key={m.id}
        icon={<Pickaxe size={14} />}
        color="text-yellow-400"
        bg="bg-yellow-900/20 border-yellow-800/40"
        label={`${RESOURCE_NAMES[m.resourceType] ?? m.resourceType} Mine #${m.slot} upgrading → L${m.level}`}
        time={formatCountdown(m.upgradeEndsAt)}
      />
    )),
    buildQueues: groupedBuildQueues.map((job, idx) => {
      const uMeta = UNIT_META[job.unitType];
      const countLabel = `${job._remaining}× ${uMeta?.label ?? formatUnitName(job.unitType)} remaining`;
      const allDoneTime = job._latestCompletes ?? job.completesAt;
      return (
        <EventRow
          key={`${job.unitType}-${idx}`}
          icon={<UnitIcon type={job.unitType} size={18} />}
          color="text-blue-400"
          bg="bg-blue-900/20 border-blue-800/40"
          label={countLabel}
          time={formatCountdown(allDoneTime)}
        />
      );
    }),
    tradePodsOut: tradePodsOut.map((pod) => (
      <EventRow
        key={pod.id}
        icon={<Package size={14} />}
        color="text-purple-400"
        bg="bg-purple-900/20 border-purple-800/40"
        label={`Trade pod → ${pod.toBase?.name ?? 'Unknown'}`}
        time={formatEta(pod.arrivalTime)}
      />
    )),
    tradePodsIn: tradePodsIn.map((pod) => (
      <EventRow
        key={pod.id}
        icon={<ArrowDownLeft size={14} />}
        color="text-teal-400"
        bg="bg-teal-900/20 border-teal-800/40"
        label={`Incoming resources from ${pod.fromBase?.name ?? 'Unknown'}`}
        time={formatEta(pod.arrivalTime)}
      />
    )),
  };

  const activeCategories = CATEGORIES.filter((cat) => categoryItems[cat.key]?.length > 0);
  if (activeCategories.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="section-title">Active Events</p>

      {activeCategories.map((cat) => {
        const items = categoryItems[cat.key];
        const isExpanded = !!expanded[cat.key];
        return (
          <div key={cat.key}>
            <button
              onClick={() => toggleCategory(cat.key)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-space-700/50 border border-space-600/30"
            >
              <div className="flex items-center gap-2">
                <span><cat.Icon size={14} className={cat.color} /></span>
                <span className="text-xs text-slate-300">{cat.label}</span>
                <span className="text-[10px] bg-space-600 text-slate-400 px-1.5 rounded-full">{items.length}</span>
              </div>
              <span className="text-slate-500 text-xs">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
            </button>
            {isExpanded && (
              <div className="mt-1 space-y-1">
                {items}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ icon, color, bg, label, time, subtitle }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${bg}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <span className="text-slate-300 text-xs">{label}</span>
          {subtitle && <div className="text-[10px] text-slate-500">{subtitle}</div>}
        </div>
      </div>
      <span className={`text-xs font-mono font-medium ${color} flex-shrink-0 ml-2`}>{time}</span>
    </div>
  );
}

function formatUnitName(type) {
  return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatBuildingName(type) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
