import { MAP_BOUNDS, BASE_PLACEMENT } from '../config/gameConfig.js';
import { prisma } from '../prisma/client.js';

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Place a new base 5–30 km from an existing base.
 * Tries up to 50 random positions before falling back to a completely random position.
 */
export async function placeNewBase(seasonId) {
  const existingBases = await prisma.base.findMany({
    where: { seasonId },
    select: { x: true, y: true },
  });

  const { min, max } = MAP_BOUNDS;
  const { minKm, maxKm } = BASE_PLACEMENT;

  if (existingBases.length === 0) {
    // Fallback: random within map
    return {
      x: min + Math.random() * (max - min),
      y: min + Math.random() * (max - min),
    };
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const anchor = existingBases[Math.floor(Math.random() * existingBases.length)];
    const angle = Math.random() * 2 * Math.PI;
    const dist = minKm + Math.random() * (maxKm - minKm);
    const x = anchor.x + dist * Math.cos(angle);
    const y = anchor.y + dist * Math.sin(angle);

    if (x < min || x > max || y < min || y > max) continue;

    // Ensure not too close to other bases (min 2km)
    const tooClose = existingBases.some((b) => distance(b.x, b.y, x, y) < 2);
    if (tooClose) continue;

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
