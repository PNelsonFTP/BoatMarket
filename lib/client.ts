"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { makeSeed, seedWorkspace } from "./seed";
import { listingSchema, type Listing, type Workspace } from "./types";
import { asset } from "./utils";
import { lakeHolidayWorkspace } from "./lake-holiday";
export type Connection = { url: string; token: string };
export async function api<T = unknown>(
  connection: Connection,
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(
    `${connection.url.replace(/\/$/, "")}/api${path}`,
    {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(connection.token
          ? { Authorization: `Bearer ${connection.token}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Backend returned ${response.status}`);
  return data as T;
}
export function useBoatStore() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [workspace, setWorkspace] = useState<Workspace>(seedWorkspace);
  const [mode, setMode] = useState<"sample" | "snapshot" | "live">("sample");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const revision = useRef(0);
  const connectionRef = useRef<Connection | null>(null);
  const workspaceRef = useRef(workspace);
  const queue = useRef(Promise.resolve());
  const saveEpoch = useRef(0);
  const pendingSaves = useRef(0);
  const modeRef = useRef(mode);
  const setData = useCallback((data: unknown, date?: string) => {
    setListings(z.array(listingSchema).parse(data));
    setUpdatedAt(date || new Date().toISOString());
  }, []);
  const refresh = useCallback(
    async (c = connectionRef.current) => {
      if (!c) return;
      const [data, state] = await Promise.all([
        api<{ listings: Listing[]; generatedAt: string }>(c, "/listings"),
        api<{ workspace: Workspace; revision: number }>(c, "/workspace"),
      ]);
      setData(data.listings, data.generatedAt);
      setWorkspace(state.workspace);
      workspaceRef.current = state.workspace;
      revision.current = state.revision;
      setError("");
    },
    [setData],
  );
  useEffect(() => {
    let cancelled = false;
    async function init() {
      let restored: Workspace = seedWorkspace();
      try {
        const cached = localStorage.getItem("boatscout.sample.workspace");
        if (cached) restored = { ...restored, ...JSON.parse(cached) };
      } catch {
        /* storage unavailable */
      }
      setListings(makeSeed());
      setWorkspace(restored);
      workspaceRef.current = restored;
      try {
        const config: { snapshot?: boolean } = await fetch(
          asset("/data-mode.json"),
        ).then((r) => (r.ok ? r.json() : {}));
        if (config.snapshot) {
          const snapshot = await fetch(asset("/snapshot.json")).then((r) =>
            r.json(),
          );
          if (!cancelled) {
            setData(snapshot.listings, snapshot.generatedAt);
            setMode("snapshot");
            modeRef.current = "snapshot";
            const cached = localStorage.getItem("boatscout.snapshot.workspace");
            const w = cached
              ? { ...lakeHolidayWorkspace(), ...JSON.parse(cached) }
              : lakeHolidayWorkspace();
            setWorkspace(w);
            workspaceRef.current = w;
          }
        }
        const url = localStorage.getItem("boatscout.apiUrl"),
          token = sessionStorage.getItem("boatscout.token");
        if (url && token && !cancelled) {
          const c = { url, token };
          await refresh(c);
          setConnection(c);
          connectionRef.current = c;
          setMode("live");
          modeRef.current = "live";
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not restore workspace",
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [refresh, setData]);
  async function connect(url: string, password: string) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol))
      throw new Error("Use an HTTP or HTTPS backend URL");
    if (parsed.username || parsed.password)
      throw new Error("Enter the password separately");
    const login = await api<{ token: string }>({ url, token: "" }, "/login", {
      password,
    });
    const c = { url: url.replace(/\/$/, ""), token: login.token };
    await refresh(c);
    setConnection(c);
    connectionRef.current = c;
    setMode("live");
    modeRef.current = "live";
    localStorage.setItem("boatscout.apiUrl", c.url);
    sessionStorage.setItem("boatscout.token", c.token);
  }
  async function disconnect() {
    const c = connectionRef.current;
    if (c) await api(c, "/logout", {}).catch(() => {});
    connectionRef.current = null;
    setConnection(null);
    sessionStorage.removeItem("boatscout.token");
    setMode("sample");
    modeRef.current = "sample";
    setListings(makeSeed());
    let w = seedWorkspace();
    try {
      w =
        JSON.parse(
          localStorage.getItem("boatscout.sample.workspace") || "null",
        ) || w;
    } catch {}
    setWorkspace(w);
    workspaceRef.current = w;
    setUpdatedAt(null);
    setError("");
  }
  function updateWorkspace(change: (previous: Workspace) => Workspace) {
    const next = change(workspaceRef.current);
    workspaceRef.current = next;
    setWorkspace(next);
    const c = connectionRef.current;
    if (!c) {
      try {
        localStorage.setItem(
          `boatscout.${modeRef.current}.workspace`,
          JSON.stringify(next),
        );
      } catch {
        setError(
          "Browser storage is full or unavailable. Export your workspace to preserve changes.",
        );
      }
      return;
    }
    setSyncing(true);
    const epoch = saveEpoch.current;
    pendingSaves.current++;
    queue.current = queue.current
      .then(async () => {
        if (epoch !== saveEpoch.current || connectionRef.current !== c) return;
        const result = await api<{ revision: number }>(
          c,
          "/workspace",
          { workspace: next, revision: revision.current },
          "PUT",
        );
        revision.current = result.revision;
      })
      .catch(async (e) => {
        saveEpoch.current++;
        setError(`Changes could not be saved: ${e.message}`);
        try {
          const state = await api<{ workspace: Workspace; revision: number }>(
            c,
            "/workspace",
          );
          revision.current = state.revision;
          workspaceRef.current = state.workspace;
          setWorkspace(state.workspace);
        } catch {
          /* preserve visible state on network failure */
        }
      })
      .finally(() => {
        pendingSaves.current--;
        setSyncing(pendingSaves.current > 0);
      });
  }
  function importSnapshot(input: unknown) {
    const data = z
      .object({
        generatedAt: z.string().datetime().optional(),
        listings: z
          .array(listingSchema)
          .max(10000)
          .refine(
            (items) => new Set(items.map((l) => l.id)).size === items.length,
            "Listing IDs must be unique",
          ),
      })
      .parse(input);
    setData(data.listings, data.generatedAt);
    connectionRef.current = null;
    setConnection(null);
    sessionStorage.removeItem("boatscout.token");
    setMode("snapshot");
    modeRef.current = "snapshot";
    const ids = new Set(data.listings.map((l) => l.id));
    const previous = workspaceRef.current;
    const w = {
      ...previous,
      favorites: previous.favorites.filter((id) => ids.has(id)),
      notes: Object.fromEntries(
        Object.entries(previous.notes).filter(([id]) => ids.has(id)),
      ),
    };
    setWorkspace(w);
    workspaceRef.current = w;
    try {
      localStorage.setItem("boatscout.snapshot.workspace", JSON.stringify(w));
    } catch {
      /* session remains usable */
    }
    setError("");
  }
  return {
    listings,
    workspace,
    mode,
    connection,
    ready,
    error,
    setError,
    syncing,
    updatedAt,
    connect,
    disconnect,
    refresh,
    updateWorkspace,
    importSnapshot,
  };
}
export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
