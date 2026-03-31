import { Router } from 'express';
import { prisma } from '../prisma/client.js';

const router = Router();

// GET /api/season/current
router.get('/current', async (_req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { isActive: true },
    });
    res.json({ season });
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
