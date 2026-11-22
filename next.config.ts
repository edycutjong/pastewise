import type { NextConfig } from "next";

// Static export: Pastewise has no server, so no server can ever receive a paste.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
