// Inline SVG building icons — styled to match UnitIcon.jsx pattern
// Each building gets a unique color and custom SVG silhouette

import { Home, Shield, FlaskConical, Satellite, Swords, Wrench, Users, Package } from 'lucide-react';

const BUILDING_ICONS = {
  SILO:              { Icon: Home,          color: 'text-amber-400' },
  BUNKER:            { Icon: Shield,        color: 'text-sky-400' },
  RESEARCH_LAB:      { Icon: FlaskConical,  color: 'text-violet-400' },
  RADAR:             { Icon: Satellite,     color: 'text-emerald-400' },
  WAR_ROOM:          { Icon: Swords,        color: 'text-red-400' },
  CONSTRUCTION_YARD: { Icon: Wrench,        color: 'text-orange-400' },
  ALLIANCE:          { Icon: Users,         color: 'text-blue-400' },
  TRADE_POD:         { Icon: Package,       color: 'text-teal-400' },
};

export default function BuildingIcon({ type, size = 20, className = '' }) {
  const entry = BUILDING_ICONS[type];
  if (!entry) return <span className={className}>🏢</span>;

  const { Icon, color } = entry;
  return <Icon size={size} className={`${color} ${className}`} strokeWidth={1.8} />;
}

export { BUILDING_ICONS };
