import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../prisma/client.js';
import { generateToken } from '../middleware/auth.js';
import { placeNewBase } from '../services/placementService.js';
import { ALL_BUILDING_TYPES, ALL_UNIT_TYPES, MINE_SLOTS } from '../config/gameConfig.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const router = Router();

/** Initialize all buildings, resources, mines and unit stocks for a newly created base.
 *  Uses upserts so it's safe to call on partially-initialised bases. */
async function initBase(baseId) {
  for (const type of ALL_BUILDING_TYPES) {
    await prisma.building.upsert({
      where: { baseId_type: { baseId, type } },
      update: {},
      create: { baseId, type, level: 1 },
    });
  }
  await prisma.resourceState.upsert({
    where: { baseId },
    update: {},
    create: { baseId, oxygen: 1000, water: 1000, iron: 1000, helium3: 1000 },
  });
  for (const [resourceType, slotCount] of Object.entries(MINE_SLOTS)) {
    for (let slot = 1; slot <= slotCount; slot++) {
      await prisma.mine.upsert({
        where: { baseId_resourceType_slot: { baseId, resourceType, slot } },
        update: {},
        create: { baseId, resourceType, slot, level: 1 },
      });
    }
  }
  for (const type of ALL_UNIT_TYPES) {
    await prisma.unitStock.upsert({
      where: { baseId_type: { baseId, type } },
      update: {},
      create: { baseId, type, count: 0 },
    });
  }
}

/**
 * Auto-create a base for an existing user in the active season if they don't have one.
 * Returns the updated bases array.
 */
async function ensureBaseInActiveSeason(user, bases) {
  if (bases.length > 0) return bases;
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    console.log(`[auth] ensureBase: no active season for ${user.username}`);
    return bases;
  }

  // Double-check DB (avoid race conditions)
  const existing = await prisma.base.findFirst({
    where: { userId: user.id, seasonId: season.id },
    select: { id: true, name: true, isMain: true },
  });
  if (existing) {
    // Repair partial initialization (base exists but missing resourceState etc.)
    const hasResources = await prisma.resourceState.findUnique({ where: { baseId: existing.id } });
    if (!hasResources) {
      console.log(`[auth] Repairing partial base ${existing.id} for ${user.username}`);
      await initBase(existing.id).catch((e) => console.error('[auth] repair base:', e.message));
    }
    return [existing];
  }

  let x, y;
  try {
    const placement = await placeNewBase(season.id);
    x = placement.x;
    y = placement.y;
  } catch (e) {
    console.error('[auth] placeNewBase failed:', e.message);
    return bases;
  }

  try {
    const newBase = await prisma.base.create({
      data: {
        userId:   user.id,
        seasonId: season.id,
        name:     `${user.username}'s Base`,
        x, y,
        isMain:  true,
        isAdmin: user.isAdmin ?? false,
      },
    });

    await initBase(newBase.id);
    console.log(`[auth] Auto-created base for ${user.username} in season "${season.name}" at (${x},${y})`);
    return [{ id: newBase.id, name: newBase.name, isMain: true }];
  } catch (e) {
    console.error('[auth] base create failed:', e.message);
    return bases;
  }
}

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
        x, y,
        isMain: true,
      },
    });

    await initBase(base.id);

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
      return res.status(400).json({ error: 'Username/email and password required' });
    }
    // Support login with username OR email
    const isEmail = username.includes('@');
    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: username } })
      : await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'Account banned' });
    }
    const token = generateToken(user.id);
    let bases = await prisma.base.findMany({
      where: { userId: user.id, season: { isActive: true } },
      select: { id: true, name: true, isMain: true },
      orderBy: { createdAt: 'asc' },
    });
    // Auto-create a base if user has none in the active season
    bases = await ensureBaseInActiveSeason(user, bases);
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
    let bases = await prisma.base.findMany({
      where: { userId, season: { isActive: true } },
      select: { id: true, name: true, isMain: true, x: true, y: true },
      orderBy: { createdAt: 'asc' },
    });
    bases = await ensureBaseInActiveSeason(user, bases);
    res.json({ user, bases });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// GET /api/auth/bases — refresh current user's active season bases
router.get('/bases', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const { default: jwt } = await import('jsonwebtoken');
    const { userId } = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, isAdmin: true },
    });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });
    let bases = await prisma.base.findMany({
      where: { userId, season: { isActive: true } },
      select: { id: true, name: true, isMain: true, x: true, y: true },
      orderBy: { createdAt: 'asc' },
    });
    bases = await ensureBaseInActiveSeason(dbUser, bases);
    res.json({ bases });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If an account exists, a reset email has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, resetTokenExpiry: expiry },
    });

    await sendPasswordResetEmail(email, token, user.username);
    res.json({ message: 'If an account exists, a reset email has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        passwordResetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
