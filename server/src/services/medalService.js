import cron from 'node-cron';
import { prisma } from '../prisma/client.js';

let io = null;

export function setMedalIo(socketIo) {
  io = socketIo;
}

/**
 * Start the medal scheduler — checks every minute for ended week configs.
 */
export function startMedalScheduler(socketIo) {
  io = socketIo;

  // Check every minute for ended week configs
  cron.schedule('* * * * *', async () => {
    await checkAndAwardWeeklyMedals();
  });

  console.log('🏅 Medal scheduler started (checks every minute for ended weeks)');
}

/**
 * Check all ended WeekConfigs for the active season and award medals if not yet awarded.
 * Auto-creates the next week config when the current one ends (if season allows).
 */
export async function checkAndAwardWeeklyMedals() {
  try {
    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (!season) return;

    const now = new Date();
    let weekConfigs;
    try {
      weekConfigs = await prisma.weekConfig.findMany({
        where: { seasonId: season.id, endDate: { lte: now } },
        orderBy: { weekNumber: 'asc' },
      });
    } catch { return; } // Table may not exist yet

    for (const wc of weekConfigs) {
      // Skip if already awarded
      const alreadyAwarded = await prisma.medal.findFirst({
        where: { seasonId: season.id, weekNumber: wc.weekNumber, rewardGiven: true },
      });
      if (alreadyAwarded) continue;

      await awardWeeklyMedalsForWeek(season, wc.weekNumber);

      // Auto-create next week if within season bounds
      const nextWeekNumber = wc.weekNumber + 1;
      const nextEndDate = new Date(wc.endDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (nextEndDate < new Date(season.endDate)) {
        try {
          await prisma.weekConfig.upsert({
            where: { seasonId_weekNumber: { seasonId: season.id, weekNumber: nextWeekNumber } },
            update: {},
            create: { seasonId: season.id, weekNumber: nextWeekNumber, endDate: nextEndDate },
          });
          console.log(`📅 Auto-created Week ${nextWeekNumber} config (ends ${nextEndDate.toISOString()})`);
        } catch (e) { console.error('[medalService] auto-create week:', e.message); }
      }
    }
  } catch (err) {
    console.error('[medalService] checkAndAwardWeeklyMedals:', err.message);
  }
}

async function awardWeeklyMedalsForWeek(season, weekNumber) {
  const medals = await prisma.medal.findMany({
    where: { seasonId: season.id, weekNumber },
    include: { user: { select: { id: true, username: true } } },
  });

  if (medals.length === 0) return;

  // Find top in each category (positive points only)
  const pos = (arr, field) => arr.filter((m) => m[field] > 0).reduce((best, m) =>
    m[field] > (best?.[field] ?? -Infinity) ? m : best, null);

  const topAttacker = pos(medals, 'attackerPoints');
  const topDefender = pos(medals, 'defenderPoints');
  const topRaider   = pos(medals, 'raiderPoints');

  const toAward = [topAttacker, topDefender, topRaider].filter(Boolean);
  for (const medal of toAward) {
    await prisma.medal.update({ where: { id: medal.id }, data: { rewardGiven: true } });
  }

  if (io) {
    io.emit('leaderboard:medals_awarded', {
      week: weekNumber,
      topAttacker: topAttacker ? { username: topAttacker.user.username, points: topAttacker.attackerPoints } : null,
      topDefender: topDefender ? { username: topDefender.user.username, points: topDefender.defenderPoints } : null,
      topRaider:   topRaider   ? { username: topRaider.user.username,   points: topRaider.raiderPoints   } : null,
    });
  }

  console.log(`🏅 Medals awarded for week ${weekNumber}:`);
  if (topAttacker) console.log(`  ⚔️  Top Attacker: ${topAttacker.user.username}`);
  if (topDefender) console.log(`  🛡️  Top Defender: ${topDefender.user.username}`);
  if (topRaider)   console.log(`  💰  Top Raider:   ${topRaider.user.username}`);
}

export async function awardVictoryMedals(seasonId) {
  try {
    const alliances = await prisma.alliance.findMany({
      where: { seasonId },
      include: { members: true },
    });
    if (alliances.length === 0) return null;

    let bestAlliance = null;
    let bestScore = -1;
    for (const a of alliances) {
      const memberIds = a.members.map((m) => m.userId);
      const bases = await prisma.base.findMany({
        where: { userId: { in: memberIds }, seasonId, isAdmin: false },
      });
      const medals = await prisma.medal.findMany({
        where: { userId: { in: memberIds }, seasonId },
      });
      const score =
        bases.reduce((s, b) => s + b.populationPoints, 0) +
        medals.reduce((s, m) => s + m.attackerPoints + m.defenderPoints + m.raiderPoints, 0);
      if (score > bestScore) { bestScore = score; bestAlliance = a; }
    }

    if (bestAlliance) {
      for (const m of bestAlliance.members) {
        const exists = await prisma.medal.findFirst({
          where: { userId: m.userId, seasonId, weekNumber: 0 },
        });
        if (!exists) {
          await prisma.medal.create({
            data: { userId: m.userId, seasonId, weekNumber: 0, attackerPoints: 0, defenderPoints: 0, raiderPoints: 1, rewardGiven: true },
          });
        }
      }
      console.log(`🏆 Victory medals awarded to alliance: ${bestAlliance.name}`);
    }
    return bestAlliance?.name ?? null;
  } catch (e) {
    console.error('[awardVictoryMedals]', e.message);
    return null;
  }
}

export async function awardWeeklyMedals() {
  const season = await prisma.season.findFirst({ where: { isActive: true } });
  if (season) await checkAndAwardWeeklyMedals();
}

