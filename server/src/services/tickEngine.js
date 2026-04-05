import { prisma } from '../prisma/client.js';
import { tickResources, addResources, applyHeliumAttrition } from './resourceEngine.js';
import { resolveBattle } from './combatService.js';
import { getHeliumUpkeepMap } from '../services/gameConfigService.js';
import { awardVictoryMedals } from './medalService.js';

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
      try {
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

        // Helium attrition check (runs every tick but kills only every 30s)
        await applyHeliumAttrition(base, io);
      } catch (baseErr) {
        console.error(`[tick] Resource error for base ${base.id}:`, baseErr.message);
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

      // Update population points (+1 per upgrade completed)
      await prisma.base.update({
        where: { id: building.baseId },
        data: { populationPoints: { increment: 1 } },
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

      // Update population points (+1 per upgrade completed)
      await prisma.base.update({
        where: { id: mine.baseId },
        data: { populationPoints: { increment: 1 } },
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
      include: { defenderBase: { select: { name: true, userId: true } } },
    });

    for (const attack of arrivedAttacks) {
      await prisma.attack.update({
        where: { id: attack.id },
        data: { status: 'BATTLING' },
      });

    const { report, attackerWon, resourcesLooted, survivingAttackerUnits, attackerUnitsLost } = await resolveBattle(attack);

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

        // Notify reinforcement owners about their losses
        const ownerLosses = report._reinforcementOwnerLosses ?? {};
        const reinforcements = report._reinforcements ?? [];
        const notifiedOwners = new Set();
        for (const r of reinforcements) {
          const ownerId = r.fromBase?.userId;
          if (!ownerId || ownerId === attack.defenderBase?.userId || notifiedOwners.has(ownerId)) continue;
          notifiedOwners.add(ownerId);
          const myLosses = ownerLosses[ownerId] ?? {};
          // Find all bases owned by this user to send them the notification
          const ownerBases = await prisma.base.findMany({ where: { userId: ownerId }, select: { id: true } });
          for (const ob of ownerBases) {
            io.to(`base:${ob.id}`).emit('combat:report', {
              attackId: attack.id,
              report: {
                ...report,
                reinforcementOwnerLosses: myLosses,
              },
              role: 'reinforcer',
              defenderBaseName: attack.defenderBase?.name ?? 'Unknown base',
            });
          }
        }

        // Push updated defender resources + units so their UI refreshes immediately
        const defenderRes = await prisma.resourceState.findUnique({ where: { baseId: attack.defenderBaseId } });
        if (defenderRes) {
          io.to(`base:${attack.defenderBaseId}`).emit('resource:update', {
            baseId: attack.defenderBaseId,
            resources: { oxygen: defenderRes.oxygen, water: defenderRes.water, iron: defenderRes.iron, helium3: defenderRes.helium3 },
          });
        }
        const defenderStocks = await prisma.unitStock.findMany({ where: { baseId: attack.defenderBaseId } });
        io.to(`base:${attack.defenderBaseId}`).emit('unit:update', { baseId: attack.defenderBaseId, stocks: defenderStocks });

        // Transition attack line to returning (green/red based on winner)
        const defBase = await prisma.base.findUnique({ where: { id: attack.defenderBaseId }, select: { seasonId: true } });
        if (defBase) {
          io.to(`map:season:${defBase.seasonId}`).emit('map:attack_returning', {
            attackId:    attack.id,
            returnTime,
            attackerWon,
          });
        }
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

      const report = attack.battleReport;

      // Return surviving attacker units to base
      if (report) {
        const sentUnits = report.attackingUnits;
        const lostUnits = report.attackerUnitsLost;
        for (const [type, sent] of Object.entries(sentUnits)) {
          const lost = lostUnits[type] || 0;
          const surviving = Math.max(sent - lost, 0);
          if (surviving > 0) {
            await prisma.unitStock.upsert({
              where: { baseId_type: { baseId: attack.attackerBaseId, type } },
              update: { count: { increment: surviving } },
              create: { baseId: attack.attackerBaseId, type, count: surviving },
            });
          }
        }
      }

      // Credit looted resources to attacker base
      if (report?.attackerWon && report?.resourcesLooted) {
        await addResources(attack.attackerBaseId, report.resourcesLooted);
        if (io) {
          io.to(`base:${attack.attackerBaseId}`).emit('combat:loot_returned', {
            attackId:  attack.id,
            resources: report.resourcesLooted,
          });
        }
      }

      if (io) {
        const stocks = await prisma.unitStock.findMany({ where: { baseId: attack.attackerBaseId } });
        io.to(`base:${attack.attackerBaseId}`).emit('unit:update', {
          baseId: attack.attackerBaseId,
          stocks,
        });
        io.to(`base:${attack.attackerBaseId}`).emit('combat:completed', { attackId: attack.id });
        io.to(`base:${attack.defenderBaseId}`).emit('combat:completed', { attackId: attack.id });
        const atkBase = await prisma.base.findUnique({ where: { id: attack.attackerBaseId }, select: { seasonId: true } });
        if (atkBase) {
          io.to(`map:season:${atkBase.seasonId}`).emit('map:attack_completed', { attackId: attack.id });
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

    // ── 8. Reinforcement arrivals ──────────────────────────────────────────
    try {
      const arrivedReinforcements = await prisma.reinforcement.findMany({
        where: { arrivalTime: { lte: now }, status: 'IN_TRANSIT' },
      });
      for (const r of arrivedReinforcements) {
        await prisma.reinforcement.update({ where: { id: r.id }, data: { status: 'ARRIVED' } });
        for (const [type, qty] of Object.entries(r.units)) {
          if (qty > 0) {
            await prisma.unitStock.upsert({
              where: { baseId_type: { baseId: r.toBaseId, type } },
              update: { count: { increment: qty } },
              create: { baseId: r.toBaseId, type, count: qty },
            });
          }
        }
        if (io) io.to(`base:${r.toBaseId}`).emit('reinforcement:arrived', { reinforcementId: r.id, units: r.units });
      }

      // ── 9. Reinforcement returns (recalled → units back to sender) ─────────
      const returnedReinforcements = await prisma.reinforcement.findMany({
        where: { returnTime: { lte: now }, status: { in: ['RECALLED', 'RETURNED'] } },
      });
      for (const r of returnedReinforcements) {
        await prisma.reinforcement.update({ where: { id: r.id }, data: { status: 'RETURNED' } });
        for (const [type, qty] of Object.entries(r.units)) {
          if (qty > 0) {
            // Add back to sender
            await prisma.unitStock.upsert({
              where: { baseId_type: { baseId: r.fromBaseId, type } },
              update: { count: { increment: qty } },
              create: { baseId: r.fromBaseId, type, count: qty },
            });
            // Remove from destination (they've left)
            try {
              const stock = await prisma.unitStock.findUnique({
                where: { baseId_type: { baseId: r.toBaseId, type } },
              });
              if (stock) {
                const newCount = Math.max(0, stock.count - qty);
                if (newCount === 0) {
                  await prisma.unitStock.delete({ where: { baseId_type: { baseId: r.toBaseId, type } } });
                } else {
                  await prisma.unitStock.update({
                    where: { baseId_type: { baseId: r.toBaseId, type } },
                    data: { count: newCount },
                  });
                }
              }
            } catch (e) {
              if (e?.code !== 'P2025') console.error(`[tick] Reinforcement unit return error:`, e.message);
            }
          }
        }
        if (io) {
          io.to(`base:${r.fromBaseId}`).emit('reinforcement:returned', { reinforcementId: r.id, units: r.units });
          // Update sender's unit display
          const fromStocks = await prisma.unitStock.findMany({ where: { baseId: r.fromBaseId } });
          io.to(`base:${r.fromBaseId}`).emit('unit:update', { baseId: r.fromBaseId, stocks: fromStocks });
          // Notify destination so its helium upkeep display refreshes
          const toStocks = await prisma.unitStock.findMany({ where: { baseId: r.toBaseId } });
          io.to(`base:${r.toBaseId}`).emit('unit:update', { baseId: r.toBaseId, stocks: toStocks });
        }
      }
    } catch (reinErr) {
      // Reinforcement table may not exist yet — suppress until SQL migration is run
      if (!reinErr.message?.includes('does not exist')) console.error('[tick/reinforce]', reinErr.message);
    }

    // ── 10. Season end check ───────────────────────────────────────────────
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true, endDate: { lte: now } },
    });
    if (activeSeason) {
      await prisma.season.update({
        where: { id: activeSeason.id },
        data: { isActive: false },
      });
      // Award victory medals to winning alliance on auto season end
      await awardVictoryMedals(activeSeason.id);
      if (io) {
        io.emit('season:ended', { seasonId: activeSeason.id });
      }
      console.log(`🏁 Season "${activeSeason.name}" has ended.`);
    }
  } catch (err) {
    console.error('[tick] Error:', err.message);
  }
}

let tickRunning = false;

export function startTickEngine(socketIo) {
  io = socketIo;
  setInterval(async () => {
    if (tickRunning) return; // prevent overlapping ticks
    tickRunning = true;
    try {
      await runTick();
    } finally {
      tickRunning = false;
    }
  }, 1000);
  console.log('⚙️  Tick engine started (1s interval)');
}
