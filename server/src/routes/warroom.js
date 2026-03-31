import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { deductResources } from '../services/resourceEngine.js';
import { UNIT_STATS, constructionYardReduction } from '../config/gameConfig.js';
import { distanceBetween as calcDistance } from '../services/placementService.js';

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
    res.json({ unitStocks, buildQueue, unitStats: UNIT_STATS });
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

    const stats = UNIT_STATS[unitType];
    if (!stats) return res.status(400).json({ error: 'Invalid unit type' });

    // Titan: max 1 per player
    if (unitType === 'TITAN') {
      const allBases = await prisma.base.findMany({
        where: { userId: req.user.id, season: { isActive: true } },
      });
      const titanStocks = await prisma.unitStock.findMany({
        where: { baseId: { in: allBases.map((b) => b.id) }, type: 'TITAN' },
      });
      const titanQueues = await prisma.buildQueue.findMany({
        where: {
          baseId: { in: allBases.map((b) => b.id) },
          unitType: 'TITAN',
          completed: false,
        },
      });
      const totalTitans =
        titanStocks.reduce((s, t) => s + t.count, 0) +
        titanQueues.reduce((s, t) => s + t.quantity, 0);
      if (totalTitans >= 1) {
        return res.status(400).json({ error: 'You can only have 1 Titan' });
      }
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

    // Apply Construction Yard reduction
    const cyBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'CONSTRUCTION_YARD' } },
    });
    const reduction = constructionYardReduction(cyBuilding?.level ?? 0) / 100;
    const timePerUnit = Math.round(stats.buildTime * (1 - reduction));

    // Queue after last pending job
    const lastJob = await prisma.buildQueue.findFirst({
      where: { baseId, completed: false },
      orderBy: { completesAt: 'desc' },
    });
    const startAfter = lastJob ? new Date(lastJob.completesAt) : new Date();
    const completesAt = new Date(startAfter.getTime() + timePerUnit * quantity * 1000);

    const job = await prisma.buildQueue.create({
      data: {
        baseId,
        unitType,
        quantity,
        startedAt:   startAfter,
        completesAt,
      },
    });

    res.status(201).json({ job });
  } catch (err) {
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

    // Validate and deduct units
    for (const [type, qty] of Object.entries(units)) {
      if (!qty || qty <= 0) continue;
      const stock = await prisma.unitStock.findUnique({
        where: { baseId_type: { baseId, type } },
      });
      if (!stock || stock.count < qty) {
        return res.status(400).json({ error: `Insufficient ${type} units` });
      }
    }

    // Deduct units from stock
    for (const [type, qty] of Object.entries(units)) {
      if (!qty || qty <= 0) continue;
      await prisma.unitStock.update({
        where: { baseId_type: { baseId, type } },
        data: { count: { decrement: qty } },
      });
    }

    // Calculate travel time (distance / slowest unit speed)
    const dist = calcDistance(
      attackerBase.x, attackerBase.y,
      defenderBase.x, defenderBase.y,
    );
    let minSpeed = Infinity;
    for (const [type, qty] of Object.entries(units)) {
      if (qty > 0 && UNIT_STATS[type]) {
        minSpeed = Math.min(minSpeed, UNIT_STATS[type].speed);
      }
    }
    if (minSpeed === Infinity) minSpeed = 80;
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

    res.status(201).json({ attack, eta: arrivalTime });
  } catch (err) {
    console.error('[attack launch]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
