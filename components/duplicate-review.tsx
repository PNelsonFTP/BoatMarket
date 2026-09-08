"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Connection } from "@/lib/client";
import type { DuplicateAd, DuplicateReviewData } from "@/lib/duplicates";
import { VesselTimeline } from "./vessel-timeline";

function AdLink({
  ad,
  onTimeline,
}: {
  ad: DuplicateAd;
  onTimeline?: (id: string) => void;
}) {
  return (
    <div className="duplicate-ad">
      <a href={ad.url} target="_blank" rel="noopener noreferrer">
        {ad.title}
      </a>
      <p>
        {ad.source} · {ad.location || "Location unknown"} ·{" "}
        {ad.price == null ? "Price unknown" : `$${ad.price.toLocaleString()}`} ·{" "}
        {ad.status}
      </p>
      <small>Reported HIN: {ad.hin || "Not supplied"}</small>
      {ad.distance != null && (
        <p className="small muted">
          {Math.round(ad.distance)} straight-line miles from the queue reference
        </p>
      )}
      {onTimeline && (
        <button
          className="text-button"
          type="button"
          onClick={() => onTimeline(ad.vesselId ?? ad.id)}
        >
          View vessel history
        </button>
      )}
    </div>
  );
}

export function DuplicateReview({
  connection,
  onRefresh,
}: {
  connection: Connection | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [data, setData] = useState<DuplicateReviewData | null>(null);
  const [activeOnly, setActiveOnly] = useState(true),
    [nearbyOnly, setNearbyOnly] = useState(true),
    [radius, setRadius] = useState(150),
    [reviewState, setReviewState] = useState<"unreviewed" | "changed" | "all">(
      "unreviewed",
    ),
    [timelineId, setTimelineId] = useState<string | null>(null),
    [reviewNote, setReviewNote] = useState("");
  const [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const query = new URLSearchParams({
    offset: String(offset),
    limit: "25",
    activeOnly: String(activeOnly),
    reviewState,
    ...(nearbyOnly ? { radiusMiles: String(radius) } : {}),
  }).toString();
  const load = useCallback(async () => {
    if (!connection) return;
    const result = await api<DuplicateReviewData>(
      connection,
      `/duplicates?${query}`,
    );
    setData(result);
    if (offset > 0 && offset >= result.candidateTotal)
      setOffset(Math.floor(Math.max(0, result.candidateTotal - 1) / 25) * 25);
  }, [connection, offset, query]);
  useEffect(() => {
    if (!connection) {
      setData(null);
      return;
    }
    let cancelled = false;
    api<DuplicateReviewData>(connection, `/duplicates?${query}`)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
          if (offset > 0 && offset >= result.candidateTotal)
            setOffset(
              Math.floor(Math.max(0, result.candidateTotal - 1) / 25) * 25,
            );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, offset, query]);
  async function decide(
    leftId: string,
    rightId: string,
    decision: "same" | "different" | "undo",
  ) {
    if (!connection) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(connection, "/duplicates/decisions", {
        leftId,
        rightId,
        decision,
        note: reviewNote,
      });
      setReviewNote("");
      setMessage(
        decision === "same"
          ? "Same-vessel review saved. All ads, prices, notes and favorites are preserved."
          : decision === "different"
            ? "Separation saved. Collection will respect this decision."
            : "Review override removed. Matching modern-format HINs may still group these ads.",
      );
      await load();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate review failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="settings-card duplicate-review"
      aria-labelledby="duplicate-review-title"
    >
      <h2 id="duplicate-review-title">Duplicate review</h2>
      <p>
        Review possible cross-listings and reposts. Photos, titles and matching
        specifications are suggestions; automatic groups require a matching
        modern-format HIN. The identifier has not been independently verified
        with the manufacturer.
      </p>
      {!connection ? (
        <p>
          Connect to the local backend to save review decisions. Snapshot groups
          update after the next export.
        </p>
      ) : (
        <>
          <div className="duplicate-actions">
            <label className="check-label">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => {
                  setActiveOnly(e.target.checked);
                  setOffset(0);
                }}
              />
              Both ads active
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={nearbyOnly}
                onChange={(e) => {
                  setNearbyOnly(e.target.checked);
                  setOffset(0);
                }}
              />
              Near Lake Holiday
            </label>
            {nearbyOnly && (
              <label>
                Radius in straight-line miles
                <input
                  aria-label="Duplicate queue radius"
                  type="number"
                  min={1}
                  max={12500}
                  value={radius}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value >= 1 && value <= 12500) {
                      setRadius(value);
                      setOffset(0);
                    }
                  }}
                />
              </label>
            )}
            <label>
              Review state
              <select
                aria-label="Duplicate queue review state"
                value={reviewState}
                onChange={(e) => {
                  setReviewState(e.target.value as typeof reviewState);
                  setOffset(0);
                }}
              >
                <option value="unreviewed">Not yet reviewed</option>
                <option value="changed">Changed since review</option>
                <option value="all">All evidence pairs</option>
              </select>
            </label>
          </div>
          <label>
            Optional evidence note for the next decision
            <textarea
              aria-label="Duplicate review evidence note"
              value={reviewNote}
              maxLength={5000}
              rows={2}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void load()
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Refresh duplicate review
          </button>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          {!data ? (
            <p>Loading review queue…</p>
          ) : (
            <>
              <p>
                <strong>
                  {data.counts.advertisements.toLocaleString()} ads
                </strong>{" "}
                · {data.counts.groups} groups containing{" "}
                {data.counts.groupedAds} ads ·{" "}
                {data.counts.displayUnits.toLocaleString()} display units.
                Ungrouped ads can still describe the same boat.
              </p>
              <h4>Review pairs ({data.candidateTotal})</h4>
              {data.candidates.length === 0 && (
                <p>No unreviewed suggestions on this page.</p>
              )}
              {data.candidates.map((pair) => (
                <article
                  className="duplicate-pair"
                  key={`${pair.left.id}:${pair.right.id}`}
                >
                  <div className="duplicate-pair-ads">
                    <AdLink ad={pair.left} onTimeline={setTimelineId} />
                    <AdLink ad={pair.right} onTimeline={setTimelineId} />
                  </div>
                  <p>
                    <strong>
                      {pair.evidence.automatic
                        ? "Matching HIN"
                        : "Needs review"}
                    </strong>{" "}
                    · {pair.evidence.reasons.join(" · ")}
                  </p>
                  {pair.reviewedDecision && (
                    <p>
                      Saved decision: {pair.reviewedDecision}
                      {pair.changedSinceReview
                        ? " · observed facts changed since that review"
                        : " · unchanged since review"}
                    </p>
                  )}
                  {pair.evidence.conflicts.length > 0 && (
                    <p className="duplicate-conflict">
                      {pair.evidence.conflicts.join(" · ")}
                    </p>
                  )}
                  <div className="duplicate-actions">
                    <button
                      type="button"
                      className="button"
                      disabled={
                        busy ||
                        pair.evidence.conflicts.includes(
                          "Different modern-format HINs",
                        )
                      }
                      onClick={() =>
                        void decide(pair.left.id, pair.right.id, "same")
                      }
                    >
                      Same vessel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void decide(pair.left.id, pair.right.id, "different")
                      }
                    >
                      Different vessels
                    </button>
                  </div>
                </article>
              ))}
              <div className="duplicate-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy || offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 25))}
                >
                  Previous pairs
                </button>
                <span>
                  Showing {data.candidates.length ? offset + 1 : 0}–
                  {offset + data.candidates.length} of {data.candidateTotal}
                </span>
                <button
                  type="button"
                  className="button"
                  disabled={busy || offset + 25 >= data.candidateTotal}
                  onClick={() => setOffset(offset + 25)}
                >
                  Next pairs
                </button>
              </div>
              <details>
                <summary>Current vessel groups ({data.groups.length})</summary>
                <p>
                  Each separation applies to a pair of ads and is enforced
                  throughout its group.
                </p>
                {data.groups.map((group) => (
                  <article className="duplicate-pair" key={group.id}>
                    <p>
                      <strong>{group.members.length} advertisements</strong> ·{" "}
                      {group.reason}
                    </p>
                    {group.members.map((member, index) => (
                      <div key={member.id} className="duplicate-group-member">
                        <AdLink ad={member} onTimeline={setTimelineId} />
                        {index > 0 && (
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void decide(
                                group.members[0].id,
                                member.id,
                                "different",
                              )
                            }
                          >
                            Separate from first ad
                          </button>
                        )}
                      </div>
                    ))}
                  </article>
                ))}
              </details>
              <details>
                <summary>
                  Saved review decisions ({data.decisions.length})
                </summary>
                <p>
                  Undo removes a review override. Choose Different vessels to
                  keep ads apart even when their reported HIN matches.
                </p>
                {data.decisions.map((d) => (
                  <article
                    className="duplicate-pair"
                    key={`${d.leftId}:${d.rightId}`}
                  >
                    <div className="duplicate-pair-ads">
                      <AdLink ad={d.left} onTimeline={setTimelineId} />
                      <AdLink ad={d.right} onTimeline={setTimelineId} />
                    </div>
                    <p>
                      <strong>
                        {d.decision === "same"
                          ? "Reviewed as same vessel"
                          : "Keep as different vessels"}
                      </strong>
                      {d.updatedAt &&
                        ` · ${new Date(d.updatedAt).toLocaleString()}`}
                    </p>
                    {d.changedSinceReview && (
                      <p>Observed facts changed since this review.</p>
                    )}
                    {d.conflict && (
                      <p role="status">
                        This same-vessel decision is currently blocked:{" "}
                        {d.conflict}.
                      </p>
                    )}
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => void decide(d.leftId, d.rightId, "undo")}
                    >
                      Undo decision
                    </button>
                  </article>
                ))}
              </details>
              {timelineId && (
                <VesselTimeline
                  key={timelineId}
                  connection={connection}
                  id={timelineId}
                  initiallyOpen
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
