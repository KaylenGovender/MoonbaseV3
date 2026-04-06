// Inline SVG unit icons — colored silhouettes for each unit type
// Rendered as inline <svg> elements, color controlled via className (currentColor)

import { Swords } from 'lucide-react';

const UNIT_COLORS = {
  MOONBUGGY: 'text-cyan-400',
  GUNSHIP:   'text-red-400',
  TANK:      'text-green-400',
  HARVESTER: 'text-amber-400',
  DRONE:     'text-violet-400',
  TITAN:     'text-rose-500',
};

// Moonbuggy — wheeled rover with antenna
function MoonbuggySvg(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="7" cy="19" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="17" cy="19" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 17h15l-1-4H6.5l-2 4z"/>
      <path d="M8 13V9h8v4"/>
      <line x1="12" y1="9" x2="12" y2="5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="12" cy="4" r="1.2"/>
    </svg>
  );
}

// Gunship — attack spacecraft with wings
function GunshipSvg(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L8 10h-4l-2 4h6l-1 6h6l-1-6h6l-2-4h-4L12 2z"/>
      <path d="M10 20l2 2 2-2"/>
    </svg>
  );
}

// Tank — tracked vehicle with turret and barrel
function TankSvg(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="14" rx="2" width="18" height="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="6" cy="17" r="1.5"/><circle cx="12" cy="17" r="1.5"/><circle cx="18" cy="17" r="1.5"/>
      <rect x="7" y="10" rx="1" width="10" height="5"/>
      <rect x="16" y="11.5" width="6" height="2" rx="0.5"/>
    </svg>
  );
}

// Harvester — cargo hauler with scoop
function HarvesterSvg(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="10" rx="1" width="14" height="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 14h14"/>
      <circle cx="7" cy="20" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="17" cy="20" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3 14l-1 4h2z"/>
      <rect x="8" y="6" width="8" height="4" rx="1"/>
    </svg>
  );
}

// Drone — small quadcopter
function DroneSvg(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="9.5" y1="9.5" x2="5" y2="5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="14.5" y1="9.5" x2="19" y2="5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="9.5" y1="14.5" x2="5" y2="19" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="14.5" y1="14.5" x2="19" y2="19" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1"/>
      <circle cx="19" cy="5" r="2" fill="none" stroke="currentColor" strokeWidth="1"/>
      <circle cx="5" cy="19" r="2" fill="none" stroke="currentColor" strokeWidth="1"/>
      <circle cx="19" cy="19" r="2" fill="none" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

// Titan — large mech walker
function TitanSvg(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4h4v3h-4z"/>
      <path d="M8 7h8v6H8z"/>
      <path d="M6 9h-3v2h3"/><path d="M18 9h3v2h-3"/>
      <path d="M9 13l-2 9h2l1-4"/><path d="M15 13l2 9h-2l-1-4"/>
      <circle cx="10" cy="9.5" r="0.8"/><circle cx="14" cy="9.5" r="0.8"/>
      <rect x="9" y="11" width="6" height="1.5" rx="0.5" opacity="0.5"/>
    </svg>
  );
}

const UNIT_COMPONENTS = {
  MOONBUGGY: MoonbuggySvg,
  GUNSHIP:   GunshipSvg,
  TANK:      TankSvg,
  HARVESTER: HarvesterSvg,
  DRONE:     DroneSvg,
  TITAN:     TitanSvg,
};

export default function UnitIcon({ type, size = 24, className }) {
  const SvgComponent = UNIT_COMPONENTS[type];
  if (!SvgComponent) return <Swords size={size} className={className || 'text-white'} strokeWidth={1.8} />;
  const colorClass = className || UNIT_COLORS[type] || 'text-white';
  return (
    <SvgComponent
      width={size}
      height={size}
      className={`inline-block ${colorClass}`}
    />
  );
}
