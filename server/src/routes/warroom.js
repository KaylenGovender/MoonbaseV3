import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { deductResources, addResources } from '../services/resourceEngine.js';
import { getUnitStatsMap, constructionYardReduction } from '../services/gameConfigService.js';
import { distanceBetween as calcDistance } from '../services/placementService.js';
import { getConfig } from '../services/serverConfig.js';

const router = Router();

// GET /api/warroom/:baseId — current units + build queue
router.get('/:baseId', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const unitStocks = await prisma.unitStock.findMany({ where: { baseId } });
    const buildQueue = await prisma.buildQueue.findMany({
      where: { baseId, completed: false },
      orderBy: { startedAt: 'asc' },
    });
    res.json({ unitStocks, buildQueue, unitStats: getUnitStatsMap() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/warroom/:baseId/queue — queue unit production
router.post('/:baseId/queue', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const { unitType, quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const warRoom = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'WAR_ROOM' } },
    });
    if (!warRoom || warRoom.level === 0) {
      return res.status(400).json({ error: 'War Room not built' });
    }

    const stats = getUnitStatsMap()[unitType];
    if (!stats) return res.status(400).json({ error: 'Invalid unit type' });

    // Titan: max 1 per player (wrapped in transaction to prevent race condition)
    if (unitType === 'TITAN') {
      const allBases = await prisma.base.findMany({
        where: { userId: req.user.id, season: { isActive: true } },
      });
      const baseIds = allBases.map((b) => b.id);

      await prisma.$transaction(async (tx) => {
        const titanStocks = await tx.unitStock.findMany({
          where: { baseId: { in: baseIds }, type: 'TITAN' },
        });
        const titanQueues = await tx.buildQueue.findMany({
          where: {
            baseId: { in: baseIds },
            unitType: 'TITAN',
            completed: false,
          },
        });
        const totalTitans =
          titanStocks.reduce((s, t) => s + t.count, 0) +
          titanQueues.reduce((s, t) => s + t.quantity, 0);
        if (totalTitans >= 1) {
          throw new Error('You can only have 1 Titan');
        }
      });

      if (quantity > 1) {
        return res.status(400).json({ error: 'Can only queue 1 Titan at a time' });
      }
    }

    // Calculate total cost
    const totalCost = {
      oxygen:  stats.cost.oxygen  * quantity,
      water:   stats.cost.water   * quantity,
      iron:    stats.cost.iron    * quantity,
      helium3: stats.cost.helium3 * quantity,
    };

    const ok = await deductResources(baseId, totalCost);
    if (!ok) return res.status(400).json({ error: 'Insufficient resources' });

    // Apply Construction Yard reduction (use effective level)
    const cyBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'CONSTRUCTION_YARD' } },
    });
    const cyEffectiveLevel = cyBuilding?.upgradeEndsAt ? cyBuilding.level - 1 : cyBuilding?.level ?? 0;
    const reduction = constructionYardReduction(cyEffectiveLevel) / 100;
    const timePerUnit = Math.round(stats.buildTime * (1 - reduction));

    // Queue after last pending job — create individual entries per unit for incremental delivery
    const lastJob = await prisma.buildQueue.findFirst({
      where: { baseId, completed: false },
      orderBy: { completesAt: 'desc' },
    });
    const startAfter = lastJob ? new Date(lastJob.completesAt).getTime() : Date.now();

    const jobs = [];
    for (let i = 0; i < quantity; i++) {
      const unitCompletesAt = new Date(startAfter + timePerUnit * (i + 1) * 1000);
      jobs.push({
        baseId,
        unitType,
        quantity: 1,
        startedAt: new Date(startAfter + timePerUnit * i * 1000),
        completesAt: unitCompletesAt,
      });
    }
    await prisma.buildQueue.createMany({ data: jobs });

    // Return a summary job for the client
    const lastEntry = jobs[jobs.length - 1];
    const job = { unitType, quantity, startedAt: new Date(startAfter), completesAt: lastEntry.completesAt };

    res.status(201).json({ job });
  } catch (err) {
    // Return user-facing errors from transaction throws
    if (err.message === 'You can only have 1 Titan') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[warroom/queue]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/warroom/:baseId/attack — launch an attack
router.post('/:baseId/attack', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const { targetBaseId, units } = req.body; // units: { MOONBUGGY: 5, ... }

    const attackerBase = await prisma.base.findUnique({ where: { id: baseId } });
    if (!attackerBase || attackerBase.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (targetBaseId === baseId) {
      return res.status(400).json({ error: 'Cannot attack your own base' });
    }

    const defenderBase = await prisma.base.findUnique({ where: { id: targetBaseId } });
    if (!defenderBase) return res.status(404).json({ error: 'Target not found' });

    // Prevent attacking own bases (any base owned by same user)
    if (defenderBase.userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot attack your own base' });
    }

    // Block attacks between alliance members
    const attackerAlliance = await prisma.allianceMember.findFirst({
      where: { userId: req.user.id },
      include: { alliance: { include: { members: { select: { userId: true } } } } },
    });
    if (attackerAlliance) {
      const allyUserIds = attackerAlliance.alliance.members.map((m) => m.userId);
      if (allyUserIds.includes(defenderBase.userId)) {
        return res.status(400).json({ error: 'Cannot attack alliance members. Use trade pods or reinforcements instead.' });
      }
    }

    // New-player protection: cannot be attacked within 24h of account creation
    const defenderUser = await prisma.user.findUnique({
      where: { id: defenderBase.userId },
      select: { createdAt: true },
    });
    const protectionEnabled = (await getConfig('protection_enabled', 'true')) === 'true';
    if (protectionEnabled && defenderUser) {
      const protectedUntil = new Date(defenderUser.createdAt.getTime() + 24 * 60 * 60 * 1000);
      if (Date.now() < protectedUntil.getTime()) {
        return res.status(400).json({
          error: 'This player is under new-player protection.',
          protectedUntil: protectedUntil.toISOString(),
        });
      }
    }

    // Validate and deduct units atomically to prevent race conditions
    await prisma.$transaction(async (tx) => {
      for (const [type, qty] of Object.entries(units)) {
        if (!qty || qty <= 0) continue;
        const stock = await tx.unitStock.findUnique({
          where: { baseId_type: { baseId, type } },
        });
        if (!stock || stock.count < qty) {
          throw new Error(`Insufficient ${type} units`);
        }
        await tx.unitStock.update({
          where: { baseId_type: { baseId, type } },
          data: { count: { decrement: qty } },
        });
      }
    });

    // Calculate travel time (distance / slowest unit speed)
    const dist = calcDistance(
      attackerBase.x, attackerBase.y,
      defenderBase.x, defenderBase.y,
    );
    let minSpeed = Infinity;
    for (const [type, qty] of Object.entries(units)) {
      if (qty > 0 && getUnitStatsMap()[type]) {
        minSpeed = Math.min(minSpeed, getUnitStatsMap()[type].speed);
      }
    }
    if (minSpeed === Infinity || minSpeed <= 0) minSpeed = 80;
    const travelHours = dist / minSpeed;
    const travelMs = travelHours * 3600 * 1000;

    const now = new Date();
    const arrivalTime = new Date(now.getTime() + travelMs);

    const attack = await prisma.attack.create({
      data: {
        attackerBaseId: baseId,
        defenderBaseId: targetBaseId,
        units,
        launchTime:  now,
        arrivalTime,
        status: 'IN_FLIGHT',
      },
    });

    // Notify via WebSocket so map shows attack in-flight and defender sees incoming warning
    const socketIo = req.app.get('io');
    if (socketIo) {
      const seasonId = attackerBase.seasonId;
      socketIo.to(`map:season:${seasonId}`).emit('map:attack_launched', {
        attackId: attack.id,
        attackerBaseId: baseId,
        defenderBaseId: targetBaseId,
        launchTime: now,
        arrivalTime,
      });
      socketIo.to(`base:${targetBaseId}`).emit('attack:incoming', {
        attackId: attack.id,
        arrivalTime,
      });
    }

    res.status(201).json({ attack, eta: arrivalTime });
  } catch (err) {
    console.error('[attack launch]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/warroom/:baseId/queue/:jobId — cancel a queued unit job and refund
router.delete('/:baseId/queue/:jobId', requireAuth, async (req, res) => {
  try {
    const { baseId, jobId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const job = await prisma.buildQueue.findUnique({ where: { id: jobId } });
    if (!job || job.baseId !== baseId) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.completed) {
      return res.status(400).json({ error: 'Job already completed' });
    }

    // Refund resources
    const stats = getUnitStatsMap()[job.unitType];
    if (stats) {
      await addResources(baseId, {
        oxygen:  stats.cost.oxygen  * job.quantity,
        water:   stats.cost.water   * job.quantity,
        iron:    stats.cost.iron    * job.quantity,
        helium3: stats.cost.helium3 * job.quantity,
      });
    }

    await prisma.buildQueue.delete({ where: { id: jobId } });
    res.json({ message: 'Cancelled and refunded' });
  } catch (err) {
    console.error('[warroom/cancel]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

