import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { createSocketServer } from './socket/index.js';
import { startTickEngine } from './services/tickEngine.js';
import { prisma } from './prisma/client.js';

const PORT = process.env.PORT || 3001;

const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);

startTickEngine(io);

httpServer.listen(PORT, () => {
  console.log(`🚀 Moonbase server listening on port ${PORT}`);
});

async function shutdown() {
  console.log('Shutting down…');
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
