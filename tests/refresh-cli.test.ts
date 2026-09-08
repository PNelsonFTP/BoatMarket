import { expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

it("returns real one-shot exit codes and runs a complete cached refresh against an isolated database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boatscout-cli-"));
  const databaseUrl = `file:${join(directory, "fixture.db")}`;
  const database = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const config = join(directory, "sources.json");
  const cache = join(directory, "cache");
  const target = join(directory, "snapshot.json");
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SOURCE_CONFIG: config,
    COLLECTION_CACHE_DIR: cache,
    REFRESH_REPORT_DIR: join(directory, "reports"),
    REFRESH_BACKUP_DIR: join(directory, "backups"),
    SMTP_HOST: "",
    ALERT_WEBHOOK_URL: "",
  };
  const run = (script: string, args: string[] = []) =>
    spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
      env,
      encoding: "utf8",
      cwd: resolve("."),
      timeout: 20000,
    });
  try {
    await writeFile(join(directory, "fixture.db"), "");
    const migrate = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env, encoding: "utf8" },
    );
    if (migrate.status !== 0) throw new Error(migrate.stdout + migrate.stderr);
    await mkdir(cache);
    const url = "https://fixture.example/inventory";
    const brokenUrl = "https://fixture.example/broken";
    const cached = (url: string, html: string) =>
      writeFile(
        join(cache, createHash("sha256").update(url).digest("hex") + ".html"),
        html,
      );
    await cached(
      url,
      '<script type="application/ld+json">{"@type":"Product","name":"2020 Lund 1875 Pro V","url":"https://fixture.example/boat-one","offers":{"price":35000,"priceCurrency":"USD"}}</script>',
    );
    await cached(brokenUrl, "<html>No exposed inventory</html>");
    const source = {
      id: "fixture",
      name: "Fixture",
      adapter: "dealer",
      enabled: true,
      urls: [url, brokenUrl],
    };
    await writeFile(config, JSON.stringify([source]));
    const partial = run("server/worker.ts", ["--once"]);
    expect(partial.status, partial.stdout + partial.stderr).toBe(2);
    expect(await database.listing.count()).toBe(1);
    await database.jobLock.create({
      data: {
        key: "collector",
        owner: "other-owner",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(run("server/worker.ts", ["--once"]).status).toBe(3);
    expect(run("server/worker.ts", ["--once", "--skip-busy"]).status).toBe(0);
    await database.jobLock.deleteMany();
    await writeFile(target, "previous snapshot");
    const refusingPartial = run("scripts/refresh.ts", [`--target=${target}`]);
    expect(
      refusingPartial.status,
      refusingPartial.stdout + refusingPartial.stderr,
    ).toBe(2);
    expect(await readFile(target, "utf8")).toBe("previous snapshot");
    await writeFile(config, JSON.stringify([{ ...source, urls: [url] }]));
    const success = run("scripts/refresh.ts", [`--target=${target}`]);
    expect(success.status, success.stdout + success.stderr).toBe(0);
    const snapshot = JSON.parse(await readFile(target, "utf8"));
    expect(snapshot.listings).toHaveLength(1);
    expect(snapshot.refresh).toMatchObject({
      status: "success",
      partial: false,
    });
    expect(snapshot.listings[0]).not.toHaveProperty("rawPayload");
    await writeFile(config, JSON.stringify([{ ...source, urls: [brokenUrl] }]));
    expect(run("server/worker.ts", ["--once"]).status).toBe(1);
  } finally {
    await database.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
