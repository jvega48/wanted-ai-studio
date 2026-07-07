import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export async function healthCheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export { Prisma } from '@prisma/client';
export type {
  StreamSession,
  ChatLog,
  Clip,
  StreamMetricSnapshot,
  StreamMoment,
  MemoryEntry,
  CreatorProfile,
  Sponsor,
  PlatformProfile,
  ContentQueueItem,
  AgentTask,
  Plugin,
  AuditLog,
} from '@prisma/client';

export {
  StreamStatus,
  StreamPlatform,
  ClipStatus,
  ClipFormat,
  MemoryType,
  MemoryScope,
  ContentType,
  ContentQueueStatus,
} from '@prisma/client';
