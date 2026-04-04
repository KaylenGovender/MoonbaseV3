import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { ALL_BUILDING_TYPES, ALL_UNIT_TYPES, MINE_SLOTS } from '../config/gameConfig.js';
import { getConfig, setConfig } from '../services/serverConfig.js';
import { getGameConfig, updateGameConfigSection } from '../services/gameConfigService.js';
import { awardVictoryMedals } from '../services/medalService.js';

const ADMIN_USERNAME = 'Ulquiorra07';

/**
 * Ensure the Ulquiorra07 admin base exists at (0,0) for the given season.
 * Called whenever a season is created or activated.
 */
async function seedAdminBase(seasonId) {
  const adminUser = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (!adminUser) return; // user not yet created — skip silently

  const existing = await prisma.base.findFirst({
    where: { userId: adminUser.id, seasonId },
  });
  if (existing) return;

  const base = await prisma.base.create({
    data: {
      userId: adminUser.id,
      seasonId,
      name: `${ADMIN_USERNAME}'s Base`,
      x: 0,
      y: 0,
      isAdmin: true,
      isMain: true,
    },
  });

  for (const type of ALL_BUILDING_TYPES) {
    await prisma.building.upsert({
      where: { baseId_type: { baseId: base.id, type } },
      update: {},
      create: { baseId: base.id, type, level: 1 },
    });
  }
  await prisma.resourceState.upsert({
    where: { baseId: base.id },
    update: {},
    create: { baseId: base.id, oxygen: 999999, water: 999999, iron: 999999, helium3: 999999 },
  });
  for (const [resourceType, slotCount] of Object.entries(MINE_SLOTS)) {
    for (let slot = 1; slot <= slotCount; slot++) {
      await prisma.mine.upsert({
        where: { baseId_resourceType_slot: { baseId: base.id, resourceType, slot } },
        update: {},
        create: { baseId: base.id, resourceType, slot, level: 1 },
      });
    }
  }
  for (const type of ALL_UNIT_TYPES) {
    await prisma.unitStock.upsert({
      where: { baseId_type: { baseId: base.id, type } },
      update: {},
      create: { baseId: base.id, type, count: 0 },
    });
  }
}

// Helper: recalculate populationPoints for a base from actual building/mine levels
async function recalcPopulationPoints(baseId) {
  const [buildings, mines] = await Promise.all([
    prisma.building.findMany({ where: { baseId }, select: { level: true } }),
    prisma.mine.findMany({ where: { baseId }, select: { level: true } }),
  ]);
  const pts = [...buildings, ...mines].reduce((s, r) => s + (r.level * (r.level + 1)) / 2, 0);
  await prisma.base.update({ where: { id: baseId }, data: { populationPoints: pts } });
}

const router = Router();

