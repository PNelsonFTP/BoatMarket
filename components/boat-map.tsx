"use client";
import { useEffect, useRef, useState } from "react";
import type { BoatResult, SearchArea } from "@/lib/types";
import type * as Leaflet from "leaflet";
import { money } from "@/lib/utils";
export default function BoatMap({
  boats,
  onOpen,
  onArea,
  drawInitially = false,
}: {
  boats: BoatResult[];
  onOpen: (b: BoatResult) => void;
  onArea: (a: SearchArea) => void;
  drawInitially?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<Leaflet.LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(drawInitially);
  const [error, setError] = useState("");
  const drawRef = useRef(drawing);
  const areaRef = useRef(onArea);
  const openRef = useRef(onOpen);
  const start = useRef<Leaflet.LatLng | null>(null);
  const rectangle = useRef<Leaflet.Rectangle | null>(null);
  const [corner, setCorner] = useState(false);
  useEffect(() => {
    drawRef.current = drawing;
    start.current = null;
    setCorner(false);
  }, [drawing]);
  areaRef.current = onArea;
  openRef.current = onOpen;
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const L = await import("leaflet");
      await import("leaflet.markercluster");
      if (disposed || !container.current) return;
      const m = L.map(container.current).setView([42.5, -87.6], 6);
      map.current = m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      })
        .on("tileerror", () =>
          setError(
            "Map tiles are unavailable. Boat markers and list results remain available.",
          ),
        )
        .addTo(m);
      layers.current = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
      });
      m.addLayer(layers.current);
      m.on("click", (e) => {
        if (!drawRef.current) return;
        if (!start.current) {
          start.current = e.latlng;
          setCorner(true);
          if (rectangle.current) m.removeLayer(rectangle.current);
          return;
        }
        const bounds = L.latLngBounds(start.current, e.latlng);
        if (
          bounds.getSouth() === bounds.getNorth() ||
          bounds.getWest() === bounds.getEast()
        )
          return;
        rectangle.current = L.rectangle(bounds, {
          color: "#147d82",
          weight: 2,
        }).addTo(m);
        areaRef.current({
          id: crypto.randomUUID(),
          name: "Map area",
          kind: "bbox",
          bbox: [
            bounds.getSouth(),
            bounds.getWest(),
            bounds.getNorth(),
            bounds.getEast(),
          ],
        });
        start.current = null;
        setDrawing(false);
      });
      setReady(true);
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
  }, []);
  useEffect(() => {
    if (!ready || !layers.current || !map.current) return;
    void import("leaflet").then((L) => {
      if (!layers.current || !map.current) return;
      layers.current.clearLayers();
      const points: Leaflet.LatLngExpression[] = [];
      for (const boat of boats) {
        if (boat.lat == null || boat.lng == null) continue;
        const coord: [number, number] = [boat.lat, boat.lng];
        points.push(coord);
        const marker = L.marker(coord, {
          icon: L.divIcon({
            className: "boat-map-marker",
            html: `<span>${boat.price == null ? "—" : `$${Math.round(boat.price / 1000)}k`}</span>`,
            iconSize: [56, 28],
            iconAnchor: [28, 14],
          }),
        });
        const button = document.createElement("button");
        button.className = "map-popup-button";
        button.textContent = `${boat.title} · ${money(boat.price)}`;
        button.onclick = () => openRef.current(boat);
        marker.bindPopup(button);
        layers.current.addLayer(marker);
      }
      if (points.length && !drawRef.current)
        map.current.fitBounds(L.latLngBounds(points), {
          padding: [35, 35],
          maxZoom: 10,
        });
    });
  }, [boats, ready]);
  const missing = boats.filter((b) => b.lat == null || b.lng == null).length;
  return (
    <div className="map-wrapper">
      <div className="map-actions">
        <button
          className={`button ${drawing ? "primary" : ""}`}
          onClick={() => setDrawing(!drawing)}
        >
          {drawing ? "Cancel drawing" : "Draw a search area"}
        </button>
        <span>
          {drawing
            ? corner
              ? "Click the opposite corner"
              : "Click the first corner of your area"
            : `${boats.length - missing} boats mapped${missing ? ` · ${missing} without coordinates` : ""}`}
        </span>
      </div>
      {error && <p className="notice">{error}</p>}
      <div
        ref={container}
        className="boat-map"
        aria-label="Map of boat listings"
        role="region"
      />
      <p className="small muted map-footnote">
        Map tiles require an internet connection. Use city/radius or state
        filters for keyboard-accessible area selection.
      </p>
    </div>
  );
}
