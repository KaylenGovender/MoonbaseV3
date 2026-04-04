import { useEffect, useState } from 'react';
import { formatCountdown } from '../utils/format.js';
import { BUILDING_META } from '../utils/gameConstants.js';

export default function BuildingCard({ building, onClick }) {
  const meta  = BUILDING_META[building.type] ?? { icon: '🏢', label: building.type, desc: '' };
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!building.upgradeEndsAt) { setCountdown(''); return; }
    const id = setInterval(() => {
      setCountdown(formatCountdown(building.upgradeEndsAt));
    }, 1000);
    setCountdown(formatCountdown(building.upgradeEndsAt));
    return () => clearInterval(id);
  }, [building.upgradeEndsAt]);

  const isUpgrading = !!building.upgradeEndsAt;

  return (
    <button
      onClick={onClick}
      className={`card flex flex-col items-center gap-2 text-center active:scale-95 transition-transform relative overflow-hidden
        ${isUpgrading ? 'border-yellow-600/60' : 'hover:border-blue-500/50'}`}
    >
      {isUpgrading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-yellow-500 animate-pulse" />
      )}
      <span className="text-3xl leading-none mt-1">{meta.icon}</span>
      <div>
        <div className="text-xs font-semibold text-slate-200 leading-tight">{meta.label}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Lv {building.level}</div>
      </div>
      {isUpgrading ? (
        <div className="text-[10px] text-yellow-400 font-medium">⬆ {countdown}</div>
      ) : (
        <div className="text-[10px] text-slate-600">tap to manage</div>
      )}
    </button>
  );
}
