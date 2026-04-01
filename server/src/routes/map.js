import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import { radarRange } from '../config/gameConfig.js';

const router = Router();

// GET /api/map/bases — bases visible within radar range
router.get('/bases', requireAuth, async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return res.json({ bases: [] });

    const playerBases = await prisma.base.findMany({
      where: { userId: req.user.id, seasonId: season.id },
    });

    const radarBuildings = await prisma.building.findMany({
      where: {
        baseId: { in: playerBases.map((b) => b.id) },
        type: 'RADAR',
      },
    });
    const maxRadarLevel = radarBuildings.reduce(
      (max, b) => Math.max(max, b.level),
      0,
    );
    const visRadius = radarRange(maxRadarLevel);

    // All bases in season
    const allBases = await prisma.base.findMany({
      where: { seasonId: season.id },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    // Filter: own bases always visible + bases within radar range
    const visible = allBases.filter((b) => {
      if (b.userId === req.user.id || b.isAdmin) return true;
      return playerBases.some((pb) => {
        const dx = pb.x - b.x;
        const dy = pb.y - b.y;
        return Math.sqrt(dx * dx + dy * dy) <= visRadius;
      });
    });

    // Active attacks for map lines
    const activeAttacks = await prisma.attack.findMany({
      where: {
        status: { in: ['IN_FLIGHT', 'RETURNING'] },
        OR: [
          { attackerBaseId: { in: playerBases.map((b) => b.id) } },
          { defenderBaseId: { in: playerBases.map((b) => b.id) } },
        ],
      },
      include: {
        attackerBase: { select: { x: true, y: true, userId: true } },
        defenderBase: { select: { x: true, y: true, userId: true } },
        battleReport: { select: { attackerWon: true } },
      },
    });

    // Active trade pods
    const activePods = await prisma.tradePod.findMany({
      where: {
        status: 'IN_TRANSIT',
        OR: [
          { fromBaseId: { in: playerBases.map((b) => b.id) } },
          { toBaseId:   { in: playerBases.map((b) => b.id) } },
        ],
      },
      include: {
        fromBase: { select: { x: true, y: true } },
        toBase:   { select: { x: true, y: true } },
      },
    });

    res.json({
      bases: visible.map((b) => ({
        id:       b.id,
        name:     b.name,
        x:        b.x,
        y:        b.y,
        initials: b.user.username.slice(0, 2).toUpperCase(),
        isOwn:    b.userId === req.user.id,
        isAdmin:  b.isAdmin,
        userId:   b.userId,
        username: b.user.username,
      })),
      playerBaseIds: playerBases.map((b) => b.id),
      visRadius,
      playerBases: playerBases.map((b) => ({ id: b.id, x: b.x, y: b.y })),
      attacks: activeAttacks.map((a) => ({
        id:              a.id,
        attackerBaseId:  a.attackerBaseId,
        defenderBaseId:  a.defenderBaseId,
        attackerBase:    a.attackerBase,
        defenderBase:    a.defenderBase,
        launchTime:      a.launchTime,
        arrivalTime:     a.arrivalTime,
        status:          a.status,
        returnTime:      a.returnTime,
        attackerWon:     a.battleReport?.attackerWon ?? null,
      })),
      tradePods: activePods,
    });
  } catch (err) {
    console.error('[map/bases]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
