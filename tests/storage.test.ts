import { describe, expect, it } from "vitest";
import {
  backendIdentity,
  legacyWorkspaces,
  readStoredWorkspace,
  storageKey,
  tokenKey,
  workspaceKey,
  type StorageLike,
} from "../lib/storage";
class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
describe("deployment and backend browser isolation", () => {
  it("separates modes, Pages base paths, and backend identities", () => {
    const keys = [
      workspaceKey("sample", undefined, "/BoatMarket"),
      workspaceKey("snapshot", undefined, "/BoatMarket"),
      workspaceKey("sample", undefined, "/ClassicCars"),
      workspaceKey("sample", undefined, ""),
      workspaceKey("live", "http://localhost:4310", "/BoatMarket"),
      workspaceKey("live", "http://localhost:5310", "/BoatMarket"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(tokenKey("http://localhost:4310", "/BoatMarket")).not.toBe(
      tokenKey("http://localhost:5310", "/BoatMarket"),
    );
    expect(storageKey("preferences", "theme", "BoatMarket/")).toBe(
      storageKey("preferences", "theme", "/BoatMarket"),
    );
  });
  it("canonicalizes harmless trailing slash/default port but rejects credentials and queries", () => {
    expect(backendIdentity("HTTPS://Example.com:443/backend/")).toBe(
      "https://example.com/backend",
    );
    expect(tokenKey("https://example.com:443/")).toBe(
      tokenKey("https://example.com"),
    );
    expect(() =>
      backendIdentity("https://secret:password@example.com"),
    ).toThrow();
    expect(() => backendIdentity("https://example.com?token=secret")).toThrow();
    expect(() => workspaceKey("live")).toThrow();
  });
  it("never implicitly adopts or removes a legacy personal workspace", () => {
    const storage = new MemoryStorage();
    const legacy = { favorites: ["my-boat"], notes: { "my-boat": "private" } };
    storage.setItem("boatscout.snapshot.workspace", JSON.stringify(legacy));
    expect(
      readStoredWorkspace(storage, "snapshot", undefined, "/BoatMarket"),
    ).toBeUndefined();
    expect(
      readStoredWorkspace(storage, "snapshot", undefined, "/ClassicCars"),
    ).toBeUndefined();
    expect(legacyWorkspaces(storage)).toEqual([
      { mode: "snapshot", value: legacy },
    ]);
    storage.setItem(
      workspaceKey("snapshot", undefined, "/BoatMarket"),
      JSON.stringify(legacy),
    );
    expect(
      readStoredWorkspace(storage, "snapshot", undefined, "/BoatMarket"),
    ).toEqual(legacy);
    expect(
      readStoredWorkspace(storage, "snapshot", undefined, "/ClassicCars"),
    ).toBeUndefined();
    expect(storage.getItem("boatscout.snapshot.workspace")).toBe(
      JSON.stringify(legacy),
    );
  });
});
