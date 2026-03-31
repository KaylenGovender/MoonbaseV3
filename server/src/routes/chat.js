import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

const router = Router();

// GET /api/chat/alliance/:id?limit=50
router.get('/alliance/:id', requireAuth, async (req, res) => {
  try {
    const membership = await prisma.allianceMember.findFirst({
      where: { allianceId: req.params.id, userId: req.user.id },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const messages = await prisma.chatMessage.findMany({
      where: { allianceId: req.params.id },
      include: { fromUser: { select: { id: true, username: true } } },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });

    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/chat/dm/:userId
router.get('/dm/:userId', requireAuth, async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: {
        allianceId: null,
        OR: [
          { fromUserId: req.user.id,    toUserId: req.params.userId },
          { fromUserId: req.params.userId, toUserId: req.user.id    },
        ],
      },
      include: { fromUser: { select: { id: true, username: true } } },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
