"use client";
import {
  Heart,
  MapPin,
  ArrowDownRight,
  ArrowUpRight,
  Ship,
  Check,
  Plus,
} from "lucide-react";
import type { BoatResult } from "@/lib/types";
import { money, asset } from "@/lib/utils";
import { priceDrop } from "@/lib/search";
export function BoatCard({
  boat,
  onOpen,
  onFavorite,
  onCompare,
  favorite = false,
  compared = false,
}: {
  boat: BoatResult;
  onOpen: () => void;
  onFavorite: () => void;
  onCompare: () => void;
  favorite?: boolean;
  compared?: boolean;
}) {
  const drop = priceDrop(boat);
  return (
    <article className="boat-card">
      <div className="boat-photo">
        <button
          className="photo-open"
          onClick={onOpen}
          aria-label={`View ${boat.title}`}
        >
          {boat.photos[0] ? (
            <img
              src={
                boat.photos[0].startsWith("/")
                  ? asset(boat.photos[0])
                  : boat.photos[0]
              }
              alt={boat.isSample ? "Illustrative boat photo" : boat.title}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <Ship size={48} />
          )}
        </button>
        <div className="photo-badges">
          {(boat.status !== "active" || boat.specs.availability) && (
            <span className="badge">
              {boat.status !== "active"
                ? boat.status
                : String(boat.specs.availability)}
            </span>
          )}
          {drop && drop.amount > 0 ? (
            <span className="badge reduced">
              <ArrowDownRight size={13} />
              {money(drop.amount)} drop
            </span>
          ) : (
            <span className="badge">
              {Date.now() - Date.parse(boat.firstSeenAt) < 3 * 86400000
                ? "New to BoatScout"
                : (boat.specs.condition as string) || "Condition unknown"}
            </span>
          )}
        </div>
        <button
          className={`favorite-button ${favorite ? "is-favorite" : ""}`}
          aria-label={`${favorite ? "Unsave" : "Save"} ${boat.title}`}
          aria-pressed={favorite}
          onClick={onFavorite}
        >
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
        {boat.isSample && (
          <span className="photo-credit-label">Illustrative photo</span>
        )}
      </div>
      <div className="boat-card-body">
        <div className="card-eyebrow">
          {boat.category || "Boat"} <span>· {boat.year || "Year unknown"}</span>
        </div>
        <button className="card-title" onClick={onOpen}>
          {boat.make && boat.model ? `${boat.make} ${boat.model}` : boat.title}
          <ArrowUpRight size={17} />
        </button>
        <div className="card-price">
          {money(boat.price)}{" "}
          {drop && drop.amount > 0 && (
            <del>{money((boat.price ?? 0) + drop.amount)}</del>
          )}
        </div>
        <div className="card-specs">
          <span>
            {boat.length == null ? "—" : Number(boat.length.toFixed(2))}{" "}
            <small>ft</small>
          </span>
          <span>
            {boat.horsepower ?? "—"} <small>hp</small>
          </span>
          <span>
            {boat.engineHours ?? "—"} <small>hours</small>
          </span>
          <span>{boat.propulsion || "Unknown"}</span>
        </div>
        <div className="card-location">
          <MapPin size={14} />
          {[boat.city, boat.state].filter(Boolean).join(", ") ||
            "Location unknown"}
          {boat.distance != null && (
            <span title="Straight-line distance; city locations are approximate">
              · ~{Math.round(boat.distance)} mi
            </span>
          )}
        </div>
        <div className="card-bottom">
          <span>
            <i className="source-dot" />
            {boat.source}
            {boat.sourceLinks.length > 1
              ? ` +${boat.sourceLinks.length - 1}`
              : ""}
          </span>
          <button
            className={compared ? "compare-small selected" : "compare-small"}
            onClick={onCompare}
            aria-pressed={compared}
          >
            {compared ? <Check size={14} /> : <Plus size={14} />}Compare
          </button>
        </div>
      </div>
    </article>
  );
}
