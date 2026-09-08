"use client";
import { LAKE_RULES_URL, lakeLengthStatus } from "@/lib/lake-holiday";
import { useState } from "react";
import {
  Heart,
  ExternalLink,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Flag,
  Ship,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { FIELDS } from "@/lib/catalog";
import { type BoatResult, type Workspace, DEFAULT_FILTERS } from "@/lib/types";
import { asset, money } from "@/lib/utils";
import { distanceMiles, fieldValue } from "@/lib/search";
export function ListingDetail({
  boat,
  onClose,
  workspace,
  onFavorite,
  onNote,
  onCompare,
  compared,
  similar,
  onOpen,
}: {
  boat: BoatResult | null;
  onClose: () => void;
  workspace: Workspace;
  onFavorite: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onCompare: (id: string) => void;
  compared: boolean;
  similar: BoatResult[];
  onOpen: (b: BoatResult) => void;
}) {
  return (
    <Dialog
      open={!!boat}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {boat && (
        <DetailContent
          key={boat.id}
          boat={boat}
          workspace={workspace}
          onFavorite={onFavorite}
          onNote={onNote}
          onCompare={onCompare}
          compared={compared}
          similar={similar}
          onOpen={onOpen}
        />
      )}
    </Dialog>
  );
}
function DetailContent({
  boat,
  workspace,
  onFavorite,
  onNote,
  onCompare,
  compared,
  similar,
  onOpen,
}: {
  boat: BoatResult;
  workspace: Workspace;
  onFavorite: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onCompare: (id: string) => void;
  compared: boolean;
  similar: BoatResult[];
  onOpen: (b: BoatResult) => void;
}) {
  const [photo, setPhoto] = useState(0);
  const [note, setNote] = useState(workspace.notes[boat.id] || "");
  const [saved, setSaved] = useState(false);
  const [flag, setFlag] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [allSpecs, setAllSpecs] = useState(false);
  return (
    <DialogContent className="detail-modal">
      <div className="detail-gallery">
        {boat.photos[photo] ? (
          <img
            src={
              boat.photos[photo].startsWith("/")
                ? asset(boat.photos[photo])
                : boat.photos[photo]
            }
            alt={
              boat.isSample
                ? "Illustrative boat photograph"
                : `${boat.title}, photo ${photo + 1}`
            }
          />
        ) : (
          <div className="no-photo">
            <Ship size={70} />
            <span>No photos provided</span>
          </div>
        )}
        {boat.photos.length > 1 && (
          <div className="gallery-controls">
            <button
              className="icon-button"
              aria-label="Previous photo"
              onClick={() =>
                setPhoto((photo + boat.photos.length - 1) % boat.photos.length)
              }
            >
              <ChevronLeft />
            </button>
            <span>
              {photo + 1} / {boat.photos.length}
            </span>
            <button
              className="icon-button"
              aria-label="Next photo"
              onClick={() => setPhoto((photo + 1) % boat.photos.length)}
            >
              <ChevronRight />
            </button>
          </div>
        )}
        {boat.isSample && (
          <span className="gallery-disclaimer">
            Fictional listing · photo is illustrative
          </span>
        )}
      </div>
      <div className="detail-content">
        <div className="detail-heading">
          <div>
            <div className="eyebrow">{boat.category || "BOAT LISTING"}</div>
            <DialogTitle>{boat.title}</DialogTitle>
            <DialogDescription>
              {boat.city || "Unknown location"}
              {boat.state ? `, ${boat.state}` : ""} ·{" "}
              {boat.sellerType || "Seller type unknown"}
            </DialogDescription>
          </div>
          <strong>{money(boat.price)}</strong>
        </div>
        <div className="detail-actions">
          <button className="button" onClick={() => onFavorite(boat.id)}>
            <Heart
              size={16}
              fill={
                boat.sourceLinks.some((l) => workspace.favorites.includes(l.id))
                  ? "currentColor"
                  : "none"
              }
            />
            {boat.sourceLinks.some((l) => workspace.favorites.includes(l.id))
              ? "Saved to shortlist"
              : "Save to shortlist"}
          </button>
          <button className="button" onClick={() => onCompare(boat.id)}>
            {compared ? <Check size={16} /> : null}
            {compared ? "Added to compare" : "Add to compare"}
          </button>
        </div>
        <div className="spec-highlights">
          {[
            ["Length", boat.length == null ? "Unknown" : `${boat.length} ft`],
            [
              "Power",
              boat.horsepower == null ? "Unknown" : `${boat.horsepower} hp`,
            ],
            ["Hours", boat.engineHours ?? "Unknown"],
            ["Propulsion", boat.propulsion ?? "Unknown"],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <section className="detail-section">
          <h3>About this boat</h3>
          <p className="description">
            {boat.description || "The source did not provide a description."}
          </p>
        </section>
        <section className="detail-section">
          <h3>
            Available from {boat.sourceLinks.length} source
            {boat.sourceLinks.length === 1 ? "" : "s"}
          </h3>
          {boat.sourceLinks.map((link) => (
            <div className="source-row" key={link.id}>
              <div>
                <strong>{link.source}</strong>
                <small>{boat.sellerName || "Seller not provided"}</small>
              </div>
              <span>{money(link.price)}</span>
              {boat.isSample ? (
                <span className="muted small">Sample only</span>
              ) : (
                <a
                  className="button"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View listing
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </section>
        <section className="detail-section">
          <h3>Price history</h3>
          {boat.priceHistory.length ? (
            <>
              <div className="price-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={boat.priceHistory.map((p) => ({
                      ...p,
                      date: new Date(p.at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      }),
                    }))}
                  >
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v / 1000}k`}
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      width={55}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      formatter={(value) => money(Number(value))}
                      contentStyle={{
                        background: "var(--surface)",
                        borderColor: "var(--line)",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="price"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="small">
                <summary>View price records</summary>
                <table className="data-table">
                  <tbody>
                    {boat.priceHistory.map((p, i) => (
                      <tr key={i}>
                        <td>{new Date(p.at).toLocaleString()}</td>
                        <td>{money(p.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="muted">No recorded prices yet.</p>
          )}
        </section>
        <section className="detail-section">
          <h3>Distance from your places</h3>
          {boat.specs.locationWarning && (
            <p className="error-text">{String(boat.specs.locationWarning)}</p>
          )}
          <p className="small muted">
            Straight-line miles, not driving distance.{" "}
            {String(
              boat.specs.locationPrecision || "Location as reported by source",
            )}
            .
          </p>
          <div className="reference-distances">
            {workspace.referencePoints.map((p) => (
              <div key={p.name}>
                <MapPin size={16} />
                <span>{p.name}</span>
                <strong>
                  {boat.lat != null && boat.lng != null
                    ? `${Math.round(distanceMiles(p, { lat: boat.lat, lng: boat.lng }))} mi`
                    : "Unknown"}
                </strong>
              </div>
            ))}
          </div>
        </section>
        {!boat.isSample && (
          <section className="detail-section">
            <h3>Lake Holiday screening</h3>
            {boat.specs.availability && (
              <p>
                {String(boat.specs.availability)} · confirm availability with
                the seller
              </p>
            )}
            <p>{lakeLengthStatus(boat)}</p>
            {boat.specs.lengthWarning && (
              <p className="error-text">{String(boat.specs.lengthWarning)}</p>
            )}
            {boat.specs.engineDescription && (
              <p>Engine as listed: {String(boat.specs.engineDescription)}</p>
            )}
            {boat.specs.powerWarning && (
              <p className="error-text">{String(boat.specs.powerWarning)}</p>
            )}
            <p className="small muted">
              Listed length may be rounded or exclude a molded platform.
              Registration and motor capacity require confirmation. Wakesurfing
              and wake-enhancing devices are prohibited by the published rules.
            </p>
            <a
              className="text-button"
              href={LAKE_RULES_URL}
              target="_blank"
              rel="noreferrer"
            >
              Review the 2024 association rulebook ↗
            </a>
          </section>
        )}
        <section className="detail-section">
          <div className="section-heading">
            <h3>Specifications</h3>
            <button
              className="text-button"
              onClick={() => setAllSpecs(!allSpecs)}
            >
              {allSpecs ? "Hide unknown fields" : "Show all fields"}
            </button>
          </div>
          <div className="spec-table">
            {FIELDS.filter(
              (f) => !["contains", "excludes", "distance"].includes(f.key),
            )
              .filter(
                (f) =>
                  allSpecs || fieldValue(boat, f.key, DEFAULT_FILTERS) != null,
              )
              .map((f) => {
                const value = fieldValue(boat, f.key, DEFAULT_FILTERS);
                return (
                  <div key={f.key}>
                    <span>
                      {f.label}
                      {f.unit ? ` (${f.unit})` : ""}
                    </span>
                    <strong>
                      {value == null
                        ? "Unknown"
                        : typeof value === "boolean"
                          ? value
                            ? "Yes"
                            : "No"
                          : typeof value === "number"
                            ? Number(value.toFixed(1)).toLocaleString()
                            : String(value)}
                      {boat.confidence[f.key] != null &&
                        boat.confidence[f.key] < 0.8 && (
                          <small
                            title={`Normalization confidence ${Math.round(boat.confidence[f.key] * 100)}%`}
                          >
                            {" "}
                            · inferred
                          </small>
                        )}
                    </strong>
                  </div>
                );
              })}
          </div>
          {boat.engines.length > 0 && (
            <div className="engine-list">
              {boat.engines.map((e, i) => (
                <p className="small muted" key={i}>
                  Engine {i + 1}:{" "}
                  {[
                    e.year,
                    e.make,
                    e.model,
                    e.hp == null ? null : `${e.hp} hp`,
                    e.hours == null ? "Hours unknown" : `${e.hours} h`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ))}
            </div>
          )}
        </section>
        <section className="detail-section">
          <h3>Your notes</h3>
          <label className="sr-only" htmlFor="boat-note">
            Notes for {boat.title}
          </label>
          <textarea
            id="boat-note"
            value={note}
            maxLength={20000}
            rows={4}
            placeholder="Questions for the seller, inspection notes, things to remember…"
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
          />
          <div className="section-heading">
            <small className="muted">
              {workspace.notes[boat.id] === note && saved
                ? "Saved"
                : "Private to this workspace"}
            </small>
            <button
              className="button primary"
              onClick={() => {
                onNote(boat.id, note);
                setSaved(true);
              }}
            >
              Save note
            </button>
          </div>
          <button
            className="text-button flag-button"
            onClick={() => setFlagging(!flagging)}
          >
            <Flag size={13} />
            Flag incorrect listing data
          </button>
          {flagging && (
            <div className="inline-input">
              <input
                aria-label="Data issue"
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                placeholder="What looks incorrect?"
                maxLength={2000}
              />
              <button
                className="button"
                disabled={!flag.trim()}
                onClick={() => {
                  const text = `${note}\n[Data flag] ${flag}`.trim();
                  setNote(text);
                  onNote(boat.id, text);
                  setFlag("");
                  setFlagging(false);
                  setSaved(true);
                }}
              >
                Save flag
              </button>
            </div>
          )}
        </section>
        {similar.length > 0 && (
          <section className="detail-section">
            <h3>Similar boats</h3>
            {similar.slice(0, 3).map((b) => (
              <button
                key={b.id}
                className="similar-row"
                onClick={() => onOpen(b)}
              >
                <span>{b.title}</span>
                <strong>{money(b.price)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
          </section>
        )}
        <div className="detail-footer">
          First seen {new Date(boat.firstSeenAt).toLocaleDateString()} · Last
          seen {new Date(boat.lastSeenAt).toLocaleDateString()} · {boat.status}
          {boat.isSample && (
            <>
              {" "}
              ·{" "}
              <a
                href={asset("/photo-credits.txt")}
                target="_blank"
                rel="noreferrer"
              >
                Photo credits & licenses
              </a>
            </>
          )}
        </div>
      </div>
    </DialogContent>
  );
}
