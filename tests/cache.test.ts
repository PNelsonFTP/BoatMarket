import { expect, it, vi } from "vitest";
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  stat: vi.fn(async () => ({ mtimeMs: Date.now() - 60000 })),
  readFile: vi.fn(async () => "<html>Previously observed inventory</html>"),
}));
vi.mock("../server/network", () => ({
  requestPublic: vi.fn(),
  publicUrl: vi.fn(),
}));
import { politeFetch } from "../server/collector";
import { requestPublic } from "../server/network";
it("reuses a recent local observation without repeatedly requesting the source", async () => {
  expect(await politeFetch("https://dealer.example/inventory")).toBe(
    "<html>Previously observed inventory</html>",
  );
  expect(requestPublic).not.toHaveBeenCalled();
});
