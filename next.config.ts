import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [
      // Retired marketing routes fold into the new structure.
      { source: "/about", destination: "/how-it-works", permanent: true },
      { source: "/book-a-diagnostic", destination: "/contact", permanent: true },
    ];
  },
};

export default nextConfig;
