import { useMemo } from 'react';
import { formatNumber, formatRate } from '../utils/format.js';

const RESOURCE_META = {
  OXYGEN:  { label: 'Oxygen',    color: '#7dd3fc', bg: 'bg-sky-500',    border: 'border-sky-500',    text: 'text-sky-300',    trackColor: '#0c4a6e' },
  WATER:   { label: 'Water',     color: '#3b82f6', bg: 'bg-blue-500',   border: 'border-blue-500',   text: 'text-blue-300',   trackColor: '#1e3a8a' },
  IRON:    { label: 'Iron',      color: '#fb923c', bg: 'bg-orange-400', border: 'border-orange-400', text: 'text-orange-300', trackColor: '#7c2d12' },
  HELIUM3: { label: 'Helium-3',  color: '#ef4444', bg: 'bg-red-500',    border: 'border-red-500',    text: 'text-red-300',    trackColor: '#7f1d1d' },
};

const SIZE  = 100;
const CX    = SIZE / 2;
const CY    = SIZE / 2;
const R     = 38;
const CIRC  = 2 * Math.PI * R;

export default function ResourceGauge({ type, value, max, rate, onClick }) {
  const meta = RESOURCE_META[type] ?? RESOURCE_META.OXYGEN;
  const pct  = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = pct * CIRC;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 group focus:outline-none"
      aria-label={`${meta.label}: ${formatNumber(value)} / ${formatNumber(max)}`}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="rotate-[-90deg]">
          {/* Track */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={meta.trackColor}
            strokeWidth="7"
          />
          {/* Fill */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={meta.color}
            strokeWidth="7"
            strokeDasharray={`${dash} ${CIRC}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[11px] font-bold ${meta.text} leading-none`}>
            {formatNumber(value)}
          </span>
          <span className="text-[8px] text-slate-500 mt-0.5">
            /{formatNumber(max)}
          </span>
        </div>
      </div>

      <div className="text-center">
        <div className={`text-[11px] font-semibold ${meta.text}`}>{meta.label}</div>
        <div className={`text-xs font-bold ${meta.text}`}>{formatRate(rate ?? 0)}</div>
      </div>
    </button>
  );
}