// ── Users ──────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.user.findMany({
      select: { id: true, username: true, email: true, isAdmin: true, isBanned: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, email, isAdmin, isBanned } = req.body;
    const row = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(username   !== undefined && { username }),
        ...(email      !== undefined && { email }),
        ...(isAdmin    !== undefined && { isAdmin:    isAdmin    === 'true' || isAdmin    === true }),
        ...(isBanned   !== undefined && { isBanned:   isBanned   === 'true' || isBanned   === true }),
      },
    });
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.id;
    // Remove from alliance memberships; if leader, disband alliance
    const memberships = await prisma.allianceMember.findMany({ where: { userId: uid } });
    for (const m of memberships) {
      const alliance = await prisma.alliance.findUnique({ where: { id: m.allianceId } });
      if (alliance?.leaderId === uid) {
        // Disband — remove all members then alliance
        await prisma.allianceMember.deleteMany({ where: { allianceId: m.allianceId } });
        await prisma.alliance.delete({ where: { id: m.allianceId } });
      } else {
        await prisma.allianceMember.delete({ where: { allianceId_userId: { allianceId: m.allianceId, userId: uid } } });
        // Clean up empty alliances
        const remaining = await prisma.allianceMember.count({ where: { allianceId: m.allianceId } });
        if (remaining === 0) await prisma.alliance.delete({ where: { id: m.allianceId } });
      }
    }
    await prisma.user.delete({ where: { id: uid } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Seasons ────────────────────────────────────────────────────────────────────

/**
 * Auto-generate WeekConfig rows for a season (7-day intervals from startDate to endDate).
 * If weeks already exist, skips. If regenerate=true, replaces all existing weeks.
 */
async function seedWeekConfigs(season, regenerate = false) {
  try {
    if (regenerate) {
      await prisma.weekConfig.deleteMany({ where: { seasonId: season.id } });
    } else {
      const existing = await prisma.weekConfig.count({ where: { seasonId: season.id } });
      if (existing > 0) return; // already seeded
    }

    const start   = new Date(season.startDate);
    const end     = new Date(season.endDate);
    let weekNum   = 1;
    // Each week ends 7 days after the previous; first week ends 7 days after season start
    let weekEnd   = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    while (weekEnd <= end) {
      await prisma.weekConfig.create({
        data: { seasonId: season.id, weekNumber: weekNum, endDate: weekEnd },
      });
      weekNum++;
      weekEnd = new Date(weekEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    console.log(`📅 Created ${weekNum - 1} week config(s) for season "${season.name}"`);
  } catch (e) {
    // Table may not exist yet — suppress until SQL migration is run
    if (!e.message?.includes('does not exist')) console.error('[seedWeekConfigs]', e.message);
  }
}

router.get('/seasons', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.season.findMany({ orderBy: { startDate: 'desc' } });
    res.json({ rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.post('/season', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, startDate, endDate, activate } = req.body;
    if (!name || !startDate || !endDate) return res.status(400).json({ error: 'name, startDate, endDate required' });
    if (activate) await prisma.season.updateMany({ data: { isActive: false } });
    const row = await prisma.season.create({
      data: { name, startDate: new Date(startDate), endDate: new Date(endDate), isActive: activate ?? false },
    });
    if (activate) await seedAdminBase(row.id);
    await seedWeekConfigs(row); // auto-create weeks for new season
    res.status(201).json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/seasons/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, startDate, endDate, isActive } = req.body;
    const activating = isActive === 'true' || isActive === true;
    if (activating) {
      await prisma.season.updateMany({ where: { NOT: { id: req.params.id } }, data: { isActive: false } });
    }
    const row = await prisma.season.update({
      where: { id: req.params.id },
      data: {
        ...(name      && { name }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate   && { endDate:   new Date(endDate) }),
        ...(isActive  !== undefined && { isActive: activating }),
      },
    });
    if (activating) await seedAdminBase(row.id);
    await seedWeekConfigs(row); // create weeks if none exist
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/seasons/:id/regenerate-weeks — delete and recreate all week configs
router.post('/seasons/:id/regenerate-weeks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const season = await prisma.season.findUnique({ where: { id: req.params.id } });
    if (!season) return res.status(404).json({ error: 'Season not found' });
    await seedWeekConfigs(season, true);
    const rows = await prisma.weekConfig.findMany({
      where: { seasonId: req.params.id },
      orderBy: { weekNumber: 'desc' },
    });
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/seasons/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const seasonId = req.params.id;

    // Cascade-delete all season data in dependency order
    const bases = await prisma.base.findMany({ where: { seasonId }, select: { id: true } });
    const baseIds = bases.map((b) => b.id);

    if (baseIds.length > 0) {
      const attacks = await prisma.attack.findMany({
        where: { OR: [{ attackerBaseId: { in: baseIds } }, { defenderBaseId: { in: baseIds } }] },
        select: { id: true },
      });
      const attackIds = attacks.map((a) => a.id);
      if (attackIds.length > 0) {
        await prisma.battleReport.deleteMany({ where: { attackId: { in: attackIds } } });
        await prisma.attack.deleteMany({ where: { id: { in: attackIds } } });
      }
      await prisma.tradePod.deleteMany({ where: { OR: [{ fromBaseId: { in: baseIds } }, { toBaseId: { in: baseIds } }] } });
      await prisma.reinforcement.deleteMany({ where: { OR: [{ fromBaseId: { in: baseIds } }, { toBaseId: { in: baseIds } }] } });
      await prisma.buildQueue.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.unitStock.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.building.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.mine.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.resourceState.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.base.deleteMany({ where: { id: { in: baseIds } } });
    }

    await prisma.medal.deleteMany({ where: { seasonId } });
    await prisma.leaderboardSnapshot.deleteMany({ where: { seasonId } });

    const alliances = await prisma.alliance.findMany({ where: { seasonId }, select: { id: true } });
    const allianceIds = alliances.map((a) => a.id);
    if (allianceIds.length > 0) {
      await prisma.chatMessage.deleteMany({ where: { allianceId: { in: allianceIds } } });
      await prisma.allianceInvite.deleteMany({ where: { allianceId: { in: allianceIds } } });
      await prisma.allianceMember.deleteMany({ where: { allianceId: { in: allianceIds } } });
      await prisma.alliance.deleteMany({ where: { id: { in: allianceIds } } });
    }

    try { await prisma.weekConfig.deleteMany({ where: { seasonId } }); } catch { /* table may not exist */ }

    await prisma.season.delete({ where: { id: seasonId } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bases ──────────────────────────────────────────────────────────────────────
router.get('/bases', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.base.findMany({
      select: { id: true, name: true, x: true, y: true, isAdmin: true, userId: true, seasonId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/bases/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, x, y } = req.body;
    const row = await prisma.base.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(x    !== undefined && { x: parseFloat(x) }),
        ...(y    !== undefined && { y: parseFloat(y) }),
      },
    });
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bases/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.base.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Buildings ──────────────────────────────────────────────────────────────────
router.get('/buildings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.building.findMany({
      select: { id: true, baseId: true, type: true, level: true, upgradeEndsAt: true },
      orderBy: { baseId: 'asc' },
      take: 200,
    });
    res.json({ rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/buildings/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { level } = req.body;
    const parsedLevel = parseInt(level);
    if (parsedLevel < 0 || parsedLevel > 20) return res.status(400).json({ error: 'Level must be 0-20' });
    const row = await prisma.building.update({
      where: { id: req.params.id },
      data: { ...(level !== undefined && { level: parsedLevel }) },
    });
    await recalcPopulationPoints(row.baseId);
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Mines ──────────────────────────────────────────────────────────────────────
router.get('/mines', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.mine.findMany({
      select: { id: true, baseId: true, resourceType: true, slot: true, level: true, upgradeEndsAt: true },
      orderBy: { baseId: 'asc' },
      take: 200,
    });
    res.json({ rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/mines/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { level } = req.body;
    const parsedLevel = parseInt(level);
    if (parsedLevel < 0 || parsedLevel > 20) return res.status(400).json({ error: 'Level must be 0-20' });
    const row = await prisma.mine.update({
      where: { id: req.params.id },
      data: { ...(level !== undefined && { level: parsedLevel }) },
    });
    await recalcPopulationPoints(row.baseId);
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Unit Stocks ────────────────────────────────────────────────────────────────
router.get('/units', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.unitStock.findMany({
      select: { id: true, baseId: true, type: true, count: true },
      orderBy: { baseId: 'asc' },
      take: 200,
    });
    res.json({ rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

router.put('/units/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { count } = req.body;
    const row = await prisma.unitStock.update({
      where: { id: req.params.id },
      data: { ...(count !== undefined && { count: parseInt(count) }) },
    });
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/season/:id/end — deactivate season + award victory medals to winning alliance
router.post('/season/:id/end', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    await prisma.season.update({ where: { id: seasonId }, data: { isActive: false } });
    const winningAlliance = await awardVictoryMedals(seasonId);
    res.json({ ok: true, winningAlliance });
  } catch (err) {
    console.error('[admin/season/end]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Player profile (search + full detail) ─────────────────────────────────────
router.get('/players/search', requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q ?? '').trim();
    const users = await prisma.user.findMany({
      where: q ? { username: { contains: q, mode: 'insensitive' } } : {},
      select: { id: true, username: true, email: true, isAdmin: true, isBanned: true, createdAt: true },
      orderBy: { username: 'asc' },
      take: 50,
    });
    res.json({ users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/players/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, username: true, email: true, isAdmin: true, isBanned: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });

    // Only show bases for the active season (old season bases stay in DB but are not shown)
    const activeSeason = await prisma.season.findFirst({ where: { isActive: true } });
    const bases = await prisma.base.findMany({
      where: {
        userId: req.params.userId,
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      include: {
        buildings:    { orderBy: { type: 'asc' } },
        mines:        { orderBy: [{ resourceType: 'asc' }, { slot: 'asc' }] },
        unitStocks:   { orderBy: { type: 'asc' } },
        resourceState: true,
        season: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const medals = await prisma.medal.findMany({
      where: { userId: req.params.userId },
      include: { season: { select: { name: true } } },
      orderBy: [{ seasonId: 'asc' }, { weekNumber: 'asc' }],
    });
    // Lifetime victory medals across all seasons
    const lifetimeVictoryMedals = medals.filter((m) => m.weekNumber === 0).length;
    res.json({ user, bases, medals, lifetimeVictoryMedals });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/players/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, email, isAdmin, isBanned } = req.body;
    const row = await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        ...(username !== undefined && { username }),
        ...(email    !== undefined && { email }),
        ...(isAdmin  !== undefined && { isAdmin:  isAdmin  === 'true' || isAdmin  === true }),
        ...(isBanned !== undefined && { isBanned: isBanned === 'true' || isBanned === true }),
      },
      select: { id: true, username: true, email: true, isAdmin: true, isBanned: true },
    });
    res.json({ row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/players/:userId/resources/:baseId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { oxygen, water, iron, helium3 } = req.body;
    const row = await prisma.resourceState.upsert({
      where: { baseId: req.params.baseId },
      update: {
        ...(oxygen  !== undefined && { oxygen:  parseFloat(oxygen)  }),
        ...(water   !== undefined && { water:   parseFloat(water)   }),
        ...(iron    !== undefined && { iron:    parseFloat(iron)    }),
        ...(helium3 !== undefined && { helium3: parseFloat(helium3) }),
      },
      create: { baseId: req.params.baseId, oxygen: 0, water: 0, iron: 0, helium3: 0 },
    });
    res.json({ row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reset gameplay (preserve selected + admin users) ──────────────────────────
router.post('/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { preserveUserIds = [] } = req.body;
    const adminUsers = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    const safeIds = [...new Set([...preserveUserIds, ...adminUsers.map((u) => u.id)])];

    const basesToDelete = await prisma.base.findMany({
      where: { userId: { notIn: safeIds } },
      select: { id: true },
    });
    const baseIds = basesToDelete.map((b) => b.id);

    if (baseIds.length > 0) {
      // Get attacks touching these bases, delete battle reports first
      const attacks = await prisma.attack.findMany({
        where: { OR: [{ attackerBaseId: { in: baseIds } }, { defenderBaseId: { in: baseIds } }] },
        select: { id: true },
      });
      const attackIds = attacks.map((a) => a.id);
      if (attackIds.length > 0) {
        await prisma.battleReport.deleteMany({ where: { attackId: { in: attackIds } } });
        await prisma.attack.deleteMany({ where: { id: { in: attackIds } } });
      }
      await prisma.tradePod.deleteMany({ where: { OR: [{ fromBaseId: { in: baseIds } }, { toBaseId: { in: baseIds } }] } });
      await prisma.reinforcement.deleteMany({ where: { OR: [{ fromBaseId: { in: baseIds } }, { toBaseId: { in: baseIds } }] } });
      await prisma.buildQueue.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.unitStock.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.mine.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.building.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.resourceState.deleteMany({ where: { baseId: { in: baseIds } } });
      await prisma.base.deleteMany({ where: { id: { in: baseIds } } });
    }

    await prisma.medal.deleteMany({ where: { userId: { notIn: safeIds } } });
    await prisma.allianceMember.deleteMany({ where: { userId: { notIn: safeIds } } });

    // Clean up alliances with no members or dangling leaderId
    const allAlliances = await prisma.alliance.findMany({ include: { members: true } });
    for (const a of allAlliances) {
      if (a.members.length === 0) {
        await prisma.alliance.delete({ where: { id: a.id } });
      }
    }

    res.json({ ok: true, basesReset: baseIds.length });
  } catch (err) {
    console.error('[admin/reset]', err);
    res.status(500).json({ error: err.message });
  }
});

// Legacy ban route
router.put('/users/:id/ban', requireAuth, requireAdmin, async (req, res) => {
  try {
    const row = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: req.body.banned ?? true },
    });
    res.json({ row: { id: row.id, isBanned: row.isBanned } });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Week Config ────────────────────────────────────────────────────────────────
router.get('/season/:seasonId/weeks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.weekConfig.findMany({
      where: { seasonId: req.params.seasonId },
      orderBy: { weekNumber: 'desc' },
    });
    res.json({ rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/season/:seasonId/weeks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { weekNumber, endDate } = req.body;
    if (!weekNumber || !endDate) return res.status(400).json({ error: 'weekNumber and endDate required' });
    const row = await prisma.weekConfig.create({
      data: {
        seasonId:   req.params.seasonId,
        weekNumber: parseInt(weekNumber),
        endDate:    new Date(endDate),
      },
    });
    res.status(201).json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/week-configs/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { endDate } = req.body;
    const row = await prisma.weekConfig.update({
      where: { id: req.params.id },
      data: { endDate: new Date(endDate) },
    });
    res.json({ row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/week-configs/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.weekConfig.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Server Config (Protection Toggle) ─────────────────────────────────────────
router.get('/config/protection', requireAuth, requireAdmin, async (req, res) => {
  try {
    const value = await getConfig('protection_enabled', 'true');
    res.json({ enabled: value === 'true' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/config/protection', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    await setConfig('protection_enabled', enabled ? 'true' : 'false');
    res.json({ enabled: !!enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Game Config ──────────────────────────────────────────────────────────────

// GET /admin/game-config
router.get('/game-config', requireAuth, requireAdmin, (_req, res) => {
  res.json(getGameConfig());
});

// PUT /admin/game-config/:section
router.put('/game-config/:section', requireAuth, requireAdmin, async (req, res) => {
  try {
    await updateGameConfigSection(req.params.section, req.body);
    res.json({ ok: true, config: getGameConfig() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
