import type { BoatResult } from "./types";
import { LAKE_RULES_URL } from "./lake-holiday";

// All observed data is untrusted text, including URLs, names and specification keys.
export function escapePacketHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? escapePacketHtml(url.href)
      : null;
  } catch {
    return null;
  }
}
function text(value: unknown, unit = "") {
  return value == null || value === ""
    ? "Unknown"
    : `${escapePacketHtml(typeof value === "boolean" ? (value ? "Yes" : "No") : value)}${escapePacketHtml(unit)}`;
}
function date(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return "Unknown";
  return escapePacketHtml(new Date(value).toISOString());
}
function money(value: number | null) {
  return value == null
    ? "Unknown / ask seller"
    : text(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(value),
      );
}
function link(label: string, url: string) {
  const href = safeLink(url);
  return href
    ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapePacketHtml(label)}</a><span class="url">${escapePacketHtml(url)}</span>`
    : `${escapePacketHtml(label)} — source URL unavailable`;
}
const CHECKLIST = [
  "Seller name, phone, ownership/title and current availability confirmed:",
  "Asking price, deposit terms and included accessories confirmed:",
  "HIN photographed on hull and matched against ownership/title paperwork:",
  "Hull length independently measured, including molded platform; removable accessories identified:",
  "Hull capacity plate photographed; installed engine model and horsepower verified against rating:",
  "Current Lake Holiday rules and registration eligibility confirmed with the association:",
  "Engine serial number, hours, service history and independent mechanical inspection recorded:",
  "Hull, transom, floors, steering, wiring and safety equipment inspected:",
  "Trailer title/VIN, load rating, tires, bearings, brakes and lights checked:",
  "On-water test, cold start and inspection findings recorded:",
  "Road route, travel time, appointment and transport arrangements confirmed:",
  "Open questions and next steps:",
];

export function createComparisonPacket(
  boats: BoatResult[],
  options: { generatedAt?: string; referenceName?: string } = {},
) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const reference = options.referenceName
    ? ` from ${escapePacketHtml(options.referenceName)}`
    : " shown in the app";
  const rows: [string, (b: BoatResult) => string][] = [
    ["Asking price", (b) => money(b.price)],
    ["Source-reported status", (b) => text(b.status)],
    ["Make / model", (b) => `${text(b.make)} / ${text(b.model)}`],
    ["Reported model year", (b) => text(b.year)],
    ["Reported hull length", (b) => text(b.length, " ft")],
    ["Reported engine power", (b) => text(b.horsepower, " hp")],
    ["Reported engine hours", (b) => text(b.engineHours)],
    [
      "Category / propulsion",
      (b) => `${text(b.category)} / ${text(b.propulsion)}`,
    ],
    [
      "Reported boat location",
      (b) => text([b.city, b.state].filter(Boolean).join(", ")),
    ],
    [
      "Straight-line miles",
      (b) =>
        b.distance != null && Number.isFinite(b.distance)
          ? text(Math.round(b.distance * 10) / 10, " mi")
          : "Unknown",
    ],
    ["Reported HIN", (b) => text(b.specs.hin)],
    ["Inventory page observed (UTC)", (b) => date(b.specs.summaryCheckedAt)],
    ["Detail page observed (UTC)", (b) => date(b.specs.detailsCheckedAt)],
    ["Last listing observation (UTC)", (b) => date(b.lastSeenAt)],
  ];
  const overview = boats.length
    ? `<div class="table-wrap"><table><thead><tr><th>Reported information</th>${boats.map((b) => `<th>${escapePacketHtml(b.title)}${b.isSample ? "<br><strong>SAMPLE — fictional listing</strong>" : ""}</th>`).join("")}</tr></thead><tbody>${rows.map(([label, value]) => `<tr><th>${escapePacketHtml(label)}</th>${boats.map((b) => `<td>${value(b)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : "<p>No boats selected.</p>";
  const details = boats
    .map((b, index) => {
      const links = b.sourceLinks?.length
        ? b.sourceLinks
        : [{ id: b.id, source: b.source, url: b.sourceUrl, price: b.price }];
      const warnings = Object.entries(b.specs).filter(
        ([key, value]) =>
          /warning|pending|availability|precision/i.test(key) &&
          value != null &&
          value !== "",
      );
      const specs = Object.entries(b.specs).filter(
        ([key, value]) =>
          !/summaryCheckedAt|detailsCheckedAt/i.test(key) &&
          value != null &&
          value !== "",
      );
      return `<section class="boat"><h2>${index + 1}. ${escapePacketHtml(b.title)}</h2>${b.isSample ? "<p class=notice>Fictional sample data. This is not a live boat for sale.</p>" : ""}
      <p>Advertisement ID: ${escapePacketHtml(b.id)}. ${b.groupId ? "This result groups multiple advertisements; inspect each source for differing prices, location, and availability." : "This advertisement may also appear under other ads; absence of a group does not establish a distinct boat."}</p>
      <h3>Source advertisements</h3><ul>${links.map((l) => `<li>${link(l.source, l.url)}<span>Reported price: ${money(l.price)}</span></li>`).join("")}</ul>
      ${warnings.length ? `<h3>Source and parser cautions</h3><ul>${warnings.map(([key, value]) => `<li>${escapePacketHtml(key)}: ${text(value)}</li>`).join("")}</ul>` : ""}
      ${specs.length ? `<details open><summary>Additional reported specifications</summary><dl class="specs">${specs.map(([key, value]) => `<dt>${escapePacketHtml(key)}</dt><dd>${text(value)}</dd>`).join("")}</dl></details>` : "<p>Additional specifications: unknown.</p>"}
      <h3>Seller call and inspection worksheet</h3><p>These fields are intentionally blank. Check them after verification; exported specifications are seller claims, not inspection results.</p>
      <ol class="checklist">${CHECKLIST.map((item) => `<li><span class="box" aria-hidden="true">☐</span> ${escapePacketHtml(item)}<div class="write-line"></div></li>`).join("")}</ol>
    </section>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>BoatScout comparison and inspection packet</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#172c35;background:#fff;max-width:1250px;margin:auto;padding:30px}h1,h2,h3{line-height:1.2}h1{font-size:30px}h2{margin-top:30px}a{color:#086375}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cedadf;padding:9px;text-align:left;vertical-align:top;min-width:145px;overflow-wrap:anywhere}th{background:#f0f5f6}.table-wrap{overflow-x:auto}.notice{border-left:4px solid #967126;background:#fff9ea;padding:12px}.url{display:block;font-size:12px;overflow-wrap:anywhere;color:#49636e}li{margin:10px 0}li>span{display:block}.specs{display:grid;grid-template-columns:minmax(100px,1fr) 3fr;gap:6px 18px}.specs dt{font-weight:600}.specs dd{margin:0;overflow-wrap:anywhere}.checklist{list-style:none;padding:0}.box{display:inline}.write-line{height:24px;border-bottom:1px solid #b5c2c8}.boat{border-top:2px solid #3b6470;margin-top:28px}.fine{font-size:13px;color:#49636e}@media(max-width:600px){body{padding:16px}.specs{grid-template-columns:1fr}.specs dd{margin-bottom:10px}}@media print{@page{size:landscape;margin:12mm}body{font-size:11px;padding:0;max-width:none}.table-wrap{overflow:visible}table{table-layout:fixed;font-size:9px}th,td{min-width:0;padding:5px}thead{display:table-header-group}tr,.checklist li{break-inside:avoid}.boat{break-before:page}.url{font-size:9px}details{display:block}.write-line{height:22px}a{color:#000;text-decoration:underline}}</style></head>
<body><header><h1>BoatScout comparison and inspection packet</h1><p>${boats.length} selected ${boats.length === 1 ? "result" : "results"} · Packet generated ${date(generatedAt)}</p><p class="fine">Use your browser's Print command to print or save as PDF. No saved workspace notes are included. No remote images or scripts are embedded.</p></header>
<aside class="notice"><strong>Preliminary research, subject to verification.</strong> Asking prices and availability may have changed. Packet generation is not a new source observation. Unknown values remain unknown. Distances${reference} are straight-line estimates, not road miles or driving hours; routes around Lake Michigan can be substantially longer. A listed length does not verify the actual molded hull/platform measurement, engine capacity rating, mechanical condition, or lake registration approval.</aside>
<p>Lake Holiday reference: the publicly available association-authored 2024 rules require non-pontoon boats to be strictly under 21 ft, count molded platforms, limit motor power to the capacity rating, and prohibit wakesurfing and use of wake-enhancing devices. Verify the current rules and applicable boat category with the association before purchase. ${link("Public 2024 Lake Holiday rulebook", LAKE_RULES_URL)}</p>
${overview}${details}<footer class="fine"><p>Prepared from the selected BoatScout records. Preserve the original advertisements and confirm all material details with the seller and appropriate inspectors.</p></footer></body></html>`;
}

export function downloadComparisonPacket(boats: BoatResult[]) {
  const html = createComparisonPacket(boats);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `boatscout-comparison-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
