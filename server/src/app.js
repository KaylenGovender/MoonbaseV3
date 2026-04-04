import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';
import baseRoutes from './routes/base.js';
import mapRoutes from './routes/map.js';
import warroomRoutes from './routes/warroom.js';
import allianceRoutes from './routes/alliance.js';
import chatRoutes from './routes/chat.js';
import leaderboardRoutes from './routes/leaderboard.js';
import seasonRoutes from './routes/season.js';
import tradepodRoutes from './routes/tradepod.js';
import adminRoutes from './routes/admin.js';
import reinforcementRoutes from './routes/reinforcement.js';
import { getGameConfig } from './services/gameConfigService.js';
import { getConfig } from './services/serverConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, '..', '..', 'client', 'dist');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /\.railway\.app$/,
  /\.up\.railway\.app$/,
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.some((p) => p.test(origin))) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// App version — client polls this to detect new deployments
app.get('/api/version', (_req, res) => res.json({ version: 'v3.0.4' }));

// Public game config — client uses this to show current costs/stats
app.get('/api/config/game', (_req, res) => res.json(getGameConfig()));

// Public announcement — shown as banner in client
app.get('/api/announcement', async (_req, res) => {
  try {
    const text = await getConfig('announcement', '');
    res.json({ text });
  } catch { res.json({ text: '' }); }
});

// API routes
app.use('/api/auth',        authRoutes);
app.use('/api/base',        baseRoutes);
app.use('/api/map',         mapRoutes);
app.use('/api/warroom',     warroomRoutes);
app.use('/api/alliance',    allianceRoutes);
app.use('/api/chat',        chatRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/season',      seasonRoutes);
app.use('/api/tradepod',    tradepodRoutes);
app.use('/api/admin',           adminRoutes);
app.use('/api/reinforcement',   reinforcementRoutes);

// Serve built React client
app.use(express.static(CLIENT_DIST));
app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));

export default app;
