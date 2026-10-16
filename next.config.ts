import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge defaults to bottom-left, where it covers the sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Pages merged into the new tabs. Query strings carry over, so /expenses?supplier=X
  // still lands on that supplier's payments.
  async redirects() {
    return [
      { source: "/sales", destination: "/transactions", permanent: false },
      { source: "/expenses", destination: "/transactions", permanent: false },
      { source: "/scheduling", destination: "/calendar", permanent: false },
      // The five-tab redesign: Products and the price calculator became Costing, and Stock
      // (with its production calendar) became Production and Calendar.
      { source: "/products", destination: "/costing", permanent: false },
      { source: "/pricing", destination: "/costing", permanent: false },
      { source: "/inventory", destination: "/production", permanent: false },
      // People (customers, suppliers, events, team) was removed; its old addresses land on the
      // nearest page that still holds that kind of thing.
      { source: "/people", destination: "/", permanent: false },
      { source: "/customers", destination: "/transactions", permanent: false },
      { source: "/suppliers", destination: "/transactions", permanent: false },
      { source: "/events", destination: "/calendar", permanent: false },
      // Ask AI now lives on Home.
      { source: "/chat", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
