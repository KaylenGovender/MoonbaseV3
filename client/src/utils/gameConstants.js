// Client-side game constants (mirrored from server config)

export function siloCapacity(level) {
  return 1000 + level * 500;
}

export function bunkerProtection(level) {
  return Math.min(level * 5, 100);
}

export function radarRange(level) {
  return 10 + level * 5;
}

export function constructionYardReduction(level) {
  return Math.min(level * 1, 20);
}

export const BUILDING_META = {
  SILO:              { icon: '🏗️', label: 'Silo',             maxLevel: 20 },
  BUNKER:            { icon: '🛡️', label: 'Bunker',           maxLevel: 20 },
  RESEARCH_LAB:      { icon: '🔬', label: 'Research Lab',     maxLevel: 20 },
  RADAR:             { icon: '📡', label: 'Radar',            maxLevel: 20 },
  WAR_ROOM:          { icon: '⚔️', label: 'War Room',         maxLevel: 20 },
  CONSTRUCTION_YARD: { icon: '🔧', label: 'Construction Yard',maxLevel: 20 },
  ALLIANCE:          { icon: '🤝', label: 'Alliance',         maxLevel: 20 },
  TRADE_POD:         { icon: '📦', label: 'Trade Pod',        maxLevel: 20 },
};

export const RESOURCE_META = {
  OXYGEN:  { label: 'Oxygen',   color: '#7dd3fc', icon: 'O₂', mineSlots: 4 },
  WATER:   { label: 'Water',    color: '#3b82f6', icon: 'H₂O',mineSlots: 4 },
  IRON:    { label: 'Iron',     color: '#fb923c', icon: 'Fe', mineSlots: 4 },
  HELIUM3: { label: 'Helium-3', color: '#ef4444', icon: 'He3',mineSlots: 6 },
};

export const UNIT_META = {
  MOONBUGGY: { icon: '🚗', label: 'Moonbuggy' },
  GUNSHIP:   { icon: '🚁', label: 'Gunship'   },
  TANK:      { icon: '🪖', label: 'Tank'      },
  HARVESTER: { icon: '🌾', label: 'Harvester' },
  DRONE:     { icon: '🛸', label: 'Drone'     },
  TITAN:     { icon: '💥', label: 'Titan'     },
};
