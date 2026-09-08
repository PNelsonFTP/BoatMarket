import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import robotsParser from "robots-parser";
import { z } from "zod";
import { requestPublic, publicUrl } from "./network";
import { sourceConfigSchema, type SourceConfig } from "./adapters/types";
import { adapters } from "./adapters";
import { db } from "./db";
import { acquireLock, releaseLock, upsertListing } from "./repository";
import { logger } from "./logger";
import { locateListing, readLocations } from "./locations";
import {
  inventoryPages,
  verifiedEmptyRegionalPage,
} from "./adapters/pagination";
const configPath = () => process.env.SOURCE_CONFIG || "config/sources.json";
export async function readSources() {
  return z
    .array(sourceConfigSchema)
    .max(50)
    .parse(JSON.parse(await readFile(configPath(), "utf8")));
}
export async function writeSources(input: unknown) {
  const sources = z.array(sourceConfigSchema).max(50).parse(input);
  if (new Set(sources.map((s) => s.id)).size !== sources.length)
    throw new Error("Source IDs must be unique");
  for (const s of sources) for (const u of s.urls) await publicUrl(u);
  await writeFile(
    configPath() + ".tmp",
    JSON.stringify(sources, null, 2) + "\n",
  );
  await rename(configPath() + ".tmp", configPath());
  return sources;
}
const lastRequest = new Map<string, number>();
const cacheFile = (url: string) =>
  `data/cache/${createHash("sha256").update(url).digest("hex")}.html`;
