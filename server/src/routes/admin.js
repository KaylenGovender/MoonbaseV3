import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();

// POST /api/admin/season — create a new season
router.post('/season', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, startDate, endDate, activate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, startDate, endDate required' });
    }

    if (activate) {
      await prisma.season.updateMany({ data: { isActive: false } });
    }

    const season = await prisma.season.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate:   new Date(endDate),
        isActive:  activate ?? false,
      },
    });
    res.status(201).json({ season });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/season/:id — update a season
router.put('/season/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, startDate, endDate, isActive } = req.body;

    if (isActive) {
      await prisma.season.updateMany({
        where: { NOT: { id: req.params.id } },
        data: { isActive: false },
      });
    }

    const season = await prisma.season.update({
      where: { id: req.params.id },
      data: {
        ...(name      && { name }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate   && { endDate:   new Date(endDate)   }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ season });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, username: true, email: true,
        isAdmin: true, isBanned: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id/ban
router.put('/users/:id/ban', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: req.body.banned ?? true },
    });
    res.json({ user: { id: user.id, isBanned: user.isBanned } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/seasons
router.get('/seasons', requireAuth, requireAdmin, async (req, res) => {
  try {
    const seasons = await prisma.season.findMany({ orderBy: { startDate: 'desc' } });
    res.json({ seasons });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
