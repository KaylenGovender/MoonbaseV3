import { getBasePlacement } from '../services/gameConfigService.js';
import { prisma } from '../prisma/client.js';

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Place a new base for a season.
 * - First base ever in that season always goes to (0, 0) — the centre.
 * - Subsequent bases are placed 15–35 km from an existing base.
 */
export async function placeNewBase(seasonId) {
  const existingBases = await prisma.base.findMany({
    where: { seasonId },
    select: { x: true, y: true },
  });

  // First base in the season → always centre
  if (existingBases.length === 0) return { x: 0, y: 0 };

  const { minKm, maxKm } = getBasePlacement();
  const min = -100, max = 100;

  for (let attempt = 0; attempt < 100; attempt++) {
    const anchor = existingBases[Math.floor(Math.random() * existingBases.length)];
    const angle = Math.random() * 2 * Math.PI;
    const dist = minKm + Math.random() * (maxKm - minKm);
    const x = anchor.x + dist * Math.cos(angle);
    const y = anchor.y + dist * Math.sin(angle);

    if (x < min || x > max || y < min || y > max) continue;

    const nearest = existingBases.reduce((min, b) => {
      const d = distance(b.x, b.y, x, y);
      return d < min ? d : min;
    }, Infinity);
    if (nearest < minKm) continue;

    console.log(`[placement] Placed base at (${x.toFixed(2)}, ${y.toFixed(2)}), distance from nearest: ${nearest.toFixed(2)}km`);
    return { x, y };
  }

  // Final fallback: random position
  return {
    x: min + Math.random() * (max - min),
    y: min + Math.random() * (max - min),
  };
}

export function distanceBetween(x1, y1, x2, y2) {
  return distance(x1, y1, x2, y2);
}
