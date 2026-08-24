import { PrismaClient } from "@prisma/client";

// Single shared Prisma client instance for the whole process, per standard
// Prisma-with-Express guidance (avoids exhausting DB connections via multiple clients).
export const prisma = new PrismaClient();
