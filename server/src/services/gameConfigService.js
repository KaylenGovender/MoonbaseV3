/**
 * Dynamic game configuration service.
 * Loads base config from DB (ServerConfig key "game_config") and falls back to hardcoded defaults.
 * All values are kept in-memory for sync access everywhere.
 */
import { prisma } from '../prisma/client.js';

// ─── Default base values ──────────────────────────────────────────────────────

const DEFAULT_BUILDING_BASES = {
  SILO:              { oxygen: 160, water:  96, iron: 160, helium3: 16, time: 240 },
  BUNKER:            { oxygen:  96, water:  64, iron: 240, helium3: 16, time: 360 },
  RESEARCH_LAB:      { oxygen: 320, water: 160, iron: 320, helium3: 32, time: 480 },
  RADAR:             { oxygen: 256, water: 128, iron: 192, helium3: 16, time: 360 },
  WAR_ROOM:          { oxygen: 192, water: 256, iron: 320, helium3: 64, time: 480 },
  CONSTRUCTION_YARD: { oxygen: 320, water: 192, iron: 480, helium3: 32, time: 720 },
  ALLIANCE:          { oxygen: 160, water: 160, iron: 160, helium3: 32, time: 240 },
  TRADE_POD:         { oxygen: 128, water: 128, iron: 128, helium3: 64, time: 360 },
};

const DEFAULT_MINE_BASES = {
  OXYGEN:  { oxygen:  32, water:  64, iron:  96, helium3: 32, time: 120 },
  WATER:   { oxygen:  64, water:  32, iron:  80, helium3: 32, time: 120 },
  IRON:    { oxygen:  96, water:  64, iron:  64, helium3: 32, time: 120 },
  HELIUM3: { oxygen: 192, water: 128, iron: 160, helium3: 32, time: 240 },
};

const DEFAULT_MINE_RATE_PER_LEVEL = { OXYGEN: 7.5, WATER: 7.5, IRON: 7.5, HELIUM3: 7.5 };

const DEFAULT_UNIT_STATS = {
  MOONBUGGY: { attack:   25, defense:   40, carryCapacity:   30, speed:  80, buildTime:   30, cost: { oxygen: 200, water: 100, iron: 150, helium3: 180 } },
  GUNSHIP:   { attack:  120, defense:   40, carryCapacity:   80, speed: 150, buildTime:  120, cost: { oxygen: 350, water: 300, iron: 230, helium3: 200 } },
  TANK:      { attack:  250, defense:  250, carryCapacity:  120, speed: 120, buildTime:  300, cost: { oxygen: 450, water: 400, iron: 500, helium3: 300 } },
  HARVESTER: { attack:   10, defense:   10, carryCapacity:  300, speed: 250, buildTime:  180, cost: { oxygen: 200, water: 250, iron: 350, helium3: 400 } },
  DRONE:     { attack:   60, defense:   15, carryCapacity:   10, speed: 120, buildTime:   12, cost: { oxygen:  80, water:  60, iron: 100, helium3:  60 } },
  TITAN:     { attack: 3000, defense: 3000, carryCapacity:  800, speed:  60, buildTime: 3600, cost: { oxygen: 10000, water: 8000, iron: 12000, helium3: 8000 } },
};

const DEFAULT_HELIUM_UPKEEP = {
  MOONBUGGY: 0.5, GUNSHIP: 1.0, TANK: 2.0, HARVESTER: 0.5, DRONE: 0.2, TITAN: 30.0,
};

const DEFAULT_SPECIAL = {
  siloBase:          1500,
  siloPerLevel:       500,
  bunkerMaxPct:        40,
  radarBase:           20,
  radarPerLevel:        5,
  tradePodSpeed:      100,
  basePlacementMin:    15,
  basePlacementMax:    35,
};

// ─── In-memory config cache ───────────────────────────────────────────────────

let _config = {
  buildingBases:      JSON.parse(JSON.stringify(DEFAULT_BUILDING_BASES)),
  mineBases:          JSON.parse(JSON.stringify(DEFAULT_MINE_BASES)),
  mineRatePerLevel:   { ...DEFAULT_MINE_RATE_PER_LEVEL },
  unitStats:          JSON.parse(JSON.stringify(DEFAULT_UNIT_STATS)),
  heliumUpkeep:       { ...DEFAULT_HELIUM_UPKEEP },
  special:            { ...DEFAULT_SPECIAL },
};

