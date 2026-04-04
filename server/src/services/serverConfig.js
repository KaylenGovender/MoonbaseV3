import { prisma } from '../prisma/client.js';

export async function getConfig(key, defaultValue = null) {
  try {
    const row = await prisma.serverConfig.findUnique({ where: { key } });
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setConfig(key, value) {
  try {
    await prisma.serverConfig.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  } catch (e) {
    console.error('[serverConfig] setConfig error:', e.message);
  }
}
