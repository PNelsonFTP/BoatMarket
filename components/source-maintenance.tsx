"use client";
import { useState } from "react";
import { api, type Connection } from "@/lib/client";
type Review = {
  reviewHash: string;
  applyAllowed: boolean;
  message: string;
  quality: {
    counts: { parsed: number; previous: number };
    coverage: Record<string, number>;
    issues: string[];
    changes: {
      id: string;
      kind: string;
      fields: { field: string; before: unknown; after: unknown }[];
    }[];
  };
  preview: { id: string; title: string }[];
};
export function SourceMaintenance({
  connection,
  onRefresh,
}: {
  connection: Connection | null;
  onRefresh: () => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(""),
    [url, setUrl] = useState(""),
    [at, setAt] = useState(""),
    [html, setHtml] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!connection) return null;
  async function run(apply = false) {
    if (!connection) return;
    setBusy(true);
    setMessage("");
    try {
      if (apply && review) {
        const result = await api<{ applied: string[] }>(
          connection,
          "/admin/source-tools/apply",
          { reviewHash: review.reviewHash },
        );
        setMessage(
          `Applied ${result.applied.length} reviewed records. A verified backup and apply report were saved.`,
        );
        setReview(null);
        await onRefresh();
      } else
        setReview(
          await api<Review>(connection, "/admin/source-tools/preview", {
            sourceId,
            url,
            observedAt: new Date(at).toISOString(),
            html,
          }),
        );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card space-y-3">
      <h2 className="font-semibold">Parser maintenance</h2>
      <p className="text-sm muted">
        Load a locally captured page to preview parser results and field
        changes. Nothing is changed until you review and apply the exact
        preview. Existing ads absent from the page are preserved.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          Configured source ID
          <input
            className="input w-full mt-1"
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setReview(null);
            }}
            placeholder="teds"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Original page URL
          <input
            className="input w-full mt-1"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setReview(null);
            }}
            placeholder="https://dealer.example/inventory"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Observed at
          <input
            className="input w-full mt-1"
            type="datetime-local"
            value={at}
            onChange={(e) => {
              setAt(e.target.value);
              setReview(null);
            }}
          />
        </label>
      </div>
      <input
        aria-label="Captured source HTML"
        type="file"
        accept=".html,.htm,text/html"
        onChange={async (e) => {
          setReview(null);
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            setMessage("Capture exceeds 10 MiB");
            return;
          }
          setHtml(await f.text());
        }}
      />
      <button
        className="button"
        disabled={busy || !html || !sourceId || !url || !at}
        onClick={() => void run()}
      >
        Preview parser and differences
      </button>
      {review && (
        <div className="space-y-2">
          <p>
            {review.quality.counts.parsed} parsed ads ·{" "}
            {review.quality.changes.length} differences ·{" "}
            {review.applyAllowed
              ? "Quality checks passed"
              : "Quality checks failed"}
          </p>
          {review.quality.issues.map((issue) => (
            <p className="text-sm text-red-700" key={issue}>
              {issue}
            </p>
          ))}
          <details>
            <summary>Review field changes</summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(review.quality.changes, null, 2)}
            </pre>
          </details>
          <p className="grid gap-1 text-sm">{review.message}</p>
          <button
            className="button"
            disabled={busy || !review.applyAllowed}
            onClick={() => void run(true)}
          >
            Apply this reviewed preview
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="grid gap-1 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
