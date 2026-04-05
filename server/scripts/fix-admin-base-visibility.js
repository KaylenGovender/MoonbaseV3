/**
 * One-time fix: Remove isAdmin=true from Ulquiorra07's base so it appears
 * on the map and leaderboard like any other player base.
 *
 * Run with: node scripts/fix-admin-base-visibility.js
 * (from the server/ directory, with DATABASE_URL in env)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { username: 'Ulquiorra07' } });
  if (!user) {
    console.error('User Ulquiorra07 not found');
    process.exit(1);
  }

  const result = await prisma.base.updateMany({
    where: { userId: user.id, isAdmin: true },
    data: { isAdmin: false },
  });

  console.log(`Updated ${result.count} base(s) for Ulquiorra07: isAdmin → false`);
  console.log('Ulquiorra07 will now be visible on the map and leaderboard.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