async function observedAt(url: string) {
  return (await stat(cacheFile(url))).mtime.toISOString();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function politeFetch(url: string) {
  const file = cacheFile(url);
  try {
    const meta = await stat(file);
    if (Date.now() - meta.mtimeMs < 86400000)
      return await readFile(file, "utf8");
  } catch {
    /* cache miss: verify robots rules before making a new page request */
  }
  const origin = new URL(url).origin;
  const wait = Math.max(
    0,
    (lastRequest.get(origin) ?? 0) + 2500 + Math.random() * 1500 - Date.now(),
  );
  await sleep(wait);
  lastRequest.set(origin, Date.now());
  const robots = await requestPublic(`${origin}/robots.txt`);
  if (robots.status !== 404 && robots.status !== 410 && robots.status !== 200)
    throw new Error(`Could not verify robots.txt (HTTP ${robots.status})`);
  if (robots.status === 200) {
    const parser = robotsParser(`${origin}/robots.txt`, robots.body);
    if (parser.isAllowed(url, "BoatScout") === false)
      throw new Error("Collection disallowed by robots.txt");
    const delay = parser.getCrawlDelay("BoatScout");
    if (delay && delay > 60)
      throw new Error(
        "Source requests a crawl delay above 60 seconds; use manual import",
      );
    if (delay)
      await sleep(
        Math.max(
          0,
          delay * 1000 - (Date.now() - (lastRequest.get(origin) ?? 0)),
        ),
      );
  }
  await mkdir("data/cache", { recursive: true });
  await sleep(2000);
  const response = await requestPublic(url);
  lastRequest.set(origin, Date.now());
  if (response.status !== 200)
    throw new Error(`Source returned HTTP ${response.status}`);
  if (
    /captcha|verify you are human|access denied|cf-chl-|automated access prohibited/i.test(
      response.body,
    ) &&
    response.body.length < 100000
  )
    throw new Error("Source returned an access challenge; use manual import");
  await writeFile(file, response.body);
  return response.body;
}
async function renderAllowed(url: string, html: string) {
  const cachedFile = `data/cache/${createHash("sha256").update(url).digest("hex")}.rendered.html`;
  try {
    const info = await stat(cachedFile);
    if (Date.now() - info.mtimeMs < 86400000)
      return await readFile(cachedFile, "utf8");
  } catch {
    /* first render */
  }
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: "BoatScout/1.0",
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      try {
        const req = route.request();
        if (
          ["image", "media", "font"].includes(req.resourceType()) ||
          new URL(req.url()).origin !== new URL(url).origin ||
          req.method() !== "GET"
        )
          return await route.abort();
        if (req.isNavigationRequest() && req.url() === url) {
          await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: html,
          });
        } else {
          // Fulfill via the DNS-pinned HTTP client, never direct browser networking.
          const response = await requestPublic(req.url());
          await route.fulfill({
            status: response.status,
            contentType: String(
              response.headers["content-type"] || "text/plain",
            ),
            body: response.body,
          });
        }
      } catch {
        await route.abort();
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    const result = await page.content();
    await writeFile(cachedFile, result);
    return result;
  } finally {
    await browser.close();
  }
}
export async function collect(sources?: SourceConfig[]) {
  const owner = await acquireLock("collector", 3600000);
  if (!owner) return { busy: true, runs: [] };
  const runs = [];
  const locations = await readLocations();
  try {
    for (const config of sources ?? (await readSources())) {
      if (!config.enabled) continue;
      const run = await db.ingestRun.create({
        data: { source: config.name, area: config.area },
      });
      const stats = { found: 0, new: 0, updated: 0, removed: 0 };
      const errors: string[] = [];
      const detailed = new Set<string>();
      const seenListings = new Set<string>();
      try {
        if (!config.urls.length)
          throw new Error("Add one or more inventory URLs");
        const pages = [...new Set(config.urls)];
        for (const url of pages) {
          try {
            const renewed = await db.jobLock.updateMany({
              where: { key: "collector", owner },
              data: { expiresAt: new Date(Date.now() + 3600000) },
            });
            if (!renewed.count)
              throw new Error("Collector lease lost; retry this source later");
            let html = await politeFetch(url);
            if (config.render) html = await renderAllowed(url, html);
            if (config.autoPaginate) {
              for (const next of inventoryPages(html, url)) {
                if (pages.includes(next)) continue;
                if (pages.length >= config.maxInventoryPages) {
                  const warning =
                    "Inventory page limit reached; source coverage is incomplete.";
                  if (!errors.includes(warning)) errors.push(warning);
                  break;
                }
                pages.push(next);
              }
            }
            const parsed = adapters[config.adapter].parse(html, url, config);
            if (!parsed.length && !verifiedEmptyRegionalPage(html, url))
              throw new Error(
                "No listing records parsed. Check source markup or selectors; existing records are preserved.",
              );
            // Alternate links to the same page must not replace enriched boat
            // details with a second summary card or inflate the run's count.
            const listings = parsed.filter((listing) => {
              if (seenListings.has(listing.sourceListingId)) return false;
              seenListings.add(listing.sourceListingId);
              return true;
            });
            stats.found += listings.length;
            const summaryObservedAt = await observedAt(url);
            await db.ingestRun.update({
              where: { id: run.id },
              data: { ...stats, errors },
            });
            for (let listing of listings) {
              let detailHtml: string | undefined;
              let seenAt = summaryObservedAt;
              listing = {
                ...listing,
                specs: {
                  ...listing.specs,
                  summaryCheckedAt: summaryObservedAt,
                },
              };
              if (
                config.followDetails &&
                listing.sourceUrl !== url &&
                (!config.detailMakes?.length ||
                  config.detailMakes.some(
                    (m) => m.toLowerCase() === listing.make?.toLowerCase(),
                  )) &&
                (config.detailMaxLength == null ||
                  listing.length == null ||
                  listing.length < config.detailMaxLength) &&
                !detailed.has(listing.sourceUrl) &&
                detailed.size < config.maxDetailPages
              ) {
                detailed.add(listing.sourceUrl);
                try {
                  if (new URL(listing.sourceUrl).origin !== new URL(url).origin)
                    throw new Error(
                      "Detail URL must stay on the inventory origin",
                    );
                  detailHtml = await politeFetch(listing.sourceUrl);
                  const detail = adapters[config.adapter]
                    .parse(detailHtml, listing.sourceUrl, config)
                    .find((l) => l.sourceUrl === listing.sourceUrl);
                  if (!detail)
                    throw new Error("No matching detail record parsed");
                  const detailObservedAt = await observedAt(listing.sourceUrl);
                  seenAt =
                    detailObservedAt > seenAt ? detailObservedAt : seenAt;
                  detail.specs.detailsCheckedAt = detailObservedAt;
                  listing = {
                    ...listing,
                    ...Object.fromEntries(
                      Object.entries(detail).filter(
                        ([, v]) => v !== null && v !== undefined && v !== "",
                      ),
                    ),
                    photos: detail.photos.length
                      ? [
                          ...new Set([...listing.photos, ...detail.photos]),
                        ].slice(0, 100)
                      : listing.photos,
                    specs: { ...listing.specs, ...detail.specs },
                    rawPayload: {
                      summary: listing.rawPayload,
                      detail: detail.rawPayload,
                    },
                  };
                } catch (e) {
                  errors.push(
                    `${listing.sourceUrl}: ${e instanceof Error ? e.message : String(e)}`,
                  );
                }
              }
              listing = locateListing(
                { ...listing, firstSeenAt: seenAt, lastSeenAt: seenAt },
                locations,
              );
              const result = await upsertListing(
                {
                  ...listing,
                  rawPayload: {
                    url,
                    cachedPage: cacheFile(url),
                    ...(detailHtml
                      ? { detailPage: cacheFile(listing.sourceUrl) }
                      : {}),
                    normalized: listing.rawPayload,
                  },
                },
                { dedupe: true },
              );
              if (result.isNew) stats.new++;
              else if (result.updated) stats.updated++;
              if (listing.status === "removed") stats.removed++;
            }
          } catch (e) {
            errors.push(
              `${url}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      const result = await db.ingestRun.update({
        where: { id: run.id },
        data: {
          ...stats,
          errors,
          status: errors.length ? "error" : "success",
          completedAt: new Date(),
        },
      });
      logger.info(
        { source: config.name, ...stats, errors },
        "Ingestion completed",
      );
      runs.push(result);
    }
    await db.listing.updateMany({
      where: {
        isSample: false,
        status: "active",
        lastSeenAt: { lt: new Date(Date.now() - 14 * 86400000) },
      },
      data: { status: "stale" },
    });
    return { busy: false, runs };
  } finally {
    await releaseLock("collector", owner);
  }
}
