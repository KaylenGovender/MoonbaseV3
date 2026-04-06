// Inline SVG resource icons — styled to match UnitIcon.jsx pattern
// Each resource gets a unique color and lucide icon

import { Wind, Droplets, Cog, Atom } from 'lucide-react';

const RESOURCE_ICONS = {
  OXYGEN:  { Icon: Wind,     color: 'text-sky-400',    label: 'O₂' },
  WATER:   { Icon: Droplets, color: 'text-blue-400',   label: 'H₂O' },
  IRON:    { Icon: Cog,      color: 'text-orange-400', label: 'Fe' },
  HELIUM3: { Icon: Atom,     color: 'text-red-400',    label: 'He3' },
};

export default function ResourceIcon({ type, size = 16, className = '' }) {
  const entry = RESOURCE_ICONS[type];
  if (!entry) return null;

  const { Icon, color } = entry;
  return <Icon size={size} className={`${color} ${className}`} strokeWidth={1.8} />;
}

export { RESOURCE_ICONS };
