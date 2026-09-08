"use client";
import { useState } from "react";
import { X, Ship, Download } from "lucide-react";
import { FIELDS } from "@/lib/catalog";
import { type BoatResult, DEFAULT_FILTERS } from "@/lib/types";
import { fieldValue } from "@/lib/search";
import { asset, money } from "@/lib/utils";
import { downloadComparisonPacket } from "@/lib/comparison-export";
export function Compare({
  boats,
  onRemove,
  onOpen,
}: {
  boats: BoatResult[];
  onRemove: (id: string) => void;
  onOpen: (b: BoatResult) => void;
}) {
  const [differences, setDifferences] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  if (!boats.length)
    return (
      <div className="empty-state">
        <Ship size={38} />
        <h2>Give your favorites a closer look</h2>
        <p>Add up to six boats using Compare on a listing.</p>
      </div>
    );
  const fields = FIELDS.filter(
    (f) => !["contains", "excludes", "distance"].includes(f.key),
  ).filter((f) =>
    boats.some((b) => fieldValue(b, f.key, DEFAULT_FILTERS) != null),
  );
  return (
    <>
      <div className="results-toolbar">
        <strong>{boats.length} boats side by side</strong>
        <button
          type="button"
          className="button"
          onClick={() => {
            try {
              downloadComparisonPacket(boats);
              setExportMessage(
                "Comparison packet downloaded. Open it to print or save as PDF; saved workspace notes are omitted.",
              );
            } catch {
              setExportMessage(
                "The browser could not download the comparison packet. Please try again.",
              );
            }
          }}
        >
          <Download size={16} /> Download comparison packet
        </button>
        <label className="check-label">
          <input
            type="checkbox"
            checked={differences}
            onChange={(e) => setDifferences(e.target.checked)}
          />
          Differences only
        </label>
      </div>
      {exportMessage && <p role="status">{exportMessage}</p>}
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th>THE DETAILS THAT MATTER</th>
              {boats.map((b) => (
                <th key={b.id}>
                  <div className="compare-photo">
                    {b.photos[0] && (
                      <img
                        src={
                          b.photos[0].startsWith("/")
                            ? asset(b.photos[0])
                            : b.photos[0]
                        }
                        alt={b.isSample ? "Illustrative boat" : b.title}
                      />
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Remove ${b.title} from comparison`}
                      onClick={() => onRemove(b.id)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <button className="compare-title" onClick={() => onOpen(b)}>
                    {b.title}
                  </button>
                  <strong>{money(b.price)}</strong>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const values = boats.map((b) =>
                fieldValue(b, f.key, DEFAULT_FILTERS),
              );
              const diff = new Set(values.map((v) => v ?? null)).size > 1;
              if (differences && !diff) return null;
              return (
                <tr key={f.key} className={diff ? "different" : ""}>
                  <th>
                    {f.label}
                    {f.unit ? ` (${f.unit})` : ""}
                  </th>
                  {values.map((v, i) => (
                    <td key={i}>
                      {v == null ? (
                        <span className="muted">Unknown</span>
                      ) : typeof v === "boolean" ? (
                        v ? (
                          "Yes"
                        ) : (
                          "No"
                        )
                      ) : typeof v === "number" ? (
                        Number(v.toFixed(1)).toLocaleString()
                      ) : (
                        String(v)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
