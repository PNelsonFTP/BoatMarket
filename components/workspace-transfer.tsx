"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import { api, downloadJson, type Connection } from "@/lib/client";
import { type Listing, type Workspace } from "@/lib/types";
import { legacyWorkspaces } from "@/lib/storage";
import {
  parseWorkspaceExport,
  previewWorkspaceRestore,
  workspaceReplacementChanges,
  type RestoreMode,
} from "@/lib/import-workspace";
import {
  IMPORT_MAX_BYTES,
  importChunks,
  mergeListingImport,
  parseListingImport,
  runListingImport,
  type ImportChunkResult,
  type ImportManifest,
} from "@/lib/import-listings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
type Props = {
  connection: Connection | null;
  listings: Listing[];
  workspace: Workspace;
  mode: string;
  onImport: (value: unknown) => void;
  onRefresh: () => Promise<void>;
  onChange: (
    change: (workspace: Workspace) => Workspace,
  ) => void | Promise<boolean>;
};
export function WorkspaceTransfer({
  connection,
  listings,
  workspace,
  mode,
  onImport,
  onRefresh,
  onChange,
}: Props) {
  const [listingDraft, setListingDraft] = useState<ReturnType<
    typeof parseListingImport
  > | null>(null);
  const [workspaceDraft, setWorkspaceDraft] = useState<Workspace | null>(null);
  const [listingMode, setListingMode] = useState<RestoreMode>("merge");
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manifest, setManifest] = useState<ImportManifest | null>(null);
  const [idMap, setIdMap] = useState<Record<string, string>>({});
  const [legacy, setLegacy] = useState<ReturnType<typeof legacyWorkspaces>>([]);
  useEffect(() => {
    try {
      setLegacy(legacyWorkspaces(localStorage));
    } catch {
      /* Storage unavailable */
    }
  }, []);
  // A preview becomes stale if any note/search/favorite changes while the dialog is open.
  const [previewBase, setPreviewBase] = useState<Workspace | null>(null);
  const stale = workspaceDraft !== null && previewBase !== workspace;
  const preview = useMemo(() => {
    if (!workspaceDraft) return null;
    try {
      return {
        value: previewWorkspaceRestore(
          workspace,
          workspaceDraft,
          new Set(listings.map((l) => l.id)),
          restoreMode,
          idMap,
        ),
        error: "",
      };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [workspace, workspaceDraft, listings, restoreMode, idMap]);
  function prepareWorkspace(value: unknown) {
    const parsed = parseWorkspaceExport(value);
    setWorkspaceDraft(parsed);
    setPreviewBase(workspace);
    setRestoreMode("merge");
    setReviewed(false);
    setError("");
    setMessage("");
  }
  async function readFile(
    file: File | undefined,
    kind: "listings" | "workspace",
  ) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      if (file.size > IMPORT_MAX_BYTES)
        throw new Error(
          "File exceeds 12 MiB. Split larger exports before importing.",
        );
      const input: unknown = JSON.parse(await file.text());
      if (kind === "workspace") prepareWorkspace(input);
      else {
        const parsed = parseListingImport(input);
        importChunks(parsed.listings);
        setListingDraft(parsed);
        setListingMode("merge");
        setReviewed(false);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importListings() {
    if (!listingDraft) return;
    setBusy(true);
    setError("");
    setMessage("");
    setManifest(null);
    try {
      if (connection) {
        const result = await runListingImport(
          listingDraft.listings,
          connection.url,
          (items) =>
            api<ImportChunkResult>(connection, "/import", { listings: items }),
          setManifest,
        );
        setIdMap(result.idMap);
        await onRefresh();
        if (
          result.failed.length ||
          result.uncertainIds.length ||
          result.unattemptedIds.length
        )
          setError(
            "Import stopped with an incomplete outcome. Download the manifest for accepted, failed, uncertain, and unattempted IDs. Refresh and reconcile uncertain IDs before retrying.",
          );
        else {
          setMessage(
            `Imported ${result.acceptedIds.length.toLocaleString()} listings (${result.new} new, ${result.updated} changed). Backend favorites and notes were preserved.`,
          );
          setListingDraft(null);
        }
      } else {
        const merged = mergeListingImport(listings, listingDraft.listings);
        const next =
          listingMode === "merge" ? merged.listings : listingDraft.listings;
        onImport({ ...listingDraft, listings: next });
        setIdMap(listingMode === "merge" ? merged.idMap : {});
        setMessage(
          `Loaded ${next.length.toLocaleString()} listings for this session. Personal data remains saved; references absent from this dataset are retained for a later matching import.`,
        );
        setListingDraft(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restoreWorkspace() {
    if (!preview?.value || stale) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      // Always provide the exact pre-restore state as a recoverable local download.
      downloadJson("boatscout-workspace-before-restore.json", {
        version: 1,
        workspace,
      });
      const saved = await onChange(() => preview.value!.workspace);
      if (saved === false)
        throw new Error(
          "The workspace was not saved. Review the connection/conflict message and refresh before retrying; the previous workspace was downloaded.",
        );
      setMessage(
        `Workspace ${restoreMode === "merge" ? "merged" : "replaced"}. A copy from before the restore was downloaded.`,
      );
      setWorkspaceDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const missingPersonalIds = listingDraft
    ? [
        ...new Set([...workspace.favorites, ...Object.keys(workspace.notes)]),
      ].filter((id) => !listingDraft.listings.some((l) => l.id === id)).length
    : 0;
  return (
    <>
      <div className="button-row">
        <label className="button">
          <Upload size={15} />
          Import listings
          <input
            aria-label="Import listing JSON"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void readFile(e.target.files?.[0], "listings");
              e.target.value = "";
            }}
          />
        </label>
        <label className="button">
          <Upload size={15} />
          Restore workspace
          <input
            aria-label="Restore workspace JSON"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void readFile(e.target.files?.[0], "workspace");
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="small muted">
        Personal data is separate for this website deployment, sample/snapshot
        modes, and each connected backend. A listing import never replaces
        backend notes or favorites. Workspace restore needs a preview and
        confirmation.
      </p>
      {legacy.length > 0 && (
        <details className="setup-help">
          <summary>Review older browser workspaces ({legacy.length})</summary>
          <p>
            Earlier versions used shared browser keys. Choose a copy to preview
            before merging it into this {mode} workspace. The original copy
            remains untouched; backend sessions require a fresh login.
          </p>
          <div className="button-row">
            {legacy.map((entry) => (
              <button
                key={entry.mode}
                className="button"
                onClick={() => {
                  try {
                    prepareWorkspace(entry.value);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Review legacy {entry.mode} workspace
              </button>
            ))}
          </div>
        </details>
      )}
      {message && (
        <p role="status" className="success-banner">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {manifest && (
        <div className="notice" aria-live="polite">
          <p>
            Import progress: {manifest.acceptedIds.length.toLocaleString()} /{" "}
            {manifest.total.toLocaleString()} accepted ·{" "}
            {manifest.completedChunks} / {manifest.chunks} chunks complete
          </p>
          <progress
            aria-label="Listing import progress"
            max={manifest.total}
            value={manifest.acceptedIds.length}
          />
          <p className="small">
            {manifest.failed.length} failures · {manifest.uncertainIds.length}{" "}
            uncertain IDs · {manifest.unattemptedIds.length} unattempted IDs
          </p>
          <button
            className="button"
            onClick={() =>
              downloadJson("boatscout-import-manifest.json", manifest)
            }
          >
            <Download size={15} />
            Download import manifest
          </button>
        </div>
      )}
      <Dialog
        open={!!listingDraft}
        onOpenChange={(open) => {
          if (!open && !busy) setListingDraft(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Review listing import</DialogTitle>
          <DialogDescription>
            {listingDraft?.listings.length.toLocaleString()} validated listings
            for {connection ? connection.url : "this browser session"}.
          </DialogDescription>
          <p>
            {connection
              ? `Import runs in ${listingDraft ? importChunks(listingDraft.listings).length : 0} sequential chunks, each at most 1,000 listings and 12 MiB. Existing source identities are updated. Completed records remain saved if a later record fails.`
              : "Merge adds and updates source listings while retaining the current dataset. Replace changes the visible dataset; any personal references to missing listings remain saved."}
          </p>
          {!connection && (
            <label>
              Listing import mode
              <select
                value={listingMode}
                onChange={(e) => {
                  setListingMode(e.target.value as RestoreMode);
                  setReviewed(false);
                }}
              >
                <option value="merge">
                  Merge with current listings (recommended)
                </option>
                <option value="replace">Replace visible listing dataset</option>
              </select>
            </label>
          )}
          {!connection && listingMode === "replace" && (
            <p className="notice">
              {missingPersonalIds} saved or noted listing IDs would be absent
              from the visible dataset. Their personal records remain stored.
            </p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy}
            />
            I reviewed the import destination and behavior.
          </label>
          {busy && (
            <p role="status">
              {manifest
                ? `${manifest.acceptedIds.length.toLocaleString()} / ${manifest.total.toLocaleString()} listings accepted…`
                : "Importing…"}
            </p>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || !reviewed}
            onClick={() => void importListings()}
          >
            {busy ? "Importing…" : "Confirm listing import"}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!workspaceDraft}
        onOpenChange={(open) => {
          if (!open && !busy) setWorkspaceDraft(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Review workspace restore</DialogTitle>
          <DialogDescription>
            Restore personal data into{" "}
            {connection
              ? connection.url
              : `this deployment’s ${mode} workspace`}
            . No listings are imported by this operation.
          </DialogDescription>
          <label>
            Workspace restore mode
            <select
              value={restoreMode}
              onChange={(e) => {
                setRestoreMode(e.target.value as RestoreMode);
                setReviewed(false);
              }}
            >
              <option value="merge">
                Merge, preserving current edits (recommended)
              </option>
              <option value="replace">
                Replace current personal workspace
              </option>
            </select>
          </label>
          {preview?.value && (
            <>
              <p>
                Result: {preview.value.workspace.favorites.length} favorites ·{" "}
                {Object.keys(preview.value.workspace.notes).length} notes ·{" "}
                {preview.value.workspace.savedSearches.length} searches ·{" "}
                {preview.value.workspace.rules.length} rules ·{" "}
                {preview.value.workspace.referencePoints.length} reference
                places.
              </p>
              <p className="small">
                {preview.value.mappedIds} imported IDs mapped using this
                session’s listing import.{" "}
                {preview.value.preservedNoteConflicts.length} conflicting
                current notes and {preview.value.preservedNamedConflicts}{" "}
                existing search/rule/alert/place entries preserved.
              </p>
              {preview.value.unknownIds.length > 0 && (
                <details open className="setup-help">
                  <summary>
                    {preview.value.unknownIds.length} unknown imported listing
                    IDs will be skipped
                  </summary>
                  <p>
                    Import the matching listings first to restore these
                    references. The original export remains your backup.
                  </p>
                  <textarea
                    aria-label="Unknown imported listing IDs"
                    readOnly
                    rows={4}
                    value={preview.value.unknownIds.join("\n")}
                  />
                </details>
              )}
            </>
          )}
          {restoreMode === "replace" && preview?.value && (
            <details open className="setup-help">
              <summary>
                {
                  workspaceReplacementChanges(
                    workspace,
                    preview.value.workspace,
                  ).length
                }{" "}
                entries removed or overwritten
              </summary>
              <textarea
                aria-label="Workspace replacement changes"
                rows={5}
                readOnly
                value={
                  workspaceReplacementChanges(
                    workspace,
                    preview.value.workspace,
                  ).join("\n") ||
                  "No current entries would be removed or overwritten."
                }
              />
            </details>
          )}
          {restoreMode === "replace" && (
            <p className="notice">
              Replace removes personal entries absent from the imported
              workspace, including current notes, favorites, saved searches,
              rules, alerts, and reference places. A copy of the current
              workspace will download before the save.
            </p>
          )}
          {stale && (
            <div className="notice">
              The current workspace changed after this preview opened.{" "}
              <button
                className="text-button"
                onClick={() => {
                  setPreviewBase(workspace);
                  setReviewed(false);
                }}
              >
                Refresh restore preview
              </button>
            </div>
          )}
          {(error || preview?.error) && (
            <p role="alert" className="error-text">
              {error || preview?.error}
            </p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy || stale}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            {restoreMode === "replace"
              ? "I reviewed the removed entries and want to replace this workspace."
              : "I reviewed the merge and any skipped listing IDs."}
          </label>
          <button
            className="button primary"
            disabled={busy || !reviewed || stale || !preview?.value}
            onClick={() => void restoreWorkspace()}
          >
            {busy ? "Saving…" : "Confirm workspace restore"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
