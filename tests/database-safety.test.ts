import { expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
// This static import deliberately reproduces the ordering that caused the incident.
import { db, createDatabaseClient } from "../server/db";
import { assertTestDatabaseUrl } from "../server/database-safety";
const liveUrl = `file:${resolve("data/boatscout.db")}`;
it("gives even an early static database import a unique isolated fallback", async () => {
  try {
    const actual = await db.$queryRawUnsafe<{ name: string; file: string }[]>(
      "PRAGMA database_list",
    );
    const path = await realpath(
      actual.find((entry) => entry.name === "main")!.file,
    );
    expect(path).toBe(await realpath(process.env.DATABASE_URL!.slice(5)));
    expect(relative(process.env.BOATSCOUT_TEST_ROOT!, path)).not.toMatch(
      /^\.\./,
    );
    expect(path).not.toBe(resolve("data/boatscout.db"));
  } finally {
    await db.$disconnect();
  }
});
it("rejects production paths through both the application factory and direct ORM imports before connecting", () => {
  expect(() => assertTestDatabaseUrl(liveUrl)).toThrow(
    /outside the isolated test root/,
  );
  expect(() => assertTestDatabaseUrl("file:../data/boatscout.db")).toThrow(
    /outside the isolated test root/,
  );
  expect(() =>
    createDatabaseClient({ datasources: { db: { url: liveUrl } } }),
  ).toThrow(/Test database safety/);
  expect(() => new PrismaClient({ datasourceUrl: liveUrl })).toThrow(
    /Test database safety/,
  );
  expect(
    () => new PrismaClient({ datasources: { db: { url: liveUrl } } }),
  ).toThrow(/Test database safety/);
  expect(() =>
    assertTestDatabaseUrl("file:/tmp/elsewhere.db", { VITEST: "true" }),
  ).toThrow(/isolated BOATSCOUT_TEST_ROOT/);
});
it("rejects a migration subprocess with a live DATABASE_URL before launching it", () => {
  expect(() =>
    spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env: { ...process.env, DATABASE_URL: liveUrl } },
    ),
  ).toThrow(/Test database safety/);
});
it("allows nested fixture databases but rejects symlink escape and ambiguous URI paths", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "guard-fixture-"));
  const outside = await mkdtemp(
    join(dirname(process.env.BOATSCOUT_TEST_ROOT!), "guard-outside-"),
  );
  try {
    expect(assertTestDatabaseUrl(`file:${join(fixture, "new.db")}`)).toBe(
      `file:${join(await realpath(fixture), "new.db").replaceAll("\\", "/")}`,
    );
    await symlink(outside, join(fixture, "escape"), "junction");
    expect(() =>
      assertTestDatabaseUrl(`file:${join(fixture, "escape", "new.db")}`),
    ).toThrow(/outside the isolated test root/);
    expect(() =>
      assertTestDatabaseUrl(`file:${join(fixture, "new.db")}?mode=rw`),
    ).toThrow(/unambiguous/);
    expect(() =>
      assertTestDatabaseUrl(`file:${join(fixture, "%2e%2e", "new.db")}`),
    ).toThrow(/unambiguous/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
