import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export const initDatabase = (): PrismaClient => {
  if (prisma) {
    return prisma;
  }

  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  return prisma;
};

export const getDatabase = (): PrismaClient => {
  if (!prisma) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return prisma;
};

export const closeDatabase = async (): Promise<void> => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
};

