import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Phase 6: @urso/types is a workspace package shipped as TypeScript source
  // (consumed by both this app and the Expo app), so Next has to transpile it.
  transpilePackages: ["@urso/types"],
  async redirects() {
    return [
      // Retired marketing routes fold into the new structure.
      { source: "/about", destination: "/how-it-works", permanent: true },
      { source: "/book-a-diagnostic", destination: "/contact", permanent: true },
    ];
  },
};

export default nextConfig;
