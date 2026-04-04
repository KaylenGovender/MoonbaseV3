import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();

// GET /api/alliance/list — all alliances in current season (for browsing)
router.get('/list/all', requireAuth, async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({ alliances: [] });

    // Check if user is already in an alliance
    const myMembership = await prisma.allianceMember.findFirst({ where: { userId: req.user.id } });

    const alliances = await prisma.alliance.findMany({
      where: { seasonId: season.id },
      include: {
        members: {
          include: { user: { select: { username: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get pending requests sent by this user
    const myRequests = await prisma.allianceInvite.findMany({
      where: { invitedUserId: req.user.id, type: 'JOIN_REQUEST', status: 'PENDING' },
    });
    const requestedIds = new Set(myRequests.map((r) => r.allianceId));

    res.json({
      alliances: alliances.map((a) => ({
        id:           a.id,
        name:         a.name,
        memberCount:  a.members.length,
        members:      a.members.map((m) => m.user.username),
        hasRequested: requestedIds.has(a.id),
      })),
      alreadyInAlliance: !!myMembership,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/:id/request — player requests to join
router.post('/:id/request', requireAuth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!alliance) return res.status(404).json({ error: 'Alliance not found' });

    const existing = await prisma.allianceMember.findFirst({ where: { userId: req.user.id } });
    if (existing) return res.status(400).json({ error: 'Already in an alliance' });

    const alreadyRequested = await prisma.allianceInvite.findFirst({
      where: { allianceId: alliance.id, invitedUserId: req.user.id, type: 'JOIN_REQUEST', status: 'PENDING' },
    });
    if (alreadyRequested) return res.status(400).json({ error: 'Request already pending' });

    await prisma.allianceInvite.create({
      data: {
        allianceId:    alliance.id,
        invitedUserId: req.user.id,
        type:          'JOIN_REQUEST',
        status:        'PENDING',
      },
    });

    res.status(201).json({ message: 'Request sent' });
  } catch (err) {
    console.error('[alliance/request]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/alliance/:id/requests — leader sees pending join requests
router.get('/:id/requests', requireAuth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({ where: { id: req.params.id } });
    if (!alliance) return res.status(404).json({ error: 'Not found' });
    if (alliance.leaderId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const requests = await prisma.allianceInvite.findMany({
      where: { allianceId: req.params.id, type: 'JOIN_REQUEST', status: 'PENDING' },
      include: { invitedUser: { select: { id: true, username: true } } },
    });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/request/:requestId/accept — leader accepts join request
router.post('/request/:requestId/accept', requireAuth, async (req, res) => {
  try {
    const request = await prisma.allianceInvite.findUnique({ where: { id: req.params.requestId } });
    if (!request || request.type !== 'JOIN_REQUEST' || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'Request not found' });
    }
    const alliance = await prisma.alliance.findUnique({
      where: { id: request.allianceId },
      include: { members: true },
    });
    if (alliance.leaderId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // Check member cap before accepting
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    const memberIds = alliance.members.map((m) => m.userId);
    const memberBases = season
      ? await prisma.base.findMany({ where: { userId: { in: memberIds }, seasonId: season.id } })
      : [];
    const allianceBuildings = await prisma.building.findMany({
      where: { baseId: { in: memberBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });
    const levelByUser = {};
    for (const base of memberBases) {
      const building = allianceBuildings.find((b) => b.baseId === base.id);
      const lvl = building ? (building.upgradeEndsAt ? building.level - 1 : building.level) : 0;
      levelByUser[base.userId] = Math.max(levelByUser[base.userId] ?? 0, lvl);
    }
    // Check the joining user's alliance building level too
    const joinerBases = season
      ? await prisma.base.findMany({ where: { userId: request.invitedUserId, seasonId: season.id } })
      : [];
    const joinerBuilding = await prisma.building.findFirst({
      where: { baseId: { in: joinerBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });
    const joinerLevel = joinerBuilding ? (joinerBuilding.upgradeEndsAt ? joinerBuilding.level - 1 : joinerBuilding.level) : 0;
    const newCount = memberIds.length + 1;
    const allLevels = [...memberIds.map((uid) => levelByUser[uid] ?? 0), joinerLevel];
    const effectiveLevel = Math.min(...allLevels);
    if (newCount > effectiveLevel) {
      return res.status(400).json({
        error: `Alliance building level too low. All members need level ≥ ${newCount}`,
      });
    }

    await prisma.allianceInvite.update({ where: { id: request.id }, data: { status: 'ACCEPTED' } });
    await prisma.allianceMember.create({
      data: { allianceId: request.allianceId, userId: request.invitedUserId },
    });
    res.json({ message: 'Accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/request/:requestId/decline — leader declines join request
router.post('/request/:requestId/decline', requireAuth, async (req, res) => {
  try {
    const request = await prisma.allianceInvite.findUnique({ where: { id: req.params.requestId } });
    if (!request || request.type !== 'JOIN_REQUEST') return res.status(404).json({ error: 'Not found' });
    const alliance = await prisma.alliance.findUnique({ where: { id: request.allianceId } });
    if (alliance.leaderId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await prisma.allianceInvite.update({ where: { id: request.id }, data: { status: 'DECLINED' } });
    res.json({ message: 'Declined' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


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

// GET /api/alliance/my/info — current player's alliance (MUST be before GET /:id)
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

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    const memberUserIds = membership.alliance.members.map((m) => m.userId);
    const memberBases = season
      ? await prisma.base.findMany({
          where: { userId: { in: memberUserIds }, seasonId: season.id, isAdmin: false },
          select: { id: true, name: true, userId: true, populationPoints: true },
        })
      : [];

    const memberMedals = season
      ? await prisma.medal.findMany({
          where: { userId: { in: memberUserIds }, seasonId: season.id },
          select: { userId: true, attackerPoints: true, defenderPoints: true, raiderPoints: true },
        })
      : [];

    const enrichedMembers = membership.alliance.members.map((m) => {
      const mBases  = memberBases.filter((b) => b.userId === m.userId);
      const mMedals = memberMedals.filter((med) => med.userId === m.userId);
      return {
        ...m,
        role: m.role ?? 'MEMBER',
        primaryBase: mBases[0] ?? null,
        populationPoints: mBases.reduce((s, b) => s + (b.populationPoints ?? 0), 0),
        attackerPoints:   mMedals.reduce((s, med) => s + (med.attackerPoints ?? 0), 0),
        defenderPoints:   mMedals.reduce((s, med) => s + (med.defenderPoints ?? 0), 0),
        raiderPoints:     mMedals.reduce((s, med) => s + (med.raiderPoints ?? 0), 0),
      };
    });

    res.json({ alliance: { ...membership.alliance, members: enrichedMembers } });
  } catch (err) {
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

    const levelByUser = {};
    for (const base of memberBases) {
      const building = allianceBuildings.find((b) => b.baseId === base.id);
      const lvl = building ? (building.upgradeEndsAt ? building.level - 1 : building.level) : 0;
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
      levelByUser[base.userId] = Math.max(levelByUser[base.userId] ?? 0, building ? (building.upgradeEndsAt ? building.level - 1 : building.level) : 0);
    }

    // Also check invited user's alliance building level
    const invitedBases = season
      ? await prisma.base.findMany({ where: { userId: invitedUserId, seasonId: season.id } })
      : [];
    const invitedBuilding = await prisma.building.findFirst({
      where: { baseId: { in: invitedBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });
    const invitedLevel = invitedBuilding ? (invitedBuilding.upgradeEndsAt ? invitedBuilding.level - 1 : invitedBuilding.level) : 0;

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

    // Re-check member cap at acceptance time
    const alliance = await prisma.alliance.findUnique({
      where: { id: invite.allianceId },
      include: { members: true },
    });
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    const memberIds = alliance.members.map((m) => m.userId);
    const memberBases = season
      ? await prisma.base.findMany({ where: { userId: { in: [...memberIds, req.user.id] }, seasonId: season.id } })
      : [];
    const allianceBuildings = await prisma.building.findMany({
      where: { baseId: { in: memberBases.map((b) => b.id) }, type: 'ALLIANCE' },
    });
    const levelByUser = {};
    for (const base of memberBases) {
      const building = allianceBuildings.find((b) => b.baseId === base.id);
      const lvl = building ? (building.upgradeEndsAt ? building.level - 1 : building.level) : 0;
      levelByUser[base.userId] = Math.max(levelByUser[base.userId] ?? 0, lvl);
    }
    const newCount = memberIds.length + 1;
    const allLevels = [...memberIds, req.user.id].map((uid) => levelByUser[uid] ?? 0);
    const effectiveLevel = Math.min(...allLevels);
    if (newCount > effectiveLevel) {
      return res.status(400).json({
        error: `Alliance is full. All members need Alliance building level ≥ ${newCount}`,
      });
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

// POST /api/alliance/:id/promote/:userId — leader promotes member to admin
router.post('/:id/promote/:userId', requireAuth, async (req, res) => {
  try {
    const { id: allianceId, userId: targetUserId } = req.params;
    const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
    if (!alliance) return res.status(404).json({ error: 'Not found' });
    if (alliance.leaderId !== req.user.id) return res.status(403).json({ error: 'Only leader can promote' });

    await prisma.allianceMember.update({
      where: { allianceId_userId: { allianceId, userId: targetUserId } },
      data: { role: 'ADMIN' },
    });

    res.json({ ok: true, role: 'ADMIN' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/:id/demote/:userId — leader demotes admin back to member
router.post('/:id/demote/:userId', requireAuth, async (req, res) => {
  try {
    const { id: allianceId, userId: targetUserId } = req.params;
    const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
    if (!alliance) return res.status(404).json({ error: 'Not found' });
    if (alliance.leaderId !== req.user.id) return res.status(403).json({ error: 'Only leader can demote' });

    await prisma.allianceMember.update({
      where: { allianceId_userId: { allianceId, userId: targetUserId } },
      data: { role: 'MEMBER' },
    });

    res.json({ ok: true, role: 'MEMBER' });
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

    const isLeader = alliance.leaderId === req.user.id;
    let isAdmin = false;
    try {
      const myMem = await prisma.allianceMember.findUnique({
        where: { allianceId_userId: { allianceId, userId: req.user.id } },
      });
      isAdmin = myMem?.role === 'ADMIN';
    } catch {}

    if (!isLeader && !isAdmin) return res.status(403).json({ error: 'Only leader or admin can kick' });
    if (kickUserId === req.user.id) return res.status(400).json({ error: 'Cannot kick yourself' });
    if (!isLeader && kickUserId === alliance.leaderId) return res.status(403).json({ error: 'Admins cannot kick the leader' });

    await prisma.allianceMember.delete({
      where: { allianceId_userId: { allianceId, userId: kickUserId } },
    });

    res.json({ message: 'Member kicked' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/alliance/:id/leave — any member leaves
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id: allianceId } = req.params;
    const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
    if (!alliance) return res.status(404).json({ error: 'Alliance not found' });
    if (alliance.leaderId === req.user.id) {
      return res.status(400).json({ error: 'Leader must disband the alliance instead of leaving' });
    }
    await prisma.allianceMember.delete({
      where: { allianceId_userId: { allianceId, userId: req.user.id } },
    });
    res.json({ message: 'Left alliance' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/alliance/:id — leader disbands
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id: allianceId } = req.params;
    const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
    if (!alliance) return res.status(404).json({ error: 'Alliance not found' });
    if (alliance.leaderId !== req.user.id) {
      return res.status(403).json({ error: 'Only the leader can disband' });
    }
    // Delete all members, invites, messages, then the alliance
    await prisma.allianceMember.deleteMany({ where: { allianceId } });
    await prisma.allianceInvite.deleteMany({ where: { allianceId } });
    await prisma.chatMessage.deleteMany({ where: { allianceId } });
    await prisma.alliance.delete({ where: { id: allianceId } });
    res.json({ message: 'Alliance disbanded' });
  } catch (err) {
    console.error('[alliance/disband]', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /api/alliance/:id/members — returns member list for any alliance (for leaderboard)
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const alliance = await prisma.alliance.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });
    if (!alliance) return res.status(404).json({ error: 'Not found' });
    res.json({
      name: alliance.name,
      members: alliance.members.map((m) => ({
        username:  m.user?.username ?? '?',
        isLeader:  m.userId === alliance.leaderId,
        role:      m.role ?? 'MEMBER',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

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
