import { prisma } from '../prisma/client.js';
import { tickResources, addResources } from './resourceEngine.js';
import { resolveBattle } from './combatService.js';

let io = null;

export function setSocketIo(socketIo) {
  io = socketIo;
}

/**
 * Main game tick — runs every 1 second.
 * Handles: resource generation, building upgrades, unit builds,
 *          attack arrivals/returns, trade pod arrivals, season end.
 */
export async function runTick() {
  const now = new Date();

  try {
    // ── 1. Resource generation ─────────────────────────────────────────────
    const bases = await prisma.base.findMany({
      where: { season: { isActive: true } },
    });

    for (const base of bases) {
      const updated = await tickResources(base);
      if (updated && io) {
        io.to(`base:${base.id}`).emit('resource:update', {
          baseId: base.id,
          resources: {
            oxygen:  updated.oxygen,
            water:   updated.water,
            iron:    updated.iron,
            helium3: updated.helium3,
          },
        });
      }
    }

    // ── 2. Building upgrade completions ───────────────────────────────────
    const completedBuildings = await prisma.building.findMany({
      where: {
        upgradeEndsAt: { lte: now },
        NOT: { upgradeEndsAt: null },
      },
      include: { base: true },
    });

    for (const building of completedBuildings) {
      const updated = await prisma.building.update({
        where: { id: building.id },
        data: { upgradeEndsAt: null },
      });

      // Update population points
      await prisma.base.update({
        where: { id: building.baseId },
        data: { populationPoints: { increment: building.level } },
      });

      if (io) {
        io.to(`base:${building.baseId}`).emit('building:update', {
          baseId:   building.baseId,
          type:     building.type,
          level:    building.level,
          upgradeEndsAt: null,
        });
      }
    }

    // ── 3. Mine upgrade completions ───────────────────────────────────────
    const completedMines = await prisma.mine.findMany({
      where: {
        upgradeEndsAt: { lte: now },
        NOT: { upgradeEndsAt: null },
      },
    });

    for (const mine of completedMines) {
      await prisma.mine.update({
        where: { id: mine.id },
        data: { upgradeEndsAt: null },
      });

      // Update population points
      await prisma.base.update({
        where: { id: mine.baseId },
        data: { populationPoints: { increment: mine.level } },
      });

      if (io) {
        io.to(`base:${mine.baseId}`).emit('mine:update', {
          baseId:       mine.baseId,
          mineId:       mine.id,
          resourceType: mine.resourceType,
          slot:         mine.slot,
          level:        mine.level,
          upgradeEndsAt: null,
        });
      }
    }

    // ── 4. Unit build queue completions ──────────────────────────────────
    const completedBuilds = await prisma.buildQueue.findMany({
      where: { completesAt: { lte: now }, completed: false },
    });

    for (const build of completedBuilds) {
      await prisma.buildQueue.update({
        where: { id: build.id },
        data: { completed: true },
      });

      await prisma.unitStock.upsert({
        where: { baseId_type: { baseId: build.baseId, type: build.unitType } },
        update: { count: { increment: build.quantity } },
        create: { baseId: build.baseId, type: build.unitType, count: build.quantity },
      });

      if (io) {
        const stocks = await prisma.unitStock.findMany({ where: { baseId: build.baseId } });
        io.to(`base:${build.baseId}`).emit('unit:update', {
          baseId: build.baseId,
          stocks,
        });
      }
    }

    // ── 5. Attack arrivals ────────────────────────────────────────────────
    const arrivedAttacks = await prisma.attack.findMany({
      where: { arrivalTime: { lte: now }, status: 'IN_FLIGHT' },
    });

    for (const attack of arrivedAttacks) {
      await prisma.attack.update({
        where: { id: attack.id },
        data: { status: 'BATTLING' },
      });

      const { report, attackerWon, resourcesLooted } = await resolveBattle(attack);

      // Calculate return time (same travel duration)
      const travelMs = new Date(attack.arrivalTime) - new Date(attack.launchTime);
      const returnTime = new Date(now.getTime() + travelMs);

      await prisma.attack.update({
        where: { id: attack.id },
        data: { status: 'RETURNING', returnTime },
      });

      if (io) {
        // Notify attacker
        io.to(`base:${attack.attackerBaseId}`).emit('combat:report', {
          attackId: attack.id,
          report,
          role: 'attacker',
        });
        // Notify defender
        io.to(`base:${attack.defenderBaseId}`).emit('combat:report', {
          attackId: attack.id,
          report,
          role: 'defender',
        });
        // Remove red incoming line from map
        io.to(`map:season:${(await prisma.base.findUnique({ where: { id: attack.defenderBaseId }, select: { seasonId: true } })).seasonId}`).emit('map:attack_resolved', {
          attackId: attack.id,
        });
      }
    }

    // ── 6. Attack returns (units + looted resources credited) ─────────────
    const returnedAttacks = await prisma.attack.findMany({
      where: { returnTime: { lte: now }, status: 'RETURNING' },
      include: { battleReport: true },
    });

    for (const attack of returnedAttacks) {
      await prisma.attack.update({
        where: { id: attack.id },
        data: { status: 'COMPLETED' },
      });

      // Credit looted resources to attacker base
      if (attack.battleReport?.attackerWon && attack.battleReport?.resourcesLooted) {
        await addResources(attack.attackerBaseId, attack.battleReport.resourcesLooted);
        if (io) {
          io.to(`base:${attack.attackerBaseId}`).emit('combat:loot_returned', {
            attackId:  attack.id,
            resources: attack.battleReport.resourcesLooted,
          });
        }
      }
    }

    // ── 7. Trade pod arrivals ─────────────────────────────────────────────
    const arrivedPods = await prisma.tradePod.findMany({
      where: { arrivalTime: { lte: now }, status: 'IN_TRANSIT' },
    });

    for (const pod of arrivedPods) {
      await prisma.tradePod.update({
        where: { id: pod.id },
        data: { status: 'ARRIVED' },
      });

      await addResources(pod.toBaseId, pod.resources);

      if (io) {
        io.to(`base:${pod.toBaseId}`).emit('tradepod:arrived', {
          podId:     pod.id,
          resources: pod.resources,
        });
        io.to(`base:${pod.fromBaseId}`).emit('tradepod:delivered', {
          podId: pod.id,
        });
      }
    }

    // ── 8. Season end check ───────────────────────────────────────────────
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true, endDate: { lte: now } },
    });
    if (activeSeason) {
      await prisma.season.update({
        where: { id: activeSeason.id },
        data: { isActive: false },
      });
      if (io) {
        io.emit('season:ended', { seasonId: activeSeason.id });
      }
      console.log(`🏁 Season "${activeSeason.name}" has ended.`);
    }
  } catch (err) {
    console.error('[tick] Error:', err.message);
  }
}

export function startTickEngine(socketIo) {
  io = socketIo;
  setInterval(runTick, 1000);
  console.log('⚙️  Tick engine started (1s interval)');
}
