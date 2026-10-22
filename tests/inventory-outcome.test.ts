import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceConfigSchema } from "../server/adapters/types";
import {
  acceptInventoryBaseline,
  readInventoryBaseline,
  inventoryConfigHash,
  failureReason,
} from "../server/inventory-outcome";
import { verifiedEmptyRegionalPage } from "../server/adapters/pagination";
let directory = "";
const source = sourceConfigSchema.parse({
  id: "fixture",
  name: "Fixture",
  adapter: "dealer",
  enabled: true,
  urls: ["https://dealer.example/inventory"],
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "boatscout-baselines-"));
  vi.stubEnv("REFRESH_REPORT_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("stores a config-specific accepted count without depending on whole-run status", async () => {
  const at = "2026-10-21T12:00:00.000Z";
  await acceptInventoryBaseline(source, {
    runId: "partial-details",
    ingestRunId: "ingest",
    count: 722,
    capturedAt: at,
    acceptedAt: at,
    oldestObservationAt: at,
    newestObservationAt: at,
    verifiedEmpty: false,
    qualityReportPath: "reports/quality.json",
    collectionReportPath: "reports/partial-details.json",
  });
  expect(await readInventoryBaseline(source)).toMatchObject({
    runId: "partial-details",
    count: 722,
    quality: "passed",
  });
  expect(
    await readInventoryBaseline({
      ...source,
      urls: ["https://dealer.example/changed-inventory"],
    }),
  ).toBeNull();
  expect(
    inventoryConfigHash({ ...source, maxDetailPages: 1, cacheMaxAgeHours: 1 }),
  ).toBe(inventoryConfigHash(source));
  expect(
    inventoryConfigHash({ ...source, quality: { minRecords: 2 } }),
  ).not.toBe(inventoryConfigHash(source));
});
it.each(["decatur", "chambana"])(
  "recognizes captured legitimate empty %s pages and rejects missing/challenged/contradictory markup",
  async (area) => {
    const html = await readFile(
      `tests/fixtures/craigslist-empty-${area}.html`,
      "utf8",
    );
    const url = `https://www.craigslist.org/search/area/${area}?cat=boo`;
    expect(verifiedEmptyRegionalPage(html, url)).toBe(true);
    expect(verifiedEmptyRegionalPage("", url)).toBe(false);
    expect(
      verifiedEmptyRegionalPage(
        html.replace(/id="ld_searchpage_results"/, 'id="missing"'),
        url,
      ),
    ).toBe(false);
    expect(
      verifiedEmptyRegionalPage(
        html.replace(/"itemListElement":\[\]/, '"itemListElement":[{}]'),
        url,
      ),
    ).toBe(false);
    expect(
      verifiedEmptyRegionalPage(
        html.replace(
          "</body>",
          '<li class="cl-static-search-result">Unparsed ad</li></body>',
        ),
        url,
      ),
    ).toBe(false);
    expect(
      verifiedEmptyRegionalPage(
        html.replace("</body>", "Access denied. Verify you are human.</body>"),
        url,
      ),
    ).toBe(false);
    expect(
      verifiedEmptyRegionalPage(
        html,
        url.replace("craigslist.org", "craigslist.org.evil.example"),
      ),
    ).toBe(false);
    expect(
      verifiedEmptyRegionalPage(html, url.replace(area, "wrong-area")),
    ).toBe(false);
  },
);
it.each([
  ["Source returned HTTP 403", "access-denied"],
  ["Could not verify robots.txt (HTTP 429)", "robots-policy"],
  ["Source returned HTTP 429", "rate-limited"],
  ["Source returned an access challenge", "challenge"],
  ["getaddrinfo EAI_AGAIN dealer.example", "transient-network"],
  ["getaddrinfo ENOTFOUND dealer.example", "transient-network"],
  ["Source returned HTTP 503", "transient-network"],
  ["No matching detail record parsed", "parse"],
])("classifies %s as %s", (message, reason) =>
  expect(failureReason(new Error(message))).toBe(reason),
);
