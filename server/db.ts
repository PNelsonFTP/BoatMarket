import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  assertTestDatabaseUrl,
  isTestDatabaseContext,
} from "./database-safety";
export function createDatabaseClient(options?: Prisma.PrismaClientOptions) {
  if (!isTestDatabaseContext()) return new PrismaClient(options);
  const url = assertTestDatabaseUrl(
    options?.datasourceUrl ??
      options?.datasources?.db?.url ??
      process.env.DATABASE_URL,
  )!;
  const { datasourceUrl: _url, datasources, ...rest } = options || {};
  // Capture the approved URL at construction; later dotenv or env changes cannot redirect this client.
  return new PrismaClient({
    ...rest,
    datasources: { ...datasources, db: { url } },
  });
}
export const db = createDatabaseClient();
