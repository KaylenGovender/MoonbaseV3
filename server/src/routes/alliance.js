import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();

// POST /api/alliance/create
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Alliance name required' });

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.status(503).json({ error: 'No active season' });

    // Check not already in an alliance
    const existing = await prisma.allianceMember.findFirst({
      where: { userId: req.user.id },
    });
    if (existing) return res.status(400).json({ error: 'Already in an alliance' });

    // Check Alliance building level >= 1
    const playerBases = await prisma.base.findMany({
      where: { userId: req.user.id, seasonId: season.id },
    });
    const allianceBuilding = await prisma.building.findFirst({
      where: { baseId: { in: playerBases.map((b) => b.id) }, type: 'ALLIANCE', level: { gte: 1 } },
    });
    if (!allianceBuilding) {
      return res.status(400).json({ error: 'Alliance building level 1 required' });
    }

    const alliance = await prisma.alliance.create({
      data: {
        seasonId: season.id,
        name:     name.trim(),
        leaderId: req.user.id,
        members:  { create: { userId: req.user.id } },
      },
      include: { members: true },
    });

    res.status(201).json({ alliance });
  } catch (err) {
    console.error('[alliance/create]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/alliance/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, username: true } } },
        },
        invites: {
          where: { status: 'PENDING' },
          include: { invitedUser: { select: { id: true, username: true } } },
        },
      },
    });
    if (!alliance) return res.status(404).json({ error: 'Alliance not found' });

    // Calculate effective level = min of all member Alliance building levels
    const memberIds = alliance.members.map((m) => m.userId);
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    const memberBases = season
      ? await prisma.base.findMany({
          where: { userId: { in: memberIds }, seasonId: season.id },
        })
      : [];
    const allianceBuildings = await prisma.building.findMany({
      where: { baseId: { in: memberBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });

    // Group by userId -> max level per user
    const levelByUser = {};
    for (const base of memberBases) {
      const building = allianceBuildings.find((b) => b.baseId === base.id);
      const lvl = building?.level ?? 0;
      levelByUser[base.userId] = Math.max(levelByUser[base.userId] ?? 0, lvl);
    }
    const effectiveLevel =
      memberIds.length > 0
        ? Math.min(...memberIds.map((uid) => levelByUser[uid] ?? 0))
        : 0;

    res.json({ alliance, effectiveLevel, maxMembers: effectiveLevel });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/alliance/my — current player's alliance
router.get('/my/info', requireAuth, async (req, res) => {
  try {
    const membership = await prisma.allianceMember.findFirst({
      where: { userId: req.user.id },
      include: {
        alliance: {
          include: {
            members: {
              include: { user: { select: { id: true, username: true } } },
            },
          },
        },
      },
    });
    if (!membership) return res.json({ alliance: null });
    res.json({ alliance: membership.alliance });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/:id/invite
router.post('/:id/invite', requireAuth, async (req, res) => {
  try {
    const { invitedUsername } = req.body;
    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!alliance) return res.status(404).json({ error: 'Alliance not found' });
    if (alliance.leaderId !== req.user.id) {
      return res.status(403).json({ error: 'Only leader can invite' });
    }

    const invitedUser = await prisma.user.findUnique({ where: { username: invitedUsername } });
    if (!invitedUser) return res.status(404).json({ error: 'User not found' });
    const invitedUserId = invitedUser.id;

    // Check max members
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    const memberIds = alliance.members.map((m) => m.userId);
    const memberBases = season
      ? await prisma.base.findMany({
          where: { userId: { in: memberIds }, seasonId: season.id },
        })
      : [];
    const allianceBuildings = await prisma.building.findMany({
      where: { baseId: { in: memberBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });
    const levelByUser = {};
    for (const base of memberBases) {
      const building = allianceBuildings.find((b) => b.baseId === base.id);
      levelByUser[base.userId] = Math.max(levelByUser[base.userId] ?? 0, building?.level ?? 0);
    }

    // Also check invited user's alliance building level
    const invitedBases = season
      ? await prisma.base.findMany({ where: { userId: invitedUserId, seasonId: season.id } })
      : [];
    const invitedBuilding = await prisma.building.findFirst({
      where: { baseId: { in: invitedBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });
    const invitedLevel = invitedBuilding?.level ?? 0;

    const newCount = memberIds.length + 1;
    const allLevels = [...memberIds.map((uid) => levelByUser[uid] ?? 0), invitedLevel];
    const newEffectiveLevel = Math.min(...allLevels);

    if (newCount > newEffectiveLevel) {
      return res.status(400).json({
        error: `All members (including the invitee) need Alliance building level ≥ ${newCount}`,
      });
    }

    const alreadyMember = await prisma.allianceMember.findFirst({
      where: { userId: invitedUserId },
    });
    if (alreadyMember) {
      return res.status(400).json({ error: 'User is already in an alliance' });
    }

    const invite = await prisma.allianceInvite.create({
      data: {
        allianceId:    alliance.id,
        invitedUserId,
        status: 'PENDING',
      },
    });

    res.status(201).json({ invite });
  } catch (err) {
    console.error('[alliance/invite]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/invite/:inviteId/accept
router.post('/invite/:inviteId/accept', requireAuth, async (req, res) => {
  try {
    const invite = await prisma.allianceInvite.findUnique({
      where: { id: req.params.inviteId },
    });
    if (!invite || invite.invitedUserId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invite already resolved' });
    }

    await prisma.allianceInvite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    await prisma.allianceMember.create({
      data: { allianceId: invite.allianceId, userId: req.user.id },
    });

    res.json({ message: 'Joined alliance' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/invite/:inviteId/decline
router.post('/invite/:inviteId/decline', requireAuth, async (req, res) => {
  try {
    const invite = await prisma.allianceInvite.findUnique({
      where: { id: req.params.inviteId },
    });
    if (!invite || invite.invitedUserId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.allianceInvite.update({
      where: { id: invite.id },
      data: { status: 'DECLINED' },
    });
    res.json({ message: 'Declined' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/:id/kick/:userId
router.post('/:id/kick/:userId', requireAuth, async (req, res) => {
  try {
    const { id: allianceId, userId: kickUserId } = req.params;
    const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
    if (!alliance) return res.status(404).json({ error: 'Not found' });
    if (alliance.leaderId !== req.user.id) {
      return res.status(403).json({ error: 'Only leader can kick' });
    }
    if (kickUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot kick yourself' });
    }

    await prisma.allianceMember.delete({
      where: { allianceId_userId: { allianceId, userId: kickUserId } },
    });

    res.json({ message: 'Member kicked' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/alliance/invites/mine — pending invites for current user
router.get('/invites/mine', requireAuth, async (req, res) => {
  try {
    const invites = await prisma.allianceInvite.findMany({
      where: { invitedUserId: req.user.id, status: 'PENDING' },
      include: { alliance: { select: { id: true, name: true } } },
    });
    res.json({ invites });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
