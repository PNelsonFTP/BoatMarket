import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import robotsParser from "robots-parser";
import { requestPublic } from "../server/network";
import { atomicJson } from "../server/refresh-report";

// Explicit bounded public research. Robots is always fetched first; no challenge,
// login, non-public endpoint, or cross-origin redirect is followed.
const urls = process.argv.slice(2);
if (!urls.length || urls.length > 20)
  throw new Error("Supply 1–20 public inventory URLs");
const runAt = new Date().toISOString();
const directory = `data/research/access-${runAt.replace(/[:.]/g, "-")}`;
await mkdir(directory, { recursive: true });
const results: Record<string, unknown>[] = [];
for (const url of urls) {
  const observedAt = new Date().toISOString();
  const result: Record<string, unknown> = { url, observedAt };
  try {
    const robotsUrl = new URL("/robots.txt", url).href;
    const robots = await requestPublic(robotsUrl);
    result.robots = { url: robotsUrl, status: robots.status };
    if (![200, 404, 410].includes(robots.status))
      throw new Error(`Robots unavailable: HTTP ${robots.status}`);
    if (
      robots.status === 200 &&
      /<html\b|captcha|verify you are human|access denied|cf-chl-/i.test(
        robots.body,
      )
    )
      throw new Error(
        "Robots response is HTML or an access challenge; permissions could not be verified",
      );
    const parser = robotsParser(
      robotsUrl,
      robots.status === 200 ? robots.body : "",
    );
    const allowed = parser.isAllowed(url, "BoatScout") !== false;
    result.robots = {
      url: robotsUrl,
      status: robots.status,
      allowed,
      sha256: createHash("sha256").update(robots.body).digest("hex"),
    };
    await writeFile(
      `${directory}/${new URL(url).hostname}-robots.txt`,
      robots.body,
    );
    if (!allowed) throw new Error("Collection disallowed by robots.txt");
    const crawlDelay = Math.max(2.5, parser.getCrawlDelay("BoatScout") || 0);
    if (crawlDelay > 60)
      throw new Error("Crawl delay above 60 seconds; stop for manual review");
    await delay(crawlDelay * 1000);
    const response = await requestPublic(url);
    result.page = { status: response.status, bytes: response.body.length };
    if (response.status !== 200)
      throw new Error(`Inventory returned HTTP ${response.status}`);
    if (
      /captcha|verify you are human|access denied|cf-chl-|automated access prohibited/i.test(
        response.body,
      ) &&
      response.body.length < 100000
    )
      throw new Error("Access challenge; no further requests");
    const hash = createHash("sha256").update(response.body).digest("hex");
    const file = `${directory}/${new URL(url).hostname}-${hash.slice(0, 12)}.html`;
    await writeFile(file, response.body);
    result.capture = { file, sha256: hash };
    result.status = "accessible";
  } catch (error) {
    result.status = "stopped";
    result.reason = error instanceof Error ? error.message : String(error);
  }
  results.push(result);
  await atomicJson(`${directory}/report.json`, { version: 1, runAt, results });
  console.log(JSON.stringify(result));
}
console.log(JSON.stringify({ report: `${directory}/report.json` }));
