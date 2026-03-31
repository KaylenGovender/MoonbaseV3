import { prisma } from '../prisma/client.js';
import { mineRate, siloCapacity } from '../config/gameConfig.js';

/**
 * Calculate and persist resource generation for a single base.
 * Returns updated ResourceState.
 */
export async function tickResources(base) {
  const state = await prisma.resourceState.findUnique({
    where: { baseId: base.id },
  });
  if (!state) return null;

  const mines = await prisma.mine.findMany({ where: { baseId: base.id } });
  const siloBuilding = await prisma.building.findUnique({
    where: { baseId_type: { baseId: base.id, type: 'SILO' } },
  });
  const siloLevel = siloBuilding?.level ?? 0;
  const cap = siloCapacity(siloLevel);

  // Calculate rates (units/second)
  const rates = { OXYGEN: 0, WATER: 0, IRON: 0, HELIUM3: 0 };
  for (const mine of mines) {
    rates[mine.resourceType] += mineRate(mine.resourceType, mine.level) / 60;
  }

  const now = new Date();
  const elapsedSec = Math.max((now - new Date(state.lastUpdatedAt)) / 1000, 0);

  const newState = {
    oxygen:  Math.min(Math.max(state.oxygen  + rates.OXYGEN  * elapsedSec, 0), cap),
    water:   Math.min(Math.max(state.water   + rates.WATER   * elapsedSec, 0), cap),
    iron:    Math.min(Math.max(state.iron    + rates.IRON    * elapsedSec, 0), cap),
    helium3: Math.min(Math.max(state.helium3 + rates.HELIUM3 * elapsedSec, 0), cap),
    lastUpdatedAt: now,
  };

  return prisma.resourceState.update({
    where: { baseId: base.id },
    data: newState,
  });
}

/**
 * Get rates (units/min) for a base's resources.
 */
export async function getResourceRates(baseId) {
  const mines = await prisma.mine.findMany({ where: { baseId } });
  const rates = { OXYGEN: 0, WATER: 0, IRON: 0, HELIUM3: 0 };
  for (const mine of mines) {
    rates[mine.resourceType] += mineRate(mine.resourceType, mine.level);
  }
  return rates;
}

/**
 * Deduct resources from a base. Returns false if insufficient.
 */
export async function deductResources(baseId, cost) {
  const state = await prisma.resourceState.findUnique({ where: { baseId } });
  if (!state) return false;

  if (
    state.oxygen  < (cost.oxygen  || 0) ||
    state.water   < (cost.water   || 0) ||
    state.iron    < (cost.iron    || 0) ||
    state.helium3 < (cost.helium3 || 0)
  ) {
    return false;
  }

  await prisma.resourceState.update({
    where: { baseId },
    data: {
      oxygen:  state.oxygen  - (cost.oxygen  || 0),
      water:   state.water   - (cost.water   || 0),
      iron:    state.iron    - (cost.iron    || 0),
      helium3: state.helium3 - (cost.helium3 || 0),
    },
  });
  return true;
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
  const cap = siloCapacity(siloBuilding?.level ?? 0);

  await prisma.resourceState.update({
    where: { baseId },
    data: {
      oxygen:  Math.min(state.oxygen  + (amount.oxygen  || 0), cap),
      water:   Math.min(state.water   + (amount.water   || 0), cap),
      iron:    Math.min(state.iron    + (amount.iron    || 0), cap),
      helium3: Math.min(state.helium3 + (amount.helium3 || 0), cap),
    },
  });
}
