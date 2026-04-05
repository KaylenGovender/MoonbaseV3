import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { createSocketServer } from './socket/index.js';
import { startTickEngine } from './services/tickEngine.js';
import { startMedalScheduler } from './services/medalService.js';
import { initGameConfig } from './services/gameConfigService.js';
import { prisma } from './prisma/client.js';

const PORT = process.env.PORT || 3001;

const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);

// Load dynamic game config overrides before starting game loops
initGameConfig().then(async () => {
  // One-time fix: ensure admin user's base is visible as a normal player base
  try {
    const adminUser = await prisma.user.findUnique({ where: { username: 'Ulquiorra07' } });
    if (adminUser) {
      const fixed = await prisma.base.updateMany({
        where: { userId: adminUser.id, isAdmin: true },
        data: { isAdmin: false },
      });
      if (fixed.count > 0) console.log(`[startup] Fixed ${fixed.count} admin base(s) → isAdmin: false (player base now visible)`);
    }
  } catch (e) {
    console.error('[startup] Could not fix admin base visibility:', e.message);
  }

  startTickEngine(io);
  startMedalScheduler(io);
  httpServer.listen(PORT, () => {
    console.log(`🚀 Moonbase server listening on port ${PORT}`);
  });
});

async function shutdown() {
  console.log('Shutting down…');
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
