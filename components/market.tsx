"use client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";
import type { BoatResult } from "@/lib/types";
import { median, DAY } from "@/lib/search";
import { money } from "@/lib/utils";
export function Market({ boats }: { boats: BoatResult[] }) {
  const prices = boats
    .map((b) => b.price)
    .filter((p): p is number => p != null);
  const mids = median(prices);
  const max = Math.max(1, ...prices);
  const step = Math.max(5000, Math.ceil(max / 6 / 5000) * 5000);
  const distribution = Array.from({ length: 6 }, (_, i) => ({
    name: `$${(i * step) / 1000}–${((i + 1) * step) / 1000}k`,
    count: prices.filter(
      (p) =>
        p >= i * step && (i === 5 ? p <= (i + 1) * step : p < (i + 1) * step),
    ).length,
  }));
  const years = [
    ...new Set(boats.map((b) => b.year).filter((y): y is number => y != null)),
  ]
    .sort()
    .map((year) => ({
      name: String(year),
      price: median(
        boats
          .filter((b) => b.year === year)
          .map((b) => b.price)
          .filter((p): p is number => p != null),
      ),
    }));
  const makes = [...new Set(boats.map((b) => b.make).filter(Boolean))]
    .map((make) => ({
      name: make || "Unknown",
      price: median(
        boats
          .filter((b) => b.make === make && b.price != null && b.length)
          .map((b) => b.price! / b.length!),
      ),
    }))
    .filter((v) => v.price != null)
    .sort((a, b) => b.price! - a.price!)
    .slice(0, 10);
  const timeline = Array.from({ length: 12 }, (_, i) => {
    const start = Date.now() - (11 - i) * 7 * DAY;
    return {
      name: new Date(start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      count: boats.filter(
        (b) =>
          Date.parse(b.firstSeenAt) >= start - 7 * DAY &&
          Date.parse(b.firstSeenAt) < start,
      ).length,
    };
  });
  const avg = boats.length
    ? boats.reduce(
        (sum, b) =>
          sum + Math.max(0, (Date.now() - Date.parse(b.firstSeenAt)) / DAY),
        0,
      ) / boats.length
    : null;
  return (
    <>
      <div className="market-stats">
        {[
          ["Matching boats", boats.length],
          ["Median asking price", money(mids)],
          [
            "Average time tracked",
            avg == null ? "—" : `${Math.round(avg)} days`,
          ],
          ["With a known price", `${prices.length} / ${boats.length}`],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {boats.length === 0 ? (
        <div className="empty-state">
          <h2>No boats match these filters</h2>
          <p>Broaden your search to see the market.</p>
        </div>
      ) : (
        <div className="chart-grid">
          <Chart
            title="Asking price distribution"
            subtitle="How the current matches are priced"
          >
            <BarChart data={distribution}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted)" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                width={30}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="count"
                name="Boats"
                fill="var(--accent)"
                radius={[5, 5, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </Chart>
          <Chart
            title="Median price by model year"
            subtitle="Known prices only; small samples can vary"
          >
            <LineChart data={years}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted)" }}
              />
              <YAxis
                tickFormatter={(v) => `$${v / 1000}k`}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                width={55}
              />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={tooltipStyle}
              />
              <Line
                dataKey="price"
                name="Median"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </Chart>
          <Chart
            title="Listings first seen"
            subtitle="Weekly counts among the current matching boats"
          >
            <BarChart data={timeline}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted)" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                width={30}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="count"
                name="First seen"
                fill="#5b9ea6"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </Chart>
          <Chart
            title="Price per foot by make"
            subtitle="Median asking price divided by overall length"
          >
            <BarChart data={makes} layout="vertical">
              <CartesianGrid horizontal={false} stroke="var(--line)" />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
              />
              <XAxis
                type="number"
                tickFormatter={(v) => `$${v / 1000}k`}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
              />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={tooltipStyle}
              />
              <Bar
                dataKey="price"
                name="Price / ft"
                fill="var(--accent)"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </Chart>
        </div>
      )}
      <p className="market-note">
        Based on the current filters and observed listings, with duplicates
        grouped. These are asking prices, not completed sale values. Time
        tracked starts when BoatScout first sees a listing.
      </p>
    </>
  );
}
const tooltipStyle = {
  background: "var(--surface)",
  borderColor: "var(--line)",
  borderRadius: 8,
};
function Chart({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactElement;
}) {
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <p>{subtitle}</p>
      <div className="market-chart">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
