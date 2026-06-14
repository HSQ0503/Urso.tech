import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Retired marketing routes fold into the new structure.
      { source: "/about", destination: "/what-we-do", permanent: true },
      { source: "/book-a-diagnostic", destination: "/contact", permanent: true },
    ];
  },
};

export default nextConfig;
