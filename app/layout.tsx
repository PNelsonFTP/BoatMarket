import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "BoatScout — Find your next boat",
  description:
    "One workspace for your boat search. Explore listings, compare boats, and follow the market.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
