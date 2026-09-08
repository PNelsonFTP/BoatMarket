"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { makeSeed, seedWorkspace } from "./seed";
import { listingSchema, type Listing, type Workspace } from "./types";
import { asset } from "./utils";
import { lakeHolidayWorkspace } from "./lake-holiday";
import {
  backendIdentity,
  readStoredWorkspace,
  storageKey,
  tokenKey,
  workspaceKey,
  type WorkspaceMode,
} from "./storage";
import {
  previewWorkspaceRestore,
  workspaceRestoreSchema,
} from "./import-workspace";
import { parseListingImport } from "./import-listings";
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
function cachedWorkspace(
  mode: WorkspaceMode,
  fallback: Workspace,
  backend?: string,
): Workspace {
  const cached = readStoredWorkspace(localStorage, mode, backend);
  return cached === undefined ? fallback : workspaceRestoreSchema.parse(cached);
}
export function useBoatStore() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [workspace, setWorkspace] = useState<Workspace>(seedWorkspace);
  const [mode, setMode] = useState<WorkspaceMode>("sample");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const revision = useRef(0);
  const connectionRef = useRef<Connection | null>(null);
  const workspaceRef = useRef(workspace);
  const queue = useRef(Promise.resolve(true));
  const saveEpoch = useRef(0);
  const pendingSaves = useRef(0);
  const modeRef = useRef(mode);
  const offline = useRef<{
    mode: "sample" | "snapshot";
    listings: Listing[];
    updatedAt: string | null;
  }>({ mode: "sample", listings: [], updatedAt: null });
  const setData = useCallback((data: unknown, date?: string) => {
    setListings(z.array(listingSchema).parse(data));
    setUpdatedAt(date || new Date().toISOString());
  }, []);
  const applyWorkspace = useCallback((next: Workspace) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);
  function cache(
    next: Workspace,
    currentMode = modeRef.current,
    c = connectionRef.current,
  ) {
    try {
      localStorage.setItem(
        workspaceKey(currentMode, c?.url),
        JSON.stringify(next),
      );
    } catch {
      setError(
        "Browser storage is full or unavailable. Export your workspace to preserve changes.",
      );
    }
  }
  const refresh = useCallback(
    async (c = connectionRef.current) => {
      if (!c) return;
      await queue.current;
      const [data, state] = await Promise.all([
        api<{ listings: Listing[]; generatedAt: string }>(c, "/listings"),
        api<{ workspace: Workspace; revision: number }>(c, "/workspace"),
      ]);
      const parsed = workspaceRestoreSchema.parse(state.workspace);
      setData(data.listings, data.generatedAt);
      applyWorkspace(parsed);
      revision.current = state.revision;
      setError("");
      try {
        localStorage.setItem(
          workspaceKey("live", c.url),
          JSON.stringify(parsed),
        );
      } catch {
        /* The backend remains the authoritative copy. */
      }
    },
    [setData, applyWorkspace],
  );
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const sampleListings = makeSeed();
      let restored = seedWorkspace();
      try {
        restored = cachedWorkspace("sample", restored);
      } catch {
        setError(
          "The saved sample workspace could not be read. Its stored copy has been preserved.",
        );
      }
      setListings(sampleListings);
      applyWorkspace(restored);
      offline.current = {
        mode: "sample",
        listings: sampleListings,
        updatedAt: null,
      };
      try {
        const config: { snapshot?: boolean } = await fetch(
          asset("/data-mode.json"),
        ).then((r) => (r.ok ? r.json() : {}));
        if (config.snapshot) {
          const snapshot = parseListingImport(
            await fetch(asset("/snapshot.json")).then((r) => r.json()),
          );
          if (cancelled) return;
          setData(snapshot.listings, snapshot.generatedAt);
          setMode("snapshot");
          modeRef.current = "snapshot";
          let w = lakeHolidayWorkspace();
          try {
            w = cachedWorkspace("snapshot", w);
          } catch {
            setError(
              "The saved snapshot workspace could not be read. Its stored copy has been preserved.",
            );
          }
          applyWorkspace(w);
          offline.current = {
            mode: "snapshot",
            listings: snapshot.listings,
            updatedAt: snapshot.generatedAt || null,
          };
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      try {
        const url = localStorage.getItem(storageKey("connection", "apiUrl"));
        const token = url ? sessionStorage.getItem(tokenKey(url)) : null;
        if (url && token && !cancelled) {
          const c = { url: backendIdentity(url), token };
          await refresh(c);
          if (cancelled) return;
          setConnection(c);
          connectionRef.current = c;
          setMode("live");
          modeRef.current = "live";
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [refresh, setData, applyWorkspace]);
  async function connect(input: string, password: string) {
    const url = backendIdentity(input);
    await queue.current;
    const login = await api<{ token: string }>({ url, token: "" }, "/login", {
      password,
    });
    const c = { url, token: login.token };
    await refresh(c);
    saveEpoch.current++;
    setConnection(c);
    connectionRef.current = c;
    setMode("live");
    modeRef.current = "live";
    try {
      localStorage.setItem(storageKey("connection", "apiUrl"), c.url);
      sessionStorage.setItem(tokenKey(c.url), c.token);
    } catch {
      setError(
        "Connected for this session. Browser storage is unavailable, so reconnect after reloading.",
      );
    }
  }
  async function disconnect() {
    await queue.current;
    const c = connectionRef.current;
    if (c) {
      await api(c, "/logout", {}).catch(() => {});
      try {
        sessionStorage.removeItem(tokenKey(c.url));
      } catch {
        /* storage unavailable */
      }
    }
    saveEpoch.current++;
    connectionRef.current = null;
    setConnection(null);
    const state = offline.current;
    setMode(state.mode);
    modeRef.current = state.mode;
    setListings(state.listings);
    setUpdatedAt(state.updatedAt);
    let w =
      state.mode === "snapshot" ? lakeHolidayWorkspace() : seedWorkspace();
    setError("");
    try {
      w = cachedWorkspace(state.mode, w);
    } catch {
      setError(
        "Could not read the browser workspace. Its stored copy has been preserved.",
      );
    }
    applyWorkspace(w);
  }
  function updateWorkspace(
    change: (previous: Workspace) => Workspace,
  ): Promise<boolean> {
    const next = workspaceRestoreSchema.parse(change(workspaceRef.current));
    applyWorkspace(next);
    const c = connectionRef.current;
    if (!c) {
      try {
        localStorage.setItem(
          workspaceKey(modeRef.current),
          JSON.stringify(next),
        );
        return Promise.resolve(true);
      } catch {
        setError(
          "Browser storage is full or unavailable. Export your workspace to preserve changes.",
        );
        return Promise.resolve(false);
      }
    }
    setSyncing(true);
    const epoch = saveEpoch.current;
    pendingSaves.current++;
    const save = queue.current
      .then(async () => {
        if (epoch !== saveEpoch.current || connectionRef.current !== c)
          return false;
        try {
          const result = await api<{ revision: number }>(
            c,
            "/workspace",
            { workspace: next, revision: revision.current },
            "PUT",
          );
          revision.current = result.revision;
          cache(next, "live", c);
          return true;
        } catch (e) {
          saveEpoch.current++;
          setError(`Changes could not be saved: ${(e as Error).message}`);
          try {
            const state = await api<{ workspace: Workspace; revision: number }>(
              c,
              "/workspace",
            );
            revision.current = state.revision;
            applyWorkspace(workspaceRestoreSchema.parse(state.workspace));
          } catch {
            /* Preserve visible state on network failure; exports remain available. */
          }
          return false;
        }
      })
      .finally(() => {
        pendingSaves.current--;
        setSyncing(pendingSaves.current > 0);
      });
    queue.current = save;
    return save;
  }
  function importSnapshot(input: unknown) {
    if (connectionRef.current)
      throw new Error(
        "Disconnect before loading a browser snapshot, or import into the connected backend.",
      );
    const data = parseListingImport(input);
    setError("");
    // Archive the previous mode before opening the imported dataset; missing IDs remain recoverable.
    cache(workspaceRef.current);
    if (modeRef.current !== "snapshot") {
      try {
        const previousSnapshot = readStoredWorkspace(localStorage, "snapshot");
        if (previousSnapshot) {
          const previous = workspaceRestoreSchema.parse(previousSnapshot);
          const current = workspaceRef.current;
          const allIds = new Set([
            ...previous.favorites,
            ...current.favorites,
            ...Object.keys(previous.notes),
            ...Object.keys(current.notes),
            ...data.listings.map((l) => l.id),
            ...previous.alerts.flatMap((a) => a.listingIds),
            ...current.alerts.flatMap((a) => a.listingIds),
          ]);
          applyWorkspace(
            previewWorkspaceRestore(previous, current, allIds).workspace,
          );
        }
      } catch {
        throw new Error(
          "The previous snapshot workspace could not be merged safely. Export or repair it before importing another dataset.",
        );
      }
    }
    setData(data.listings, data.generatedAt);
    setMode("snapshot");
    modeRef.current = "snapshot";
    cache(workspaceRef.current, "snapshot", null);
    offline.current = {
      mode: "snapshot",
      listings: data.listings,
      updatedAt: data.generatedAt || new Date().toISOString(),
    };
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
