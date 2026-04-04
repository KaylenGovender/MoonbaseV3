import { Router } from 'express';
import { prisma } from '../prisma/client.js';

const router = Router();

// GET /api/season/current — returns active season + current WeekConfig end date
router.get('/current', async (_req, res) => {
  try {
    const season = await prisma.season.findFirst({
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    });
    if (!season) return res.json({ season: null });

    // Current week = earliest WeekConfig whose endDate is still in the future
    let currentWeekEnd = null;
    let currentWeekNumber = null;
    try {
      const wc = await prisma.weekConfig.findFirst({
        where: { seasonId: season.id, endDate: { gt: new Date() } },
        orderBy: { weekNumber: 'asc' },
      });
      if (wc) {
        currentWeekEnd = wc.endDate;
        currentWeekNumber = wc.weekNumber;
      }
    } catch {}

    res.json({ season: { ...season, currentWeekEnd, currentWeekNumber } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/season/all
router.get('/all', async (_req, res) => {
  try {
    const seasons = await prisma.season.findMany({
      orderBy: { startDate: 'desc' },
    });
    res.json({ seasons });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
