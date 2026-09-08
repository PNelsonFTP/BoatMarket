import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { makeSeed, seedWorkspace } from "../../lib/seed";
import { workspaceKey } from "../../lib/storage";
import type { Listing } from "../../lib/types";
async function sample(page: Page) {
  await page.route("**/data-mode.json", (route) =>
    route.fulfill({ json: { snapshot: false } }),
  );
  await page.goto("/");
  await expect(page.locator(".boat-card").first()).toBeVisible();
}
test("legacy workspace migration requires preview and keeps its original copy", async ({
  page,
}) => {
  const legacy = {
    ...seedWorkspace(),
    favorites: [makeSeed()[0].id],
    notes: { [makeSeed()[0].id]: "Private older note" },
  };
  await page.addInitScript(
    (data) =>
      localStorage.setItem("boatscout.sample.workspace", JSON.stringify(data)),
    legacy,
  );
  await sample(page);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.endsWith(":workspace")),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByText("Review older browser workspaces (1)", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review legacy sample workspace" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Confirm workspace restore" }),
  ).toBeDisabled();
  await expect(dialog).toContainText("1 favorites · 1 notes");
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed the merge and any skipped listing IDs.",
    })
    .check();
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Confirm workspace restore" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "boatscout-workspace-before-restore.json",
  );
  await expect(dialog).not.toBeVisible();
  const data = await page.evaluate(
    (key) => ({
      current: JSON.parse(localStorage.getItem(key) || "null"),
      legacy: JSON.parse(
        localStorage.getItem("boatscout.sample.workspace") || "null",
      ),
    }),
    workspaceKey("sample"),
  );
  expect(data.current.notes[makeSeed()[0].id]).toBe("Private older note");
  expect(data.legacy).toEqual(legacy);
});
test("workspace merge previews unknown IDs and preserves a current note", async ({
  page,
}) => {
  const id = makeSeed()[0].id;
  const current = {
    ...seedWorkspace(),
    favorites: [id],
    notes: { [id]: "My newer note" },
  };
  await page.addInitScript(
    ({ key, workspace }) =>
      localStorage.setItem(key, JSON.stringify(workspace)),
    { key: workspaceKey("sample"), workspace: current },
  );
  await sample(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Restore workspace JSON", { exact: true })
    .setInputFiles({
      name: "workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...current,
          favorites: [id, "missing"],
          notes: { [id]: "Old note", missing: "Unavailable boat" },
        }),
      ),
    });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "1 unknown imported listing IDs will be skipped",
  );
  await expect(dialog).toContainText("1 conflicting current notes");
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed the merge and any skipped listing IDs.",
    })
    .check();
  await dialog
    .getByRole("button", { name: "Confirm workspace restore" })
    .click();
  await expect(dialog).not.toBeVisible();
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    workspaceKey("sample"),
  );
  expect(stored.notes).toEqual(current.notes);
  expect(stored.favorites).toEqual([id]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("connected import handles the full export in chunks and reports a failed save without losing current notes", async ({
  page,
}) => {
  const exported = JSON.parse(
    readFileSync(
      new URL("../../public/snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  const seed: Listing = exported.listings[0];
  let inventory = [seed];
  let workspace = {
    ...seedWorkspace(),
    favorites: [seed.id],
    notes: { [seed.id]: "Current backend note" },
  };
  let imports = 0,
    writes = 0;
  await page.route("http://127.0.0.1:54321/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      [
        "/api/admin/source-health",
        "/api/admin/locations",
        "/api/duplicates",
        "/api/admin/alerts",
        "/api/admin/operations",
        "/api/admin/routing",
        "/api/admin/locations/listings",
      ].includes(path)
    ) {
      await route.fulfill({
        status: 404,
        json: {
          error:
            "Optional review endpoint not included in this transfer fixture",
        },
      });
      return;
    }
    let json: unknown = {};
    if (path.endsWith("/login")) json = { token: "test-session" };
    if (path.endsWith("/listings"))
      json = { listings: inventory, generatedAt: new Date().toISOString() };
    if (path.endsWith("/workspace")) {
      if (route.request().method() === "PUT") {
        writes++;
        expect(route.request().postDataJSON().revision).toBe(4);
        workspace = {
          ...workspace,
          notes: { [seed.id]: "Concurrent backend edit" },
        };
        await route.fulfill({
          status: 409,
          json: { error: "Workspace changed; refresh before saving" },
        });
        return;
      }
      json = { workspace, revision: 4 };
    }
    if (path.endsWith("/admin"))
      json = {
        sources: [],
        runs: [],
        geocodes: [],
        counts: { listings: inventory.length, samples: 0 },
        failedDeliveries: [],
      };
    if (path.endsWith("/import")) {
      const listings: Listing[] = route.request().postDataJSON().listings;
      expect(listings.length).toBeLessThanOrEqual(1000);
      imports++;
      const merged = new Map(inventory.map((l) => [l.id, l]));
      for (const listing of listings) merged.set(listing.id, listing);
      inventory = [...merged.values()];
      json = {
        new: listings.length,
        updated: 0,
        acceptedIds: listings.map((l) => l.id),
        idMap: Object.fromEntries(listings.map((l) => [l.id, l.id])),
        failed: [],
      };
    }
    await route.fulfill({ json });
  });
  await sample(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Backend address" })
    .fill("http://127.0.0.1:54321");
  await page.getByLabel("Backend password", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Connect backend" }).click();
  await expect(
    page.getByText("Connected to http://127.0.0.1:54321", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Import listing JSON", { exact: true }).setInputFiles({
    name: "all-listings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    `${exported.listings.length.toLocaleString()} validated listings`,
  );
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed the import destination and behavior.",
    })
    .check();
  await dialog.getByRole("button", { name: "Confirm listing import" }).click();
  await expect(dialog).not.toBeVisible();
  expect(imports).toBe(Math.ceil(exported.listings.length / 1000));
  await expect(
    page.getByRole("button", { name: "Download import manifest" }),
  ).toBeVisible();
  expect(workspace.notes[seed.id]).toBe("Current backend note");
  await page
    .getByLabel("Restore workspace JSON", { exact: true })
    .setInputFiles({
      name: "workspace.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...workspace,
          notes: { [seed.id]: "Imported old note" },
        }),
      ),
    });
  await dialog
    .getByRole("checkbox", {
      name: "I reviewed the merge and any skipped listing IDs.",
    })
    .check();
  await dialog
    .getByRole("button", { name: "Confirm workspace restore" })
    .click();
  await expect(dialog).toContainText("The workspace was not saved");
  expect(writes).toBe(1);
  expect(workspace.notes[seed.id]).toBe("Concurrent backend edit");
});
