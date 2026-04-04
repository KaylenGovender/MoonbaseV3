import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { deductResources, addResources, getResourceRates } from '../services/resourceEngine.js';
import { MINE_SLOTS, ALL_BUILDING_TYPES, ALL_UNIT_TYPES, MAP_BOUNDS } from '../config/gameConfig.js';
import { getBuildingLevelConfig, getMineLevelConfig, getSiloCapacity, constructionYardReduction } from '../services/gameConfigService.js';
import { placeNewBase } from '../services/placementService.js';

const router = Router();

// ── Second Base System ───────────────────────────────────────────────────────
// These MUST be defined before /:id to avoid route collision

// GET /api/base/available-plots — 5 candidate spots for a new base
router.get('/available-plots', requireAuth, async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.status(503).json({ error: 'No active season' });

    const plots = [];
    for (let i = 0; i < 5; i++) {
      const pos = await placeNewBase(season.id);
      plots.push({ id: `plot_${i}`, ...pos });
    }
    res.json({ plots });
  } catch (err) {
    console.error('[available-plots]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/base/claim — claim a new base at given coordinates
router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { x, y } = req.body;
    if (x === undefined || y === undefined) {
      return res.status(400).json({ error: 'x and y required' });
    }

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.status(503).json({ error: 'No active season' });

    const myBases = await prisma.base.findMany({
      where: { userId: req.user.id, seasonId: season.id },
      orderBy: { createdAt: 'asc' },
    });

    // Additional bases (2nd, 3rd, …) require Research Lab L20 on most recent base.
    // First base in a season has no requirement.
    if (myBases.length > 0) {
      const requiredBase = myBases[myBases.length - 1];
      const lab = await prisma.building.findUnique({
        where: { baseId_type: { baseId: requiredBase.id, type: 'RESEARCH_LAB' } },
      });
      if (!lab || (lab.upgradeEndsAt ? lab.level - 1 : lab.level) < 20) {
        return res.status(400).json({ error: 'Research Lab must be Level 20 on your latest base to claim a new one' });
      }
    }

    const { min, max } = MAP_BOUNDS;
    const cx = parseFloat(x), cy = parseFloat(y);
    if (cx < min || cx > max || cy < min || cy > max) {
      return res.status(400).json({ error: 'Coordinates out of map bounds' });
    }

    const allBases = await prisma.base.findMany({ where: { seasonId: season.id } });
    const tooClose = allBases.some((b) => {
      const dx = b.x - cx, dy = b.y - cy;
      return Math.sqrt(dx * dx + dy * dy) < 2;
    });
    if (tooClose) return res.status(400).json({ error: 'Too close to another base' });

    const baseNumber = myBases.length + 1;
    const newBase = await prisma.base.create({
      data: {
        userId:   req.user.id,
        seasonId: season.id,
        name:     `${req.user.username}'s Base${baseNumber > 1 ? ` ${baseNumber}` : ''}`,
        x:        cx,
        y:        cy,
        isMain:   myBases.length === 0,
      },
    });

    for (const type of ALL_BUILDING_TYPES) {
      await prisma.building.create({ data: { baseId: newBase.id, type, level: 1 } });
    }
    await prisma.resourceState.create({
      data: { baseId: newBase.id, oxygen: 1000, water: 1000, iron: 1000, helium3: 1000 },
    });
    for (const [resourceType, slotCount] of Object.entries(MINE_SLOTS)) {
      for (let slot = 1; slot <= slotCount; slot++) {
        await prisma.mine.create({ data: { baseId: newBase.id, resourceType, slot, level: 1 } });
      }
    }
    for (const type of ALL_UNIT_TYPES) {
      await prisma.unitStock.create({ data: { baseId: newBase.id, type, count: 0 } });
    }

    res.status(201).json({ base: { id: newBase.id, name: newBase.name, x: newBase.x, y: newBase.y } });
  } catch (err) {
    console.error('[base/claim]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/base/:id/transfer — instant transfer of resources and/or units between own bases
router.post('/:id/transfer', requireAuth, async (req, res) => {
  try {
    const { id: fromBaseId } = req.params;
    const { toBaseId, resources = {}, units = {} } = req.body;

    if (!toBaseId) return res.status(400).json({ error: 'toBaseId required' });
    if (fromBaseId === toBaseId) return res.status(400).json({ error: 'Cannot transfer to the same base' });

    const [fromBase, toBase] = await Promise.all([
      prisma.base.findUnique({ where: { id: fromBaseId } }),
      prisma.base.findUnique({ where: { id: toBaseId } }),
    ]);

    if (!fromBase || fromBase.userId !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    if (!toBase || toBase.userId !== req.user.id)
      return res.status(403).json({ error: 'You can only transfer to your own bases' });

    // ── Resources ──────────────────────────────────────────────────────────────
    const resAmounts = {
      oxygen:  Math.max(0, Math.floor(resources.oxygen  || 0)),
      water:   Math.max(0, Math.floor(resources.water   || 0)),
      iron:    Math.max(0, Math.floor(resources.iron    || 0)),
      helium3: Math.max(0, Math.floor(resources.helium3 || 0)),
    };
    const totalRes = Object.values(resAmounts).reduce((a, b) => a + b, 0);

    if (totalRes > 0) {
      // Wrap in transaction to prevent resource loss if addResources fails
      await prisma.$transaction(async () => {
        const ok = await deductResources(fromBaseId, resAmounts);
        if (!ok) throw new Error('Insufficient resources');
        await addResources(toBaseId, resAmounts);
      });
    }

    // ── Units (atomic transaction to prevent race conditions) ─────────────
    const unitEntries = Object.entries(units).filter(([type, qty]) => {
      if (Math.floor(qty) <= 0) return false;
      if (!ALL_UNIT_TYPES.includes(type)) return false;
      return true;
    });

    if (unitEntries.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const [type, qty] of unitEntries) {
          const amount = Math.floor(qty);
          const fromStock = await tx.unitStock.findUnique({
            where: { baseId_type: { baseId: fromBaseId, type } },
          });
          if (!fromStock || fromStock.count < amount) {
            throw new Error(`Not enough ${type} to transfer`);
          }
          await tx.unitStock.update({
            where: { baseId_type: { baseId: fromBaseId, type } },
            data: { count: { decrement: amount } },
          });
          await tx.unitStock.upsert({
            where: { baseId_type: { baseId: toBaseId, type } },
            create: { baseId: toBaseId, type, count: amount },
            update: { count: { increment: amount } },
          });
        }
      });
    }

    res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Insufficient resources') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[base/transfer]', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// GET /api/base/:id — full base overview
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const base = await prisma.base.findUnique({
      where: { id: req.params.id },
      include: {
        season: { select: { id: true, name: true } },
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

    const nextLevel = building.level + 1;
    const config = getBuildingLevelConfig(type)[nextLevel - 1];
    if (!config) return res.status(400).json({ error: 'Invalid building type' });

    // Apply Construction Yard reduction (use effective level — not the target during upgrade)
    const cyBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'CONSTRUCTION_YARD' } },
    });
    const cyEffectiveLevel = cyBuilding?.upgradeEndsAt ? cyBuilding.level - 1 : cyBuilding?.level ?? 0;
    const reduction = constructionYardReduction(cyEffectiveLevel) / 100;
    const timeSeconds = Math.round(config.timeSeconds * (1 - reduction));

    const ok = await deductResources(baseId, {
      oxygen:  config.oxygen,
      water:   config.water,
      iron:    config.iron,
      helium3: config.helium3,
    });
    if (!ok) return res.status(400).json({ error: 'Insufficient resources' });

    // Queue after the last building upgrade in progress
    const lastQueued = await prisma.building.findFirst({
      where: { baseId, upgradeEndsAt: { not: null } },
      orderBy: { upgradeEndsAt: 'desc' },
    });
    const startAfter = lastQueued?.upgradeEndsAt ? new Date(lastQueued.upgradeEndsAt) : new Date();
    const upgradeEndsAt = new Date(startAfter.getTime() + timeSeconds * 1000);

    // Atomic: only set upgrade if not already upgrading (prevents double-queue race)
    const rowsUpdated = await prisma.$executeRawUnsafe(
      `UPDATE "Building" SET "level" = $1, "upgradeEndsAt" = $2
       WHERE "baseId" = $3 AND "type" = $4::"BuildingType" AND "upgradeEndsAt" IS NULL`,
      nextLevel, upgradeEndsAt, baseId, type
    );
    if (rowsUpdated === 0) {
      // Race: another request already queued this upgrade — refund resources
      await addResources(baseId, { oxygen: config.oxygen, water: config.water, iron: config.iron, helium3: config.helium3 });
      return res.status(400).json({ error: 'Already upgrading this building' });
    }

    const updated = await prisma.building.findUnique({ where: { baseId_type: { baseId, type } } });

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
    const config = getMineLevelConfig(mine.resourceType)[nextLevel - 1];
    if (!config) return res.status(400).json({ error: 'Invalid' });

    const cyBuilding = await prisma.building.findUnique({
      where: { baseId_type: { baseId, type: 'CONSTRUCTION_YARD' } },
    });
    const cyEffectiveLevel = cyBuilding?.upgradeEndsAt ? cyBuilding.level - 1 : cyBuilding?.level ?? 0;
    const reduction = constructionYardReduction(cyEffectiveLevel) / 100;
    const timeSeconds = Math.round(config.timeSeconds * (1 - reduction));

    const ok = await deductResources(baseId, {
      oxygen:  config.oxygen,
      water:   config.water,
      iron:    config.iron,
      helium3: config.helium3,
    });
    if (!ok) return res.status(400).json({ error: 'Insufficient resources' });

    // Queue after the last mine upgrade in progress
    const lastQueued = await prisma.mine.findFirst({
      where: { baseId, upgradeEndsAt: { not: null } },
      orderBy: { upgradeEndsAt: 'desc' },
    });
    const startAfter = lastQueued?.upgradeEndsAt ? new Date(lastQueued.upgradeEndsAt) : new Date();
    const upgradeEndsAt = new Date(startAfter.getTime() + timeSeconds * 1000);

    // Atomic: only set upgrade if not already upgrading (prevents double-queue race)
    const rowsUpdated = await prisma.$executeRawUnsafe(
      `UPDATE "Mine" SET "level" = $1, "upgradeEndsAt" = $2
       WHERE "id" = $3 AND "upgradeEndsAt" IS NULL`,
      nextLevel, upgradeEndsAt, mineId
    );
    if (rowsUpdated === 0) {
      await addResources(baseId, { oxygen: config.oxygen, water: config.water, iron: config.iron, helium3: config.helium3 });
      return res.status(400).json({ error: 'Mine already upgrading' });
    }

    const updated = await prisma.mine.findUnique({ where: { id: mineId } });

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
    const cap = getSiloCapacity(siloBuilding?.upgradeEndsAt ? siloBuilding.level - 1 : siloBuilding?.level ?? 0);
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
