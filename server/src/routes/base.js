import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { deductResources, getResourceRates } from '../services/resourceEngine.js';
import {
  BUILDING_CONFIG,
  MINE_CONFIG,
  MINE_SLOTS,
  constructionYardReduction,
  mineRate,
  siloCapacity,
} from '../config/gameConfig.js';

const router = Router();

// GET /api/base/:id — full base overview
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const base = await prisma.base.findUnique({
      where: { id: req.params.id },
      include: {
        buildings: true,
        resourceState: true,
        mines: true,
        unitStocks: true,
        buildQueues: { where: { completed: false }, orderBy: { startedAt: 'asc' } },
        attacksLaunched: {
          where: { status: { in: ['IN_FLIGHT', 'RETURNING'] } },
          include: { defenderBase: { select: { name: true, userId: true } } },
          orderBy: { launchTime: 'asc' },
        },
        attacksReceived: {
          where: { status: 'IN_FLIGHT' },
          include: { attackerBase: { select: { name: true, userId: true } } },
          orderBy: { arrivalTime: 'asc' },
        },
        tradePodsOut: {
          where: { status: 'IN_TRANSIT' },
          include: { toBase: { select: { name: true } } },
        },
        tradePodsIn: {
          where: { status: 'IN_TRANSIT' },
          include: { fromBase: { select: { name: true } } },
        },
      },
    });

    if (!base) return res.status(404).json({ error: 'Base not found' });
    if (base.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Last 20 battle reports (in + out) — include RETURNING (report exists) + COMPLETED
    const recentAttacks = await prisma.attack.findMany({
      where: {
        OR: [
          { attackerBaseId: base.id },
          { defenderBaseId: base.id },
        ],
        status: { in: ['RETURNING', 'COMPLETED'] },
        battleReport: { isNot: null },
      },
      include: {
        battleReport: true,
        attackerBase: { select: { name: true } },
        defenderBase: { select: { name: true } },
      },
      orderBy: { launchTime: 'desc' },
      take: 20,
    });

    const rates = await getResourceRates(base.id);

    res.json({ base, rates, recentAttacks });
  } catch (err) {
    console.error('[base GET]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/base/:id/building/:type/upgrade
router.post('/:id/building/:type/upgrade', requireAuth, async (req, res) => {
  try {
    const { id: baseId, type } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const building = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type } },
    });
    if (!building) return res.status(404).json({ error: 'Building not found' });
    if (building.level >= 20) return res.status(400).json({ error: 'Already max level' });
    if (building.upgradeEndsAt) {
      return res.status(400).json({ error: 'Already upgrading this building' });
    }

    // Check if any other building is already upgrading
    const inProgress = await prisma.building.findFirst({
      where: { baseId, upgradeEndsAt: { not: null } },
    });
    if (inProgress) {
      return res.status(400).json({ error: 'Another building is already upgrading' });
    }

    const nextLevel = building.level + 1;
    const config = BUILDING_CONFIG[type]?.[nextLevel - 1];
    if (!config) return res.status(400).json({ error: 'Invalid building type' });

    // Apply Construction Yard reduction
    const cyBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'CONSTRUCTION_YARD' } },
    });
    const reduction = constructionYardReduction(cyBuilding?.level ?? 0) / 100;
    const timeSeconds = Math.round(config.timeSeconds * (1 - reduction));

    const ok = await deductResources(baseId, {
      oxygen:  config.oxygen,
      water:   config.water,
      iron:    config.iron,
      helium3: config.helium3,
    });
    if (!ok) return res.status(400).json({ error: 'Insufficient resources' });

    const upgradeEndsAt = new Date(Date.now() + timeSeconds * 1000);
    const updated = await prisma.building.update({
      where: { baseId_type: { baseId, type } },
      data: { level: nextLevel, upgradeEndsAt },
    });

    res.json({ building: updated });
  } catch (err) {
    console.error('[building upgrade]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/base/:id/mine/:mineId/upgrade
router.post('/:id/mine/:mineId/upgrade', requireAuth, async (req, res) => {
  try {
    const { id: baseId, mineId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const mine = await prisma.mine.findUnique({ where: { id: mineId } });
    if (!mine || mine.baseId !== baseId) {
      return res.status(404).json({ error: 'Mine not found' });
    }
    if (mine.level >= 20) return res.status(400).json({ error: 'Mine at max level' });
    if (mine.upgradeEndsAt) {
      return res.status(400).json({ error: 'Mine already upgrading' });
    }

    const nextLevel = mine.level + 1;
    const config = MINE_CONFIG[mine.resourceType]?.[nextLevel - 1];
    if (!config) return res.status(400).json({ error: 'Invalid' });

    const cyBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'CONSTRUCTION_YARD' } },
    });
    const reduction = constructionYardReduction(cyBuilding?.level ?? 0) / 100;
    const timeSeconds = Math.round(config.timeSeconds * (1 - reduction));

    const ok = await deductResources(baseId, {
      oxygen:  config.oxygen,
      water:   config.water,
      iron:    config.iron,
      helium3: config.helium3,
    });
    if (!ok) return res.status(400).json({ error: 'Insufficient resources' });

    const upgradeEndsAt = new Date(Date.now() + timeSeconds * 1000);
    const updated = await prisma.mine.update({
      where: { id: mineId },
      data: { level: nextLevel, upgradeEndsAt },
    });

    res.json({ mine: updated });
  } catch (err) {
    console.error('[mine upgrade]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/base/:id/resources
router.get('/:id/resources', requireAuth, async (req, res) => {
  try {
    const { id: baseId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const resourceState = await prisma.resourceState.findUnique({ where: { baseId } });
    const mines = await prisma.mine.findMany({ where: { baseId } });
    const siloBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'SILO' } },
    });
    const rates = await getResourceRates(baseId);
    const cap = siloCapacity(siloBuilding?.level ?? 0);
    res.json({ resourceState, rates, capacity: cap, mines });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/base/:id/buildings
router.get('/:id/buildings', requireAuth, async (req, res) => {
  try {
    const { id: baseId } = req.params;
    const base = await prisma.base.findUnique({ where: { id: baseId } });
    if (!base || base.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const buildings = await prisma.building.findMany({ where: { baseId } });
    res.json({ buildings });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
