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

// GET /api/chat/search?q=username — search players by username
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ users: [] });
    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        id: { not: req.user.id }, // exclude self
      },
      select: { id: true, username: true },
      take: 10,
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/chat/conversations — list all DM conversations for current user
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    // Find all distinct DM partners with the latest message
    const sent = await prisma.chatMessage.findMany({
      where: { fromUserId: req.user.id, allianceId: null, toUserId: { not: null } },
      select: { toUserId: true, message: true, sentAt: true, toUser: { select: { id: true, username: true } } },
      orderBy: { sentAt: 'desc' },
    });
    const received = await prisma.chatMessage.findMany({
      where: { toUserId: req.user.id, allianceId: null },
      select: { fromUserId: true, message: true, sentAt: true, fromUser: { select: { id: true, username: true } } },
      orderBy: { sentAt: 'desc' },
    });

    const convos = {};
    for (const m of sent) {
      const id = m.toUserId;
      if (!convos[id] || m.sentAt > convos[id].sentAt) {
        convos[id] = { userId: id, username: m.toUser.username, lastMessage: m.message, sentAt: m.sentAt };
      }
    }
    for (const m of received) {
      const id = m.fromUserId;
      if (!convos[id] || m.sentAt > convos[id].sentAt) {
        convos[id] = { userId: id, username: m.fromUser.username, lastMessage: m.message, sentAt: m.sentAt };
      }
    }

    const list = Object.values(convos).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    res.json({ conversations: list });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
