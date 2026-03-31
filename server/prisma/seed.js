import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ALL_BUILDING_TYPES,
  ALL_UNIT_TYPES,
  MINE_SLOTS,
} from '../src/config/gameConfig.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌙 Seeding Moonbase database…');

  // ── Active season ────────────────────────────────────────────────────────
  let season = await prisma.season.findFirst({ where: { isActive: true } });
  if (!season) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 30);
    season = await prisma.season.create({
      data: {
        name: 'Season 1',
        startDate: now,
        endDate: end,
        isActive: true,
      },
    });
    console.log('  ✓ Created Season 1');
  }

  // ── Admin user ───────────────────────────────────────────────────────────
  let adminUser = await prisma.user.findFirst({ where: { isAdmin: true } });
  if (!adminUser) {
    const hash = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || 'admin123!',
      12,
    );
    adminUser = await prisma.user.create({
      data: {
        username: process.env.ADMIN_USERNAME || 'admin',
        email: process.env.ADMIN_EMAIL || 'admin@moonbase.game',
        passwordHash: hash,
        isAdmin: true,
      },
    });
    console.log('  ✓ Created admin user');
  }

  // ── Admin base at (0,0) ───────────────────────────────────────────────────
  let adminBase = await prisma.base.findFirst({
    where: { isAdmin: true, seasonId: season.id },
  });
  if (!adminBase) {
    adminBase = await prisma.base.create({
      data: {
        userId: adminUser.id,
        seasonId: season.id,
        name: 'Command HQ',
        x: 0,
        y: 0,
        isAdmin: true,
        isMain: true,
      },
    });

    // Buildings
    for (const type of ALL_BUILDING_TYPES) {
      await prisma.building.create({
        data: { baseId: adminBase.id, type, level: 20 },
      });
    }

    // Resource state
    await prisma.resourceState.create({
      data: {
        baseId: adminBase.id,
        oxygen: 10000,
        water: 10000,
        iron: 10000,
        helium3: 10000,
      },
    });

    // Mines (max level)
    for (const [resourceType, slotCount] of Object.entries(MINE_SLOTS)) {
      for (let slot = 1; slot <= slotCount; slot++) {
        await prisma.mine.create({
          data: { baseId: adminBase.id, resourceType, slot, level: 20 },
        });
      }
    }

    // Unit stocks (empty initially)
    for (const type of ALL_UNIT_TYPES) {
      await prisma.unitStock.create({
        data: { baseId: adminBase.id, type, count: 0 },
      });
    }

    console.log('  ✓ Created admin base at (0,0)');
  }

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
