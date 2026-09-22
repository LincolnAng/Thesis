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
      { source: "/scheduling", destination: "/inventory", permanent: false },
      { source: "/customers", destination: "/people", permanent: false },
      { source: "/suppliers", destination: "/people?tab=suppliers", permanent: false },
      // Ask AI now lives on Home, and Events is a tab under People.
      { source: "/chat", destination: "/", permanent: false },
      { source: "/events", destination: "/people?tab=events", permanent: false },
    ];
  },
};

export default nextConfig;
