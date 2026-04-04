import { prisma } from '../prisma/client.js';
import { getUnitStatsMap, getBunkerProtection } from '../services/gameConfigService.js';
import { addResources } from './resourceEngine.js';

/**
 * Resolve a battle when an attack arrives at the defender base.
 * Returns the BattleReport plus survivingAttackerUnits and attackerUnitsLost
 * so tickEngine can correctly return units and apply losses on COMPLETED.
 */
export async function resolveBattle(attack) {
  const attackerBase = await prisma.base.findUnique({
    where: { id: attack.attackerBaseId },
  });
  const defenderBase = await prisma.base.findUnique({
    where: { id: attack.defenderBaseId },
  });

  // ── Load unit counts ──────────────────────────────────────────────────────
  const attackingUnits = attack.units; // { MOONBUGGY: 5, ... }

  const defenderStocks = await prisma.unitStock.findMany({
    where: { baseId: attack.defenderBaseId },
  });
  const defendingUnits = {};
  for (const stock of defenderStocks) {
    if (stock.count > 0) defendingUnits[stock.type] = stock.count;
  }

  // ── Calculate totals ──────────────────────────────────────────────────────
  let totalAttack = 0;
  let totalDefense = 0;

  for (const [type, count] of Object.entries(attackingUnits)) {
    if (getUnitStatsMap()[type] && count > 0) {
      totalAttack += getUnitStatsMap()[type].attack * count;
    }
  }
  for (const [type, count] of Object.entries(defendingUnits)) {
    if (getUnitStatsMap()[type] && count > 0) {
      totalDefense += getUnitStatsMap()[type].defense * count;
    }
  }

  const attackerWon = totalAttack > totalDefense;

  // ── Calculate losses ──────────────────────────────────────────────────────
  const total = totalAttack + totalDefense || 1;
  const attackerLossRatio = totalDefense / total;
  const defenderLossRatio = totalAttack / total;

  const attackerUnitsLost = {};
  const defenderUnitsLost = {};

  for (const [type, count] of Object.entries(attackingUnits)) {
    const lost = attackerWon
      ? Math.floor(count * attackerLossRatio * 0.4) // winners lose less
      : Math.ceil(count * attackerLossRatio);
    attackerUnitsLost[type] = Math.min(lost, count);
  }
  for (const [type, count] of Object.entries(defendingUnits)) {
    const lost = !attackerWon
      ? Math.floor(count * defenderLossRatio * 0.4)
      : Math.ceil(count * defenderLossRatio);
    defenderUnitsLost[type] = Math.min(lost, count);
  }

  // ── Surviving attacker units (returned home on COMPLETED) ────────────────
  const survivingAttackerUnits = {};
  for (const [type, count] of Object.entries(attackingUnits)) {
    const surviving = count - (attackerUnitsLost[type] || 0);
    if (surviving > 0) survivingAttackerUnits[type] = surviving;
  }

  // ── Resource looting (attacker wins only) ────────────────────────────────
  const resourcesLooted = { oxygen: 0, water: 0, iron: 0, helium3: 0 };
  let attackerPointsChange = 0;
  let defenderPointsChange = 0;

  if (attackerWon) {
    const defenderResources = await prisma.resourceState.findUnique({
      where: { baseId: attack.defenderBaseId },
    });
    const bunkerBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId: attack.defenderBaseId, type: 'BUNKER' } },
    });
    const bunkerEffLevel = bunkerBuilding?.upgradeEndsAt ? bunkerBuilding.level - 1 : bunkerBuilding?.level ?? 0;
    const protection = getBunkerProtection(bunkerEffLevel) / 100;

    // Carry capacity based on surviving attacking units
    let maxCarry = 0;
    for (const [type, surviving] of Object.entries(survivingAttackerUnits)) {
      if (getUnitStatsMap()[type]) {
        maxCarry += getUnitStatsMap()[type].carryCapacity * surviving;
      }
    }

    if (defenderResources) {
      const stealable = {
        oxygen:  defenderResources.oxygen  * (1 - protection),
        water:   defenderResources.water   * (1 - protection),
        iron:    defenderResources.iron    * (1 - protection),
        helium3: defenderResources.helium3 * (1 - protection),
      };
      const totalStealable =
        stealable.oxygen + stealable.water + stealable.iron + stealable.helium3;
      const ratio = totalStealable > 0 ? Math.min(maxCarry / totalStealable, 1) : 0;

      resourcesLooted.oxygen  = Math.floor(stealable.oxygen  * ratio);
      resourcesLooted.water   = Math.floor(stealable.water   * ratio);
      resourcesLooted.iron    = Math.floor(stealable.iron    * ratio);
      resourcesLooted.helium3 = Math.floor(stealable.helium3 * ratio);

      // Deduct from defender
      await prisma.resourceState.update({
        where: { baseId: attack.defenderBaseId },
        data: {
          oxygen:  Math.max(defenderResources.oxygen  - resourcesLooted.oxygen,  0),
          water:   Math.max(defenderResources.water   - resourcesLooted.water,   0),
          iron:    Math.max(defenderResources.iron    - resourcesLooted.iron,    0),
          helium3: Math.max(defenderResources.helium3 - resourcesLooted.helium3, 0),
        },
      });
    }

    attackerPointsChange = 10 + Math.floor(
      (resourcesLooted.oxygen + resourcesLooted.water + resourcesLooted.iron + resourcesLooted.helium3) / 100,
    );
    defenderPointsChange = -5;
  } else {
    // Defender wins
    attackerPointsChange = -3;
    defenderPointsChange = 8;
  }

  // ── Apply unit losses to DEFENDER only here ───────────────────────────────
  // Attacker losses + unit returns are handled in tickEngine on COMPLETED
  for (const [type, lost] of Object.entries(defenderUnitsLost)) {
    await prisma.unitStock.updateMany({
      where: { baseId: attack.defenderBaseId, type },
      data: { count: { decrement: lost } },
    });
  }
  // Ensure no negative defender unit counts
  await prisma.unitStock.updateMany({
    where: { baseId: attack.defenderBaseId, count: { lt: 0 } },
    data: { count: 0 },
  });

  // ── Update medals ─────────────────────────────────────────────────────────
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (season) {
    const week = await getCurrentSeasonWeekNumber(season.id);
    const totalLooted =
      resourcesLooted.oxygen + resourcesLooted.water +
      resourcesLooted.iron   + resourcesLooted.helium3;

    // Attacker medals
    await upsertMedal(attackerBase.userId, season.id, week, {
      attackerPoints: attackerPointsChange,
      raiderPoints:   Math.floor(totalLooted / 50),
    });
    // Defender medals
    await upsertMedal(defenderBase.userId, season.id, week, {
      defenderPoints: defenderPointsChange,
      raiderPoints:   0,
    });
  }

  // ── Create battle report ──────────────────────────────────────────────────
  const report = await prisma.battleReport.create({
    data: {
      attackId:            attack.id,
      attackingUnits,
      defendingUnits,
      attackerUnitsLost,
      defenderUnitsLost,
      resourcesLooted,
      attackerPointsChange,
      defenderPointsChange,
      attackerWon,
    },
  });

  return { report, attackerWon, resourcesLooted, survivingAttackerUnits, attackerUnitsLost };
}

