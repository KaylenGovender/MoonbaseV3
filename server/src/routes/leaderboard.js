import { Router } from 'express';
import { prisma } from '../prisma/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function getPopulationLeaderboard(seasonId, limit = 100) {
  const bases = await prisma.base.findMany({
    where: { seasonId, isAdmin: false },
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

    const medals = await prisma.medal.findMany({
      where: { seasonId: season.id },
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

export default router;
