import { Router } from 'express';
import { prisma } from '../prisma/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function getPopulationLeaderboard(seasonId, limit = 100) {
  const bases = await prisma.base.findMany({
    where: { seasonId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { populationPoints: 'desc' },
    take: limit * 3, // may have multiple bases per user
  });

  // Aggregate per user
  const byUser = {};
  for (const base of bases) {
    if (!byUser[base.userId]) {
      byUser[base.userId] = { userId: base.userId, username: base.user.username, points: 0 };
    }
    byUser[base.userId].points += base.populationPoints;
  }

  return Object.values(byUser)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, ...e }));
}

// GET /api/leaderboard/population
router.get('/population', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({ entries: [] });
    const entries = await getPopulationLeaderboard(season.id);
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboard/medals?type=attacker|defender|raider
// Shows only the CURRENT (not-yet-awarded) week's points so the board resets after medals are given.
router.get('/medals', async (req, res) => {
  try {
    const { type = 'attacker' } = req.query;
    const fieldMap = {
      attacker: 'attackerPoints',
      defender: 'defenderPoints',
      raider:   'raiderPoints',
    };
    const field = fieldMap[type];
    if (!field) return res.status(400).json({ error: 'Invalid type' });

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({ entries: [] });

    // Find the current (not-yet-awarded) week — earliest week whose endDate is in the future
    let currentWeekNumber = null;
    try {
      const currentWeek = await prisma.weekConfig.findFirst({
        where: { seasonId: season.id, endDate: { gt: new Date() } },
        orderBy: { weekNumber: 'asc' },
      });
      if (currentWeek) currentWeekNumber = currentWeek.weekNumber;
    } catch { /* WeekConfig table may not exist */ }

    const medals = await prisma.medal.findMany({
      where: {
        seasonId: season.id,
        // Only count current week; if no week configured show season totals
        ...(currentWeekNumber !== null ? { weekNumber: currentWeekNumber } : {}),
      },
      include: { user: { select: { id: true, username: true } } },
    });

    // Aggregate per user
    const byUser = {};
    for (const m of medals) {
      if (!byUser[m.userId]) {
        byUser[m.userId] = { userId: m.userId, username: m.user.username, points: 0 };
      }
      byUser[m.userId].points += m[field];
    }

    const entries = Object.values(byUser)
      .sort((a, b) => b.points - a.points)
      .slice(0, 100)
      .map((e, i) => ({ rank: i + 1, ...e }));

    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboard/my-rank — current user's rank info
router.get('/my-rank', requireAuth, async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({});

    const population = await getPopulationLeaderboard(season.id, 10000);
    const myPop = population.find((e) => e.userId === req.user.id);

    const medals = await prisma.medal.findMany({
      where: { userId: req.user.id, seasonId: season.id },
    });
    const totalAttacker = medals.reduce((s, m) => s + m.attackerPoints, 0);
    const totalDefender = medals.reduce((s, m) => s + m.defenderPoints, 0);
    const totalRaider   = medals.reduce((s, m) => s + m.raiderPoints, 0);

    res.json({
      populationRank:   myPop?.rank ?? null,
      populationPoints: myPop?.points ?? 0,
      attackerMedals:   totalAttacker,
      defenderMedals:   totalDefender,
      raiderMedals:     totalRaider,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboard/user/:userId — public player profile
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const medals = await prisma.medal.findMany({
      where: { userId, seasonId: season.id },
    });

    // Count weeks where they were top (rewardGiven = true for those)
    const attackerMedals = medals.filter((m) => m.rewardGiven && m.attackerPoints > 0).length;
    const defenderMedals = medals.filter((m) => m.rewardGiven && m.defenderPoints > 0).length;
    const raiderMedals   = medals.filter((m) => m.rewardGiven && m.raiderPoints > 0).length;
    const victoryMedals  = medals.filter((m) => m.rewardGiven && m.weekNumber === 0).length;

    // Lifetime medal counts across ALL seasons
    const allMedals = await prisma.medal.findMany({ where: { userId } });
    const lifetimeAttackerMedals = allMedals.filter((m) => m.rewardGiven && m.attackerPoints > 0).length;
    const lifetimeDefenderMedals = allMedals.filter((m) => m.rewardGiven && m.defenderPoints > 0).length;
    const lifetimeRaiderMedals   = allMedals.filter((m) => m.rewardGiven && m.raiderPoints > 0).length;
    const lifetimeVictoryMedals  = allMedals.filter((m) => m.rewardGiven && m.weekNumber === 0).length;

    const totalAttacker = medals.reduce((s, m) => s + m.attackerPoints, 0);
    const totalDefender = medals.reduce((s, m) => s + m.defenderPoints, 0);
    const totalRaider   = medals.reduce((s, m) => s + m.raiderPoints, 0);

    // Population rank
    const bases = await prisma.base.findMany({
      where: { seasonId: season.id, isAdmin: false },
      include: { user: { select: { id: true } } },
      orderBy: { populationPoints: 'desc' },
    });
    const byUser = {};
    for (const b of bases) {
      byUser[b.userId] = (byUser[b.userId] ?? 0) + b.populationPoints;
    }
    const sorted = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
    const popRank = sorted.findIndex(([uid]) => uid === userId) + 1;

    const alliance = await prisma.allianceMember.findFirst({
      where: { userId },
      include: { alliance: { select: { name: true } } },
    });

    const baseCount = await prisma.base.count({
      where: { userId, seasonId: season.id, isAdmin: false },
    });

    res.json({
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      stats: {
        populationRank:  popRank || null,
        populationPoints: byUser[userId] ?? 0,
        attackerPoints:  totalAttacker,
        defenderPoints:  totalDefender,
        raiderPoints:    totalRaider,
        attackerMedals,
        defenderMedals,
        raiderMedals,
        victoryMedals,
        lifetimeAttackerMedals,
        lifetimeDefenderMedals,
        lifetimeRaiderMedals,
        lifetimeVictoryMedals,
        baseCount,
      },
      alliance: alliance?.alliance?.name ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaderboard/alliances — all alliances ranked by combined member contribution
router.get('/alliances', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({ entries: [] });

    const alliances = await prisma.alliance.findMany({
      where: { seasonId: season.id },
      include: {
        members: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const entries = await Promise.all(alliances.map(async (a) => {
      const memberIds = a.members.map((m) => m.userId);

      // Population points
      const bases = await prisma.base.findMany({
        where: { userId: { in: memberIds }, seasonId: season.id, isAdmin: false },
      });
      const popPoints = bases.reduce((s, b) => s + b.populationPoints, 0);

      // Medal points
      const medals = await prisma.medal.findMany({
        where: { userId: { in: memberIds }, seasonId: season.id },
      });
      const atkPts = medals.reduce((s, m) => s + m.attackerPoints, 0);
      const defPts = medals.reduce((s, m) => s + m.defenderPoints, 0);
      const raidPts = medals.reduce((s, m) => s + m.raiderPoints, 0);

      return {
        id:          a.id,
        name:        a.name,
        memberCount: memberIds.length,
        score:       popPoints + atkPts + defPts + raidPts,
        popPoints,
        atkPts,
        defPts,
        raidPts,
      };
    }));

    entries.sort((a, b) => b.score - a.score);
    res.json({ entries: entries.map((e, i) => ({ rank: i + 1, ...e })) });
  } catch (err) {
    console.error('[leaderboard/alliances]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
