import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma/client.js';
import { generateToken } from '../middleware/auth.js';
import { placeNewBase } from '../services/placementService.js';
import { ALL_BUILDING_TYPES, ALL_UNIT_TYPES, MINE_SLOTS } from '../config/gameConfig.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3–20 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) {
      return res.status(503).json({ error: 'No active season. Check back soon!' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, email, passwordHash: hash },
    });

    const { x, y } = await placeNewBase(season.id);
    const initials = username.slice(0, 2).toUpperCase();

    const base = await prisma.base.create({
      data: {
        userId:   user.id,
        seasonId: season.id,
        name:     `${username}'s Base`,
        x,
        y,
        isMain: true,
      },
    });

    // Initialise buildings at level 0
    for (const type of ALL_BUILDING_TYPES) {
      await prisma.building.create({ data: { baseId: base.id, type, level: 0 } });
    }

    // Initialise resource state
    await prisma.resourceState.create({
      data: { baseId: base.id, oxygen: 200, water: 200, iron: 200, helium3: 50 },
    });

    // Initialise mines at level 0
    for (const [resourceType, slotCount] of Object.entries(MINE_SLOTS)) {
      for (let slot = 1; slot <= slotCount; slot++) {
        await prisma.mine.create({ data: { baseId: base.id, resourceType, slot, level: 0 } });
      }
    }

    // Initialise unit stocks
    for (const type of ALL_UNIT_TYPES) {
      await prisma.unitStock.create({ data: { baseId: base.id, type, count: 0 } });
    }

    const token = generateToken(user.id);
    res.status(201).json({
      token,
      user:  { id: user.id, username: user.username, email: user.email },
      baseId: base.id,
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'Account banned' });
    }
    const token = generateToken(user.id);
    const bases = await prisma.base.findMany({
      where: { userId: user.id, season: { isActive: true } },
      select: { id: true, name: true, isMain: true },
    });
    res.json({
      token,
      user:  { id: user.id, username: user.username, isAdmin: user.isAdmin },
      bases,
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const { default: jwt } = await import('jsonwebtoken');
    const { userId } = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, isAdmin: true, isBanned: true },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    const bases = await prisma.base.findMany({
      where: { userId, season: { isActive: true } },
      select: { id: true, name: true, isMain: true, x: true, y: true },
    });
    res.json({ user, bases });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
