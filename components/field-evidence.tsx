"use client";
import type { Listing } from "@/lib/types";
import { currentFieldEvidence, provenanceFields } from "@/lib/provenance";
export function FieldEvidence({
  listing,
  field,
}: {
  listing: Listing;
  field: string;
}) {
  const evidence = currentFieldEvidence(listing, field);
  if (!evidence.current)
    return <small className="muted">Observation date unverified</small>;
  return (
    <small
      className={
        evidence.stale || evidence.conflicting ? "error-text" : "muted"
      }
    >
      <a href={evidence.current.sourceUrl} target="_blank" rel="noreferrer">
        {evidence.current.method === "import" ? "Imported" : "Reported"}{" "}
        {new Date(evidence.current.observedAt).toLocaleDateString()}
      </a>
      {evidence.stale ? " · older observation" : ""}
      {evidence.conflicting ? " · conflicting history" : ""}
    </small>
  );
}
export function FieldProvenance({ listing }: { listing: Listing }) {
  return (
    <details className="detail-section">
      <summary>Specification sources and observation history</summary>
      <p className="small muted">
        Dates refer to the observed source pages. Retained facts do not become
        fresh when a page is unavailable. Listing claims and equipment mentions
        still require inspection.
      </p>
      {provenanceFields(listing).map((field) => {
        const evidence = currentFieldEvidence(listing, field);
        return (
          <div key={field} className="settings-row">
            <div>
              <strong>
                {field.replace(/^equipment\./, "").replaceAll("_", " ")}
              </strong>
              <br />
              <FieldEvidence listing={listing} field={field} />
              {evidence.history.length > 1 && (
                <details>
                  <summary>{evidence.history.length} observations</summary>
                  {evidence.history.map((entry, index) => (
                    <p className="small" key={index}>
                      {String(entry.value)} · {entry.method} ·{" "}
                      {new Date(entry.observedAt).toLocaleString()} ·{" "}
                      <a
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source
                      </a>
                      {entry.evidence ? ` · ${entry.evidence}` : ""}
                    </p>
                  ))}
                </details>
              )}
            </div>
          </div>
        );
      })}
    </details>
  );
}
