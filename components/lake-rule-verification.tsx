"use client";
import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "@/lib/types";
import {
  LAKE_RULE_DOCUMENT,
  reconcileLakePolicy,
  screeningFingerprint,
  verificationApplies,
} from "@/lib/lake-verification";
export function LakeRuleVerification({
  workspace,
  onChange,
}: {
  workspace: Workspace;
  onChange: (
    change: (workspace: Workspace) => Workspace,
  ) => void | Promise<boolean>;
}) {
  const [includeCustomized, setIncludeCustomized] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [sourceUrl, setSourceUrl] = useState(LAKE_RULE_DOCUMENT.sourceUrl),
    [documentDate, setDocumentDate] = useState(LAKE_RULE_DOCUMENT.documentDate),
    [summary, setSummary] = useState("");
  const reconciliation = useMemo(
    () => reconcileLakePolicy(workspace, includeCustomized),
    [workspace, includeCustomized],
  );
  useEffect(() => setReviewed(false), [workspace, includeCustomized]);
  async function save(
    change: (previous: Workspace) => Workspace,
    success: string,
  ) {
    setBusy(true);
    setError("");
    try {
      if ((await onChange(change)) === false)
        throw new Error(
          "Workspace save failed or conflicted. Refresh before reviewing again.",
        );
      setMessage(success);
      setReviewed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>Lake rule verification</h2>
      <p>
        <a href={LAKE_RULE_DOCUMENT.sourceUrl} target="_blank" rel="noreferrer">
          Official rulebook, December 2, 2025
        </a>{" "}
        · publicly checked September 8, 2026.
      </p>
      <p>{LAKE_RULE_DOCUMENT.summary}</p>
      <p className="small muted">
        {LAKE_RULE_DOCUMENT.limitation} A search match is not registration
        approval.
      </p>
      {workspace.rules.map((rule) => (
        <div className="settings-row" key={rule.id}>
          <strong>{rule.name}</strong>
          <span className="small">
            {!rule.verification
              ? "Unverified custom screen"
              : !verificationApplies(rule)
                ? "Limits changed since review"
                : `${rule.verification.status} · document ${rule.verification.documentDate}`}
          </span>
        </div>
      ))}
      <details className="setup-help">
        <summary>Review adoption of the verified 21 ft policy</summary>
        <p>
          The earlier factory rule used strictly under 21 ft. This update
          includes exactly 21.0 ft, using the official manufacturer-length rule.
          Custom filters, favorites, notes and alert settings are preserved.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeCustomized}
            onChange={(e) => {
              setIncludeCustomized(e.target.checked);
              setReviewed(false);
            }}
          />
          Include customized versions of the Lake Holiday factory rule
        </label>
        <p>
          {reconciliation.changes.length} rule/search entries would change;{" "}
          {reconciliation.skipped.length} customized entries would stay
          unchanged.
        </p>
        <ul>
          {reconciliation.changes.map((change) => (
            <li key={change.scope}>
              {change.scope}
              {change.customized
                ? " (customized: replacing length policy only)"
                : ""}
            </li>
          ))}
        </ul>
        <label className="check-label">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed the document and the listed rule changes.
        </label>
        <button
          className="button primary"
          disabled={busy || !reviewed || !reconciliation.changes.length}
          onClick={() =>
            void save(
              (previous) =>
                reconcileLakePolicy(previous, includeCustomized).workspace,
              "Lake Holiday length policy updated. Other search and alert settings were preserved.",
            )
          }
        >
          Apply reviewed lake policy
        </button>
      </details>
      <details className="setup-help">
        <summary>Record a newer document or association confirmation</summary>
        <p>
          This saves your verification record on a selected rule. It does not
          automatically change its limits or approve any boat.
        </p>
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              (previous) => ({
                ...previous,
                rules: previous.rules.map((rule) =>
                  rule.id === selected
                    ? {
                        ...rule,
                        verification: {
                          status: confirmed
                            ? "association-confirmed"
                            : "public-document-reviewed",
                          sourceUrl,
                          documentDate,
                          reviewedAt: new Date().toISOString(),
                          summary,
                          screeningFingerprint: screeningFingerprint(rule),
                        },
                      }
                    : rule,
                ),
              }),
              "Rule verification recorded. Boat-specific registration still requires association confirmation.",
            );
          }}
        >
          <label>
            Rule being verified
            <select
              required
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select rule</option>
              {workspace.rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Official document or confirmation URL
            <input
              type="url"
              required
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </label>
          <label>
            Document date
            <input
              type="date"
              required
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
          <label>
            What you verified
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I received direct association confirmation of these screening
            limits.
          </label>
          <button className="button" disabled={busy}>
            Record rule verification
          </button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </section>
  );
}