/**
 * Get the current season-relative week number from WeekConfig.
 * Falls back to ISO week number if WeekConfig table isn't populated.
 */
async function getCurrentSeasonWeekNumber(seasonId) {
  try {
    const now = new Date();
    // Current week = earliest WeekConfig whose endDate is still in the future
    const current = await prisma.weekConfig.findFirst({
      where: { seasonId, endDate: { gt: now } },
      orderBy: { weekNumber: 'asc' },
    });
    if (current) return current.weekNumber;
    // All weeks have ended — use the last one
    const last = await prisma.weekConfig.findFirst({
      where: { seasonId },
      orderBy: { weekNumber: 'desc' },
    });
    if (last) return last.weekNumber;
  } catch {}
  return getWeekNumber(new Date()); // fallback
}

async function upsertMedal(userId, seasonId, weekNumber, increments) {
  const existing = await prisma.medal.findUnique({
    where: { userId_seasonId_weekNumber: { userId, seasonId, weekNumber } },
  });
  if (existing) {
    await prisma.medal.update({
      where: { userId_seasonId_weekNumber: { userId, seasonId, weekNumber } },
      data: {
        attackerPoints: { increment: increments.attackerPoints || 0 },
        defenderPoints: { increment: increments.defenderPoints || 0 },
        raiderPoints:   { increment: increments.raiderPoints   || 0 },
      },
    });
  } else {
    await prisma.medal.create({
      data: {
        userId,
        seasonId,
        weekNumber,
        attackerPoints: increments.attackerPoints || 0,
        defenderPoints: increments.defenderPoints || 0,
        raiderPoints:   increments.raiderPoints   || 0,
      },
    });
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export { getWeekNumber };

