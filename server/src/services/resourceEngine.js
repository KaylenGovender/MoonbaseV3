import { prisma } from '../prisma/client.js';
import { getMineRate, getSiloCapacity, getHeliumUpkeepMap } from '../services/gameConfigService.js';

/** Effective level: during an upgrade the DB already stores the target level, so
 *  we subtract 1 to get the level whose effects are currently active. */
const effectiveLevel = (entity) =>
  entity?.upgradeEndsAt ? entity.level - 1 : entity?.level ?? 0;

// Track last attrition time per base (in-memory, resets on server restart)
const lastAttritionTime = new Map();
const ATTRITION_INTERVAL_MS = 30_000; // kill units every 30s if in deficit

/**
 * Calculate and persist resource generation for a single base.
 * Returns updated ResourceState.
 */
export async function tickResources(base) {
  const state = await prisma.resourceState.findUnique({
    where: { baseId: base.id },
  });
  if (!state) {
    // Auto-repair: create default resourceState for bases that are missing one
    await prisma.resourceState.create({
      data: { baseId: base.id, oxygen: 0, water: 0, iron: 0, helium3: 0 },
    }).catch(() => {}); // ignore if another tick already created it
    return null;
  }

  const mines = await prisma.mine.findMany({ where: { baseId: base.id } });
  const siloBuilding = await prisma.building.findUnique({
    where: { baseId_type: { baseId: base.id, type: 'SILO' } },
  });
  const siloLevel = effectiveLevel(siloBuilding);
  const cap = getSiloCapacity(siloLevel);

  // Calculate rates (units/second)
  const rates = { OXYGEN: 0, WATER: 0, IRON: 0, HELIUM3: 0 };
  for (const mine of mines) {
    rates[mine.resourceType] += getMineRate(mine.resourceType, effectiveLevel(mine)) / 60;
  }

  const now = new Date();
  const elapsedSec = Math.max((now - new Date(state.lastUpdatedAt)) / 1000, 0);

  // Helium upkeep — deduct unit consumption each tick
  const heliumUpkeepPerSec = (await getHeliumUpkeep(base.id)) / 60;

  const newState = {
    oxygen:  Math.min(Math.max(state.oxygen  + rates.OXYGEN  * elapsedSec, 0), cap),
    water:   Math.min(Math.max(state.water   + rates.WATER   * elapsedSec, 0), cap),
    iron:    Math.min(Math.max(state.iron    + rates.IRON    * elapsedSec, 0), cap),
    helium3: Math.min(Math.max(state.helium3 + (rates.HELIUM3 - heliumUpkeepPerSec) * elapsedSec, 0), cap),
    lastUpdatedAt: now,
  };

  return prisma.resourceState.upsert({
    where: { baseId: base.id },
    update: newState,
    create: { baseId: base.id, ...newState },
  });
}

/**
 * Get rates (units/min) for a base's resources, including helium upkeep.
 */
export async function getResourceRates(baseId) {
  const mines = await prisma.mine.findMany({ where: { baseId } });
  const rates = { OXYGEN: 0, WATER: 0, IRON: 0, HELIUM3: 0 };
  for (const mine of mines) {
    rates[mine.resourceType] += getMineRate(mine.resourceType, effectiveLevel(mine));
  }
  const heliumUpkeep = await getHeliumUpkeep(baseId);
  return { ...rates, HELIUM3_UPKEEP: heliumUpkeep, HELIUM3_NET: rates.HELIUM3 - heliumUpkeep };
}

/**
 * Get helium upkeep (units/min) for a base based on current unit stocks.
 */
export async function getHeliumUpkeep(baseId) {
  const stocks = await prisma.unitStock.findMany({ where: { baseId } });
  let upkeep = 0;
  for (const stock of stocks) {
    upkeep += (getHeliumUpkeepMap()[stock.type] || 0) * stock.count;
  }
  return upkeep;
}

/**
 * Apply helium attrition: if stored helium = 0 and net helium is negative,
 * randomly kill units every ATTRITION_INTERVAL_MS.
 */
export async function applyHeliumAttrition(base, io) {
  const state = await prisma.resourceState.findUnique({ where: { baseId: base.id } });
  if (!state) return;

  const upkeepPerMin = await getHeliumUpkeep(base.id);
  if (upkeepPerMin <= 0) return; // no units, no attrition

  const mines = await prisma.mine.findMany({ where: { baseId: base.id } });
  let heliumProduction = 0;
  for (const mine of mines) {
    if (mine.resourceType === 'HELIUM3') {
      heliumProduction += getMineRate('HELIUM3', effectiveLevel(mine));
    }
  }

  const netPerMin = heliumProduction - upkeepPerMin;
  if (netPerMin >= 0) return; // healthy, no attrition

  // In deficit — check if stored helium covers upkeep
  if (state.helium3 > 0) return; // still have reserves, no attrition yet

  // No helium and negative net — check attrition timer
  const now = Date.now();
  const last = lastAttritionTime.get(base.id) || 0;
  if (now - last < ATTRITION_INTERVAL_MS) return;
  lastAttritionTime.set(base.id, now);

  // Kill a random unit from stock
  const stocks = await prisma.unitStock.findMany({
    where: { baseId: base.id, count: { gt: 0 } },
  });
  if (stocks.length === 0) return;

  const target = stocks[Math.floor(Math.random() * stocks.length)];
  await prisma.unitStock.update({
    where: { id: target.id },
    data: { count: { decrement: 1 } },
  });

  if (io) {
    const updatedStocks = await prisma.unitStock.findMany({ where: { baseId: base.id } });
    io.to(`base:${base.id}`).emit('unit:update', { baseId: base.id, stocks: updatedStocks });
    io.to(`base:${base.id}`).emit('helium:attrition', {
      baseId: base.id,
      unitType: target.type,
      message: '⚠️ A unit was lost due to helium shortage!',
    });
  }
}

/**
 * Deduct resources from a base. Returns false if insufficient.
 * Uses atomic conditional update to prevent race conditions.
 */
export async function deductResources(baseId, cost) {
  const o = cost.oxygen  || 0;
  const w = cost.water   || 0;
  const i = cost.iron    || 0;
  const h = cost.helium3 || 0;

  // Atomic: only deduct if all resources are sufficient
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "ResourceState"
     SET "oxygen"  = "oxygen"  - $1,
         "water"   = "water"   - $2,
         "iron"    = "iron"    - $3,
         "helium3" = "helium3" - $4
     WHERE "baseId" = $5
       AND "oxygen"  >= $1
       AND "water"   >= $2
       AND "iron"    >= $3
       AND "helium3" >= $4`,
    o, w, i, h, baseId
  );
  return result > 0; // rows affected — 0 means insufficient
}

/**
 * Add resources to a base (capped by silo).
 */
export async function addResources(baseId, amount) {
  const state = await prisma.resourceState.findUnique({ where: { baseId } });
  if (!state) return;

  const siloBuilding = await prisma.building.findUnique({
    where: { baseId_type: { baseId, type: 'SILO' } },
  });
  const cap = getSiloCapacity(effectiveLevel(siloBuilding));

  await prisma.resourceState.update({
    where: { baseId },
    data: {
      oxygen:  Math.min(state.oxygen  + (amount.oxygen  || 0), cap),
      water:   Math.min(state.water   + (amount.water   || 0), cap),
      iron:    Math.min(state.iron    + (amount.iron    || 0), cap),
      helium3: Math.min(state.helium3 + (amount.helium3 || 0), cap),
    },
  }).catch(() => {});
}

