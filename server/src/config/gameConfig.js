// Game configuration constants — single source of truth for all game mechanics

// ─── Building costs per level [level 1 .. 20] ────────────────────────────────
// Each entry: { oxygen, water, iron, helium3, timeSeconds }
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
  SILO:             buildingLevelConfig(50,  30,  100, 0,   60),
  BUNKER:           buildingLevelConfig(30,  20,  150, 0,   90),
  RESEARCH_LAB:     buildingLevelConfig(100, 50,  200, 10,  120),
  RADAR:            buildingLevelConfig(80,  40,  120, 5,   90),
  WAR_ROOM:         buildingLevelConfig(60,  80,  200, 20,  120),
  CONSTRUCTION_YARD:buildingLevelConfig(100, 60,  300, 10,  180),
  ALLIANCE:         buildingLevelConfig(50,  50,  100, 10,  60),
  TRADE_POD:        buildingLevelConfig(40,  40,  80,  20,  90),
};

// Silo: max resources stored per level (level 0 = 1000, +500/level)
export function siloCapacity(level) {
  return 1000 + level * 500;
}

// Bunker: % of resources protected from looting (level * 5, max 100)
export function bunkerProtection(level) {
  return Math.min(level * 5, 100);
}

// Radar: visibility radius in km
export function radarRange(level) {
  return 10 + level * 5;
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

// Base generation rate per mine level per minute
export const MINE_BASE_RATE_PER_MIN = {
  OXYGEN:  2.0,
  WATER:   1.5,
  IRON:    1.0,
  HELIUM3: 0.5,
};

// Mine generation rate in units/min for a given level
export function mineRate(resourceType, level) {
  if (level === 0) return 0;
  return MINE_BASE_RATE_PER_MIN[resourceType] * level;
}

// Mine upgrade cost per level [level 1 .. 20]
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
  OXYGEN:  mineLevelConfig(20, 10, 30, 0,  30),
  WATER:   mineLevelConfig(10, 20, 25, 0,  30),
  IRON:    mineLevelConfig(15, 10, 40, 0,  30),
  HELIUM3: mineLevelConfig(30, 20, 50, 10, 60),
};

// ─── Unit stats ───────────────────────────────────────────────────────────────
export const UNIT_STATS = {
  MOONBUGGY: {
    attack:       5,
    defense:      3,
    carryCapacity:100,
    speed:        80,   // km/h
    buildTime:    30,   // seconds per unit
    cost: { oxygen: 20, water: 10, iron: 30, helium3: 0 },
  },
  GUNSHIP: {
    attack:       15,
    defense:      10,
    carryCapacity:50,
    speed:        120,
    buildTime:    120,
    cost: { oxygen: 10, water: 20, iron: 50, helium3: 10 },
  },
  TANK: {
    attack:       25,
    defense:      40,
    carryCapacity:200,
    speed:        20,
    buildTime:    300,
    cost: { oxygen: 0, water: 10, iron: 100, helium3: 20 },
  },
  HARVESTER: {
    attack:       2,
    defense:      5,
    carryCapacity:1000,
    speed:        40,
    buildTime:    180,
    cost: { oxygen: 10, water: 5, iron: 60, helium3: 0 },
  },
  DRONE: {
    attack:       8,
    defense:      2,
    carryCapacity:30,
    speed:        100,
    buildTime:    20,
    cost: { oxygen: 5, water: 5, iron: 15, helium3: 5 },
  },
  TITAN: {
    attack:       200,
    defense:      150,
    carryCapacity:500,
    speed:        30,
    buildTime:    3600,
    cost: { oxygen: 100, water: 100, iron: 500, helium3: 200 },
    maxPerPlayer: 1,
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
export const BASE_PLACEMENT = { minKm: 5, maxKm: 30 };