export async function initGameConfig() {
  try {
    const row = await prisma.serverConfig.findUnique({ where: { key: 'game_config' } });
    if (row) {
      const saved = JSON.parse(row.value);
      // Deep-merge: only override sections that are present in DB
      for (const section of Object.keys(saved)) {
        if (_config[section] !== undefined) {
          deepMergeSection(section, saved[section]);
        }
      }
      console.log('[gameConfig] Loaded config overrides from DB');

      // v3.0.4 migration: force-update unit stats & helium upkeep to new balance
      if (_config.unitStats.TITAN?.attack === 5000 || _config.unitStats.DRONE?.attack === 100) {
        _config.unitStats   = JSON.parse(JSON.stringify(DEFAULT_UNIT_STATS));
        _config.heliumUpkeep = { ...DEFAULT_HELIUM_UPKEEP };
        await prisma.serverConfig.upsert({
          where:  { key: 'game_config' },
          update: { value: JSON.stringify(_config) },
          create: { key: 'game_config', value: JSON.stringify(_config) },
        });
        console.log('[gameConfig] Migrated unit stats to v3.0.4 balance');
      }
    }
  } catch (e) {
    console.error('[gameConfig] Failed to load config from DB, using defaults:', e.message);
  }
}

export function getGameConfig() { return _config; }

// Nested sections that need deep merge (each sub-key is a type with its own properties)
const NESTED_SECTIONS = new Set(['unitStats', 'buildingBases', 'mineBases', 'heliumUpkeep']);

function deepMergeSection(section, data) {
  if (NESTED_SECTIONS.has(section)) {
    for (const key of Object.keys(data)) {
      if (typeof data[key] === 'object' && data[key] !== null) {
        _config[section][key] = { ...(_config[section][key] ?? {}), ...data[key] };
        // unitStats has a nested cost object
        if (section === 'unitStats' && data[key].cost) {
          _config[section][key].cost = { ...(_config[section][key]?.cost ?? {}), ...data[key].cost };
        }
      } else {
        _config[section][key] = data[key];
      }
    }
  } else {
    _config[section] = { ..._config[section], ...data };
  }
}

export async function updateGameConfigSection(section, data) {
  if (!(section in _config)) throw new Error(`Unknown config section: ${section}`);
  deepMergeSection(section, data);
  await prisma.serverConfig.upsert({
    where:  { key: 'game_config' },
    update: { value: JSON.stringify(_config) },
    create: { key: 'game_config', value: JSON.stringify(_config) },
  });
}

export async function resetGameConfig() {
  _config = {
    buildingBases:    JSON.parse(JSON.stringify(DEFAULT_BUILDING_BASES)),
    mineBases:        JSON.parse(JSON.stringify(DEFAULT_MINE_BASES)),
    mineRatePerLevel: { ...DEFAULT_MINE_RATE_PER_LEVEL },
    unitStats:        JSON.parse(JSON.stringify(DEFAULT_UNIT_STATS)),
    heliumUpkeep:     { ...DEFAULT_HELIUM_UPKEEP },
    special:          { ...DEFAULT_SPECIAL },
  };
  await prisma.serverConfig.deleteMany({ where: { key: 'game_config' } });
}

// ─── Level-config generators (same formulas as original gameConfig.js) ────────

function buildingLevels(bases) {
  return Array.from({ length: 20 }, (_, i) => {
    const m = Math.pow(1.6, i);
    return {
      oxygen:      Math.round(bases.oxygen  * m),
      water:       Math.round(bases.water   * m),
      iron:        Math.round(bases.iron    * m),
      helium3:     Math.round(bases.helium3 * m),
      timeSeconds: Math.round(bases.time    * Math.pow(1.35, i)),
    };
  });
}

function mineLevels(bases) {
  return Array.from({ length: 20 }, (_, i) => {
    const m = Math.pow(1.5, i);
    return {
      oxygen:      Math.round(bases.oxygen  * m),
      water:       Math.round(bases.water   * m),
      iron:        Math.round(bases.iron    * m),
      helium3:     Math.round(bases.helium3 * m),
      timeSeconds: Math.round(bases.time    * Math.pow(1.5, i)),
    };
  });
}

// ─── Exported accessor functions ──────────────────────────────────────────────

export function getBuildingLevelConfig(type) {
  return buildingLevels(_config.buildingBases[type] ?? DEFAULT_BUILDING_BASES[type]);
}

export function getMineLevelConfig(type) {
  return mineLevels(_config.mineBases[type] ?? DEFAULT_MINE_BASES[type]);
}

export function getSiloCapacity(level) {
  return _config.special.siloBase + level * _config.special.siloPerLevel;
}

export function getBunkerProtection(level) {
  return Math.min(level * 2, _config.special.bunkerMaxPct);
}

export function getRadarRange(level) {
  return _config.special.radarBase + level * _config.special.radarPerLevel;
}

export function getMineRate(resourceType, level) {
  if (level === 0) return 0;
  return (_config.mineRatePerLevel[resourceType] ?? 7.5) * level;
}

export function getTradePodSpeed() { return _config.special.tradePodSpeed; }

export function getUnitStatsMap()  { return _config.unitStats; }

export function getHeliumUpkeepMap() { return _config.heliumUpkeep; }

export function getBasePlacement() {
  return { minKm: _config.special.basePlacementMin, maxKm: _config.special.basePlacementMax };
}

export function constructionYardReduction(level) {
  return Math.min(level * 1.5, 30);
}

export { getRadarRange as radarRange };
