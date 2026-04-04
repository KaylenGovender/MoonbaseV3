// Inline SVG unit icons — monochrome silhouettes for each unit type
// Rendered as small <svg> elements, color controlled via className

const svgBase = (paths, vb = '0 0 24 24') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="currentColor">${paths}</svg>`;

// Moonbuggy — wheeled rover with antenna
const MOONBUGGY_SVG = svgBase(
  '<circle cx="7" cy="19" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<circle cx="17" cy="19" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<path d="M4.5 17h15l-1-4H6.5l-2 4z"/>' +
  '<path d="M8 13V9h8v4"/>' +
  '<line x1="12" y1="9" x2="12" y2="5" stroke="currentColor" stroke-width="1.2"/>' +
  '<circle cx="12" cy="4" r="1.2"/>'
);

// Gunship — attack spacecraft with wings
const GUNSHIP_SVG = svgBase(
  '<path d="M12 2L8 10h-4l-2 4h6l-1 6h6l-1-6h6l-2-4h-4L12 2z"/>' +
  '<path d="M10 20l2 2 2-2"/>'
);

// Tank — tracked vehicle with turret and barrel
const TANK_SVG = svgBase(
  '<rect x="3" y="14" rx="2" width="18" height="6" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<circle cx="6" cy="17" r="1.5"/><circle cx="12" cy="17" r="1.5"/><circle cx="18" cy="17" r="1.5"/>' +
  '<rect x="7" y="10" rx="1" width="10" height="5"/>' +
  '<rect x="16" y="11.5" width="6" height="2" rx="0.5"/>'
);

// Harvester — cargo hauler with scoop
const HARVESTER_SVG = svgBase(
  '<rect x="5" y="10" rx="1" width="14" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<path d="M5 14h14"/>' +
  '<circle cx="7" cy="20" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<circle cx="17" cy="20" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M3 14l-1 4h2z"/>' +
  '<rect x="8" y="6" width="8" height="4" rx="1"/>'
);

// Drone — small quadcopter
const DRONE_SVG = svgBase(
  '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<line x1="9.5" y1="9.5" x2="5" y2="5" stroke="currentColor" stroke-width="1.2"/>' +
  '<line x1="14.5" y1="9.5" x2="19" y2="5" stroke="currentColor" stroke-width="1.2"/>' +
  '<line x1="9.5" y1="14.5" x2="5" y2="19" stroke="currentColor" stroke-width="1.2"/>' +
  '<line x1="14.5" y1="14.5" x2="19" y2="19" stroke="currentColor" stroke-width="1.2"/>' +
  '<circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1"/>' +
  '<circle cx="19" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1"/>' +
  '<circle cx="5" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1"/>' +
  '<circle cx="19" cy="19" r="2" fill="none" stroke="currentColor" stroke-width="1"/>'
);

// Titan — large mech walker
const TITAN_SVG = svgBase(
  '<path d="M10 4h4v3h-4z"/>' +
  '<path d="M8 7h8v6H8z"/>' +
  '<path d="M6 9h-3v2h3"/><path d="M18 9h3v2h-3"/>' +
  '<path d="M9 13l-2 9h2l1-4"/><path d="M15 13l2 9h-2l-1-4"/>' +
  '<circle cx="10" cy="9.5" r="0.8"/><circle cx="14" cy="9.5" r="0.8"/>' +
  '<rect x="9" y="11" width="6" height="1.5" rx="0.5" opacity="0.5"/>'
);

function makeSvgDataUri(svgStr) {
  return `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
}

export const UNIT_SVGS = {
  MOONBUGGY: makeSvgDataUri(MOONBUGGY_SVG),
  GUNSHIP:   makeSvgDataUri(GUNSHIP_SVG),
  TANK:      makeSvgDataUri(TANK_SVG),
  HARVESTER: makeSvgDataUri(HARVESTER_SVG),
  DRONE:     makeSvgDataUri(DRONE_SVG),
  TITAN:     makeSvgDataUri(TITAN_SVG),
};

export default function UnitIcon({ type, size = 24, className = 'text-white' }) {
  const src = UNIT_SVGS[type];
  if (!src) return <span className={className}>⚔️</span>;
  return (
    <img
      src={src}
      alt={type}
      width={size}
      height={size}
      className={`inline-block ${className}`}
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}
