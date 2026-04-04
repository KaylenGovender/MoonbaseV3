import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { deductResources, addResources } from '../services/resourceEngine.js';
import { getTradePodSpeed } from '../services/gameConfigService.js';
import { distanceBetween } from '../services/placementService.js';

const router = Router();

// POST /api/tradepod/:baseId/send
router.post('/:baseId/send', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const { toBaseId, resources } = req.body; // resources: { oxygen, water, iron, helium3 }

    const fromBase = await prisma.base.findUnique({ where: { id: baseId } });
    if (!fromBase || fromBase.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const tradePodBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'TRADE_POD' } },
    });
    if (!tradePodBuilding || tradePodBuilding.level === 0) {
      return res.status(400).json({ error: 'Trade Pod building required' });
    }

    const toBase = await prisma.base.findUnique({ where: { id: toBaseId } });
    if (!toBase) return res.status(404).json({ error: 'Destination not found' });

    // Must be own base or alliance member
    if (toBase.userId !== req.user.id) {
      const season = await prisma.season.findFirst({ where: { isActive: true } });
      const membership = await prisma.allianceMember.findFirst({
        where: { userId: req.user.id },
      });
      if (membership) {
        const targetMembership = await prisma.allianceMember.findFirst({
          where: { userId: toBase.userId, allianceId: membership.allianceId },
        });
        if (!targetMembership) {
          return res.status(400).json({ error: 'Can only send to own bases or alliance members' });
        }
      } else {
        return res.status(400).json({ error: 'Can only send to own bases or alliance members' });
      }
    }

    const totalAmount =
      (resources.oxygen || 0) + (resources.water || 0) +
      (resources.iron   || 0) + (resources.helium3 || 0);
    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'No resources to send' });
    }

    const ok = await deductResources(baseId, {
      oxygen:  resources.oxygen  || 0,
      water:   resources.water   || 0,
      iron:    resources.iron    || 0,
      helium3: resources.helium3 || 0,
    });
    if (!ok) return res.status(400).json({ error: 'Insufficient resources' });

    const dist = distanceBetween(fromBase.x, fromBase.y, toBase.x, toBase.y);
    const travelHours = dist / getTradePodSpeed();
    const travelMs = travelHours * 3600 * 1000;
    const arrivalTime = new Date(Date.now() + travelMs);

    const pod = await prisma.tradePod.create({
      data: {
        fromBaseId: baseId,
        toBaseId,
        resources:  {
          oxygen:  resources.oxygen  || 0,
          water:   resources.water   || 0,
          iron:    resources.iron    || 0,
          helium3: resources.helium3 || 0,
        },
        arrivalTime,
        status: 'IN_TRANSIT',
      },
    });

    res.status(201).json({ pod, eta: arrivalTime });
  } catch (err) {
    console.error('[tradepod/send]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tradepod/:baseId — list active pods for a base
router.get('/:baseId', requireAuth, async (req, res) => {
  try {
    const { baseId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const pods = await prisma.tradePod.findMany({
      where: {
        OR: [{ fromBaseId: baseId }, { toBaseId: baseId }],
        status: 'IN_TRANSIT',
      },
      include: {
        fromBase: { select: { id: true, name: true } },
        toBase:   { select: { id: true, name: true } },
      },
    });
    res.json({ pods });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
