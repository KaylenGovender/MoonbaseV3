// Game configuration constants — single source of truth for all game mechanics

// ─── Building costs per level [level 1 .. 20] ────────────────────────────────
// Each entry: { oxygen, water, iron, helium3, timeSeconds }
// ALL buildings require all 4 resources
function buildingLevelConfig(baseO2, baseWater, baseIron, baseHe3, baseTime) {
  return Array.from({ length: 20 }, (_, i) => {
    const m = Math.pow(1.6, i);
    return {
      oxygen:      Math.round(baseO2    * m),
      water:       Math.round(baseWater * m),
      iron:        Math.round(baseIron  * m),
      helium3:     Math.round(baseHe3   * m),
      timeSeconds: Math.round(baseTime  * Math.pow(1.8, i)),
    };
  });
}

export const BUILDING_CONFIG = {
  SILO:             buildingLevelConfig(160,   96,  160, 16,  240),
  BUNKER:           buildingLevelConfig( 96,   64,  240, 16,  360),
  RESEARCH_LAB:     buildingLevelConfig(320,  160,  320, 32,  480),
  RADAR:            buildingLevelConfig(256,  128,  192, 16,  360),
  WAR_ROOM:         buildingLevelConfig(192,  256,  320, 64,  480),
  CONSTRUCTION_YARD:buildingLevelConfig(320,  192,  480, 32,  720),
  ALLIANCE:         buildingLevelConfig(160,  160,  160, 32,  240),
  TRADE_POD:        buildingLevelConfig(128,  128,  128, 64,  360),
};

// Silo: max resources stored per level (level 0 base = 1500, +500/level)
export function siloCapacity(level) {
  return 1500 + level * 500;
}

// Bunker: % of resources protected from looting — max 40% at level 20
export function bunkerProtection(level) {
  return Math.min(level * 2, 40);
}

// Radar: visibility radius in km — starts at 25km at level 1
export function radarRange(level) {
  return 20 + level * 5;
}

// Construction Yard: % time reduction (level * 1, max 20)
export function constructionYardReduction(level) {
  return Math.min(level * 1, 20);
}

// Research Lab L20 unlocks additional base
export const RESEARCH_LAB_EXTRA_BASE_LEVEL = 20;

// ─── Mine configuration ───────────────────────────────────────────────────────
// Slots per resource type
export const MINE_SLOTS = {
  OXYGEN:  4,
  WATER:   4,
  IRON:    4,
  HELIUM3: 6,
};

// Flat production rate per mine per level per minute
// Formula: total_rate = MINE_RATE_PER_LEVEL[type] * level * numMines
// All resource types scale identically — each upgrade adds this fixed amount
export const MINE_RATE_PER_LEVEL = {
  OXYGEN:  7.5,
  WATER:   7.5,
  IRON:    7.5,
  HELIUM3: 7.5,
};

// Mine generation rate in units/min for a given level (flat per level)
export function mineRate(resourceType, level) {
  if (level === 0) return 0;
  return MINE_RATE_PER_LEVEL[resourceType] * level;
}

// Mine upgrade cost per level [level 1 .. 20]
// ALL mines require all 4 resources.
// The resource a mine produces costs ~50% less for that mine (self-resource discount).
function mineLevelConfig(baseO2, baseWater, baseIron, baseHe3, baseTime) {
  return Array.from({ length: 20 }, (_, i) => {
    const m = Math.pow(1.5, i);
    return {
      oxygen:      Math.round(baseO2    * m),
      water:       Math.round(baseWater * m),
      iron:        Math.round(baseIron  * m),
      helium3:     Math.round(baseHe3   * m),
      timeSeconds: Math.round(baseTime  * Math.pow(1.5, i)),
    };
  });
}

export const MINE_CONFIG = {
  OXYGEN:  mineLevelConfig( 32,  64,  96, 32, 120),
  WATER:   mineLevelConfig( 64,  32,  80, 32, 120),
  IRON:    mineLevelConfig( 96,  64,  64, 32, 120),
  HELIUM3: mineLevelConfig(192, 128, 160, 32, 240),
};

// ─── Helium upkeep per unit per minute ────────────────────────────────────────
// Units consume helium passively. Net helium = production - total upkeep.
// If net < 0: stored helium drains; if stored = 0: units begin dying.
export const HELIUM_UPKEEP = {
  MOONBUGGY: 0.5,
  GUNSHIP:   1.0,
  TANK:      2.0,
  HARVESTER: 0.5,
  DRONE:     0.5,
  TITAN:     50.0,
};

// ─── Unit stats ───────────────────────────────────────────────────────────────
export const UNIT_STATS = {
  MOONBUGGY: {
    attack:        25,
    defense:       40,
    carryCapacity: 30,
    speed:         80,   // km/h
    buildTime:     30,   // seconds per unit
    cost: { oxygen: 200, water: 100, iron: 150, helium3: 180 },
  },
  GUNSHIP: {
    attack:        120,
    defense:       40,
    carryCapacity: 80,
    speed:         150,
    buildTime:     120,
    cost: { oxygen: 350, water: 300, iron: 230, helium3: 200 },
  },
  TANK: {
    attack:        250,
    defense:       250,
    carryCapacity: 120,
    speed:         120,
    buildTime:     300,
    cost: { oxygen: 450, water: 400, iron: 500, helium3: 300 },
  },
  HARVESTER: {
    attack:        10,
    defense:       10,
    carryCapacity: 300,
    speed:         250,
    buildTime:     180,
    cost: { oxygen: 200, water: 250, iron: 350, helium3: 400 },
  },
  DRONE: {
    attack:        100,
    defense:       30,
    carryCapacity: 20,
    speed:         100,
    buildTime:     20,
    cost: { oxygen: 300, water: 250, iron: 220, helium3: 230 },
  },
  TITAN: {
    attack:        5000,
    defense:       5000,
    carryCapacity: 1000,
    speed:         60,
    buildTime:     3600,
    cost: { oxygen: 6000, water: 5000, iron: 7000, helium3: 4000 },
  },
};

export const ALL_UNIT_TYPES = Object.keys(UNIT_STATS);
export const ALL_BUILDING_TYPES = Object.keys(BUILDING_CONFIG);
export const ALL_RESOURCE_TYPES = ['OXYGEN', 'WATER', 'IRON', 'HELIUM3'];

// Trade pod fixed speed
export const TRADE_POD_SPEED = 100; // km/h

// Map bounds
export const MAP_BOUNDS = { min: -100, max: 100 }; // km (200x200 grid)

// New base placement: random distance from nearest existing base
export const BASE_PLACEMENT = { minKm: 15, maxKm: 35 };
