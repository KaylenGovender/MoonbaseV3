import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client.js';

export function createSocketServer(httpServer) {
  const ALLOWED_ORIGINS = [
    /^https?:\/\/localhost(:\d+)?$/,
    /\.railway\.app$/,
    /\.up\.railway\.app$/,
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.some((p) => p.test(origin))) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, isAdmin: true, isBanned: true },
      });
      if (!user || user.isBanned) return next(new Error('Unauthorized'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;

    // Join personal room
    socket.join(`user:${userId}`);

    // Join all their base rooms + map season room
    const bases = await prisma.base.findMany({
      where: { userId, season: { isActive: true } },
      select: { id: true, seasonId: true },
    });
    for (const base of bases) {
      socket.join(`base:${base.id}`);
      socket.join(`map:season:${base.seasonId}`);
    }

    // Join alliance chat room if member
    const membership = await prisma.allianceMember.findFirst({
      where: { userId },
      select: { allianceId: true },
    });
    if (membership) {
      socket.join(`alliance:${membership.allianceId}`);
    }

    // ── Chat events ──────────────────────────────────────────────────────
    socket.on('chat:send', async (data) => {
      const { allianceId, toUserId, message } = data;
      if (!message?.trim()) return;

      const msg = await prisma.chatMessage.create({
        data: {
          allianceId: allianceId || null,
          fromUserId: userId,
          toUserId:   toUserId || null,
          message:    message.trim().slice(0, 500),
        },
        include: { fromUser: { select: { id: true, username: true } } },
      });

      if (allianceId) {
        io.to(`alliance:${allianceId}`).emit('chat:message', msg);
      } else if (toUserId) {
        const dmRoom = dmRoomId(userId, toUserId);
        io.to(dmRoom).emit('chat:message', msg);
      }
    });

    // ── Join DM room ──────────────────────────────────────────────────────
    socket.on('chat:join_dm', ({ withUserId }) => {
      socket.join(dmRoomId(userId, withUserId));
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function dmRoomId(a, b) {
  return `dm:${[a, b].sort().join(':')}`;
}
