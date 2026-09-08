/** Browser persistence belongs to one deployment, mode, and backend. */
export type WorkspaceMode = "sample" | "snapshot" | "live";
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function deploymentPath(
  basePath = process.env.NEXT_PUBLIC_BASE_PATH || "",
) {
  return `/${basePath.split("/").filter(Boolean).join("/")}`;
}
export function backendIdentity(input: string) {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use an HTTP or HTTPS backend URL without embedded credentials",
    );
  if (url.search || url.hash)
    throw new Error("Use the backend base URL without a query or fragment");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
export function storageKey(scope: string, name: string, basePath?: string) {
  return `boatscout:v2:${encodeURIComponent(deploymentPath(basePath))}:${encodeURIComponent(scope)}:${name}`;
}
export function workspaceKey(
  mode: WorkspaceMode,
  backend?: string,
  basePath?: string,
) {
  if (mode === "live" && !backend)
    throw new Error("A live workspace needs a backend identity");
  return storageKey(
    mode === "live" ? `live:${backendIdentity(backend!)}` : mode,
    "workspace",
    basePath,
  );
}
export function tokenKey(backend: string, basePath?: string) {
  return storageKey(`live:${backendIdentity(backend)}`, "token", basePath);
}
export function legacyWorkspaces(
  storage: StorageLike,
): { mode: "sample" | "snapshot"; value: unknown }[] {
  return (["sample", "snapshot"] as const).flatMap((mode) => {
    try {
      const value = storage.getItem(`boatscout.${mode}.workspace`);
      return value ? [{ mode, value: JSON.parse(value) as unknown }] : [];
    } catch {
      return [];
    }
  });
}
/** Never remove or implicitly adopt unscoped keys: they may belong to another Pages project. */
export function readStoredWorkspace(
  storage: StorageLike,
  mode: WorkspaceMode,
  backend?: string,
  basePath?: string,
): unknown {
  const value = storage.getItem(workspaceKey(mode, backend, basePath));
  return value ? JSON.parse(value) : undefined;
}
