import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { deductResources } from '../services/resourceEngine.js';
import { UNIT_STATS } from '../config/gameConfig.js';
import { distanceBetween as calcDistance } from '../services/placementService.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /api/reinforcement/:baseId/send — send units to an ally base
router.post('/:baseId/send', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const { targetBaseId, units } = req.body;

    const fromBase = await prisma.base.findUnique({ where: { id: baseId } });
    if (!fromBase || fromBase.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const toBase = await prisma.base.findUnique({ where: { id: targetBaseId } });
    if (!toBase) return res.status(404).json({ error: 'Target base not found' });

    // Verify target is an ally or own base
    const membership = await prisma.allianceMember.findFirst({ where: { userId: req.user.id } });
    if (toBase.userId !== req.user.id) {
      if (!membership) return res.status(403).json({ error: 'Can only reinforce own bases or alliance members' });
      const allyMembership = await prisma.allianceMember.findFirst({
        where: { userId: toBase.userId, allianceId: membership.allianceId },
      });
      if (!allyMembership) return res.status(403).json({ error: 'Target is not an alliance member' });
    }

    // Validate and deduct units atomically
    const filteredUnits = {};
    await prisma.$transaction(async (tx) => {
      for (const [type, qty] of Object.entries(units)) {
        if (!qty || qty <= 0 || !UNIT_STATS[type]) continue;
        const stock = await tx.unitStock.findUnique({
          where: { baseId_type: { baseId, type } },
        });
        if (!stock || stock.count < qty) {
          throw new Error(`Insufficient ${type} units`);
        }
        filteredUnits[type] = qty;
        await tx.unitStock.update({
          where: { baseId_type: { baseId, type } },
          data: { count: { decrement: qty } },
        });
      }
    });
    if (Object.keys(filteredUnits).length === 0) {
      return res.status(400).json({ error: 'Select at least one unit' });
    }

    // Calculate travel time
    const dist = calcDistance(fromBase.x, fromBase.y, toBase.x, toBase.y);
    let minSpeed = Infinity;
    for (const [type, qty] of Object.entries(filteredUnits)) {
      if (qty > 0) minSpeed = Math.min(minSpeed, UNIT_STATS[type].speed);
    }
    if (minSpeed === Infinity) minSpeed = 80;
    const travelMs = (dist / minSpeed) * 3600 * 1000;
    const now = new Date();
    const arrivalTime = new Date(now.getTime() + travelMs);

    const reinforcement = await prisma.reinforcement.create({
      data: {
        id: uuidv4(),
        fromBaseId: baseId,
        toBaseId: targetBaseId,
        units: filteredUnits,
        sentAt: now,
        arrivalTime,
        status: 'IN_TRANSIT',
      },
    });

    res.status(201).json({ reinforcement, eta: arrivalTime });
  } catch (err) {
    console.error('[reinforcement/send]', err);
    if (err.message?.includes('does not exist')) {
      return res.status(503).json({ error: 'Reinforcement system not ready — run the DB migration script first' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/reinforcement/:id/recall — recall reinforcements home
router.post('/:id/recall', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const reinforcement = await prisma.reinforcement.findUnique({ where: { id } });
    if (!reinforcement) return res.status(404).json({ error: 'Not found' });

    const fromBase = await prisma.base.findUnique({ where: { id: reinforcement.fromBaseId } });
    if (fromBase.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    if (reinforcement.status === 'RECALLED' || reinforcement.status === 'RETURNED') {
      return res.status(400).json({ error: 'Already recalled or returned' });
    }

    const now = new Date();
    // Travel back same duration from now
    const toBase = await prisma.base.findUnique({ where: { id: reinforcement.toBaseId } });
    const dist = calcDistance(fromBase.x, fromBase.y, toBase.x, toBase.y);
    let minSpeed = Infinity;
    for (const [type, qty] of Object.entries(reinforcement.units)) {
      if (qty > 0) minSpeed = Math.min(minSpeed, UNIT_STATS[type]?.speed ?? 80);
    }
    if (minSpeed === Infinity) minSpeed = 80;
    const travelMs = (dist / minSpeed) * 3600 * 1000;
    const returnTime = new Date(now.getTime() + travelMs);

    await prisma.reinforcement.update({
      where: { id },
      data: { status: 'RECALLED', returnTime },
    });

    res.json({ message: 'Recalled', returnTime });
  } catch (err) {
    console.error('[reinforcement/recall]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reinforcement/:baseId — list active reinforcements for base
router.get('/:baseId', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const [outgoing, incoming] = await Promise.all([
      prisma.reinforcement.findMany({
        where: { fromBaseId: baseId, status: { in: ['IN_TRANSIT', 'ARRIVED', 'RECALLED'] } },
        include: { toBase: { select: { name: true } } },
      }),
      prisma.reinforcement.findMany({
        where: { toBaseId: baseId, status: 'ARRIVED' },
        include: { fromBase: { select: { name: true } } },
      }),
    ]);

    res.json({ outgoing, incoming });
  } catch (err) {
    if (err.message?.includes('does not exist')) return res.json({ outgoing: [], incoming: [] });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/reinforcement/:id/return — receiver returns reinforcements to sender
router.post('/:id/return', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const reinforcement = await prisma.reinforcement.findUnique({ where: { id } });
    if (!reinforcement) return res.status(404).json({ error: 'Not found' });

    // Validate receiver (current user owns the toBase)
    const toBase = await prisma.base.findUnique({ where: { id: reinforcement.toBaseId } });
    if (!toBase || toBase.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (reinforcement.status !== 'ARRIVED') {
      return res.status(400).json({ error: 'Reinforcements must be ARRIVED to be returned' });
    }

    const fromBase = await prisma.base.findUnique({ where: { id: reinforcement.fromBaseId } });
    const dist = calcDistance(fromBase.x, fromBase.y, toBase.x, toBase.y);
    let minSpeed = Infinity;
    for (const [type, qty] of Object.entries(reinforcement.units)) {
      if (qty > 0) minSpeed = Math.min(minSpeed, UNIT_STATS[type]?.speed ?? 80);
    }
    if (minSpeed === Infinity) minSpeed = 80;
    const travelMs = (dist / minSpeed) * 3600 * 1000;
    const returnTime = new Date(Date.now() + travelMs);

    await prisma.reinforcement.update({
      where: { id },
      data: { status: 'RECALLED', returnTime },
    });

    res.json({ message: 'Returning reinforcements', returnTime });
  } catch (err) {
    console.error('[reinforcement/return]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
