// Client-side game constants (mirrored from server config)

export const APP_VERSION = 'v3.0.4';

export function siloCapacity(level) {
  return 1500 + level * 500;
}

// Max 40% protection at level 20
export function bunkerProtection(level) {
  return Math.min(level * 2, 40);
}

// Starts at 25km at level 1
export function radarRange(level) {
  return 20 + level * 5;
}

export function constructionYardReduction(level) {
  return Math.min(level * 1.5, 30);
}

// Flat mine rate per level per mine
export const MINE_RATE_PER_LEVEL = {
  OXYGEN:  7.5,
  WATER:   7.5,
  IRON:    7.5,
  HELIUM3: 7.5,
};

export function mineRate(resourceType, level) {
  if (level === 0) return 0;
  return MINE_RATE_PER_LEVEL[resourceType] * level;
}

export const BUILDING_META = {
  SILO:              { icon: '🛢️', label: 'Silo',              desc: 'Increases resource storage',        maxLevel: 20 },
  BUNKER:            { icon: '🛡️', label: 'Bunker',            desc: 'Protects resources from raids',     maxLevel: 20 },
  RESEARCH_LAB:      { icon: '🔬', label: 'Research Lab',      desc: 'Unlocks extra base at level 20',    maxLevel: 20 },
  RADAR:             { icon: '📡', label: 'Radar',             desc: 'Increases map visibility range',    maxLevel: 20 },
  WAR_ROOM:          { icon: '⚔️', label: 'War Room',          desc: 'Train military units',              maxLevel: 20 },
  CONSTRUCTION_YARD: { icon: '🔧', label: 'Construction Yard', desc: 'Reduces build times (-1.5%/level)', maxLevel: 20 },
  ALLIANCE:          { icon: '🤝', label: 'Alliance',          desc: 'Determines max alliance size',      maxLevel: 20 },
  TRADE_POD:         { icon: '📦', label: 'Trade Pod',         desc: 'Send resources to allies',          maxLevel: 20 },
};

export const RESOURCE_META = {
  OXYGEN:  { label: 'Oxygen',   color: '#7dd3fc', icon: 'O₂', mineSlots: 4 },
  WATER:   { label: 'Water',    color: '#3b82f6', icon: 'H₂O',mineSlots: 4 },
  IRON:    { label: 'Iron',     color: '#fb923c', icon: 'Fe', mineSlots: 4 },
  HELIUM3: { label: 'Helium-3', color: '#ef4444', icon: 'He3',mineSlots: 6 },
};

export const UNIT_META = {
  MOONBUGGY: { icon: '🏎️', label: 'Moonbuggy', attack: 25,   defense: 40,   speed: 80,  carry: 30,   buildTime: 30,   cost: { oxygen: 200, water: 100, iron: 150,  helium3: 180 } },
  GUNSHIP:   { icon: '🚀', label: 'Gunship',   attack: 120,  defense: 40,   speed: 150, carry: 80,   buildTime: 120,  cost: { oxygen: 350, water: 300, iron: 230,  helium3: 200 } },
  TANK:      { icon: '🦾', label: 'Tank',      attack: 250,  defense: 250,  speed: 120, carry: 120,  buildTime: 300,  cost: { oxygen: 450, water: 400, iron: 500,  helium3: 300 } },
  HARVESTER: { icon: '🚜', label: 'Harvester', attack: 10,   defense: 10,   speed: 250, carry: 300,  buildTime: 180,  cost: { oxygen: 200, water: 250, iron: 350,  helium3: 400 } },
  DRONE:     { icon: '🛸', label: 'Drone',     attack: 60,   defense: 15,   speed: 120, carry: 10,   buildTime: 12,   cost: { oxygen: 80,   water: 60,  iron: 100,  helium3: 60 } },
  TITAN:     { icon: '👾', label: 'Titan',     attack: 3000, defense: 3000, speed: 60,  carry: 800,  buildTime: 3600, cost: { oxygen: 10000,water: 8000,iron: 12000,helium3: 8000 } },
};

export const HELIUM_UPKEEP = {
  MOONBUGGY: 0.5,
  GUNSHIP:   1.0,
  TANK:      2.0,
  HARVESTER: 0.5,
  DRONE:     0.2,
  TITAN:     30.0,
};
