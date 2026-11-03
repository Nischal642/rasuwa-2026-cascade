import type { NextConfig } from "next";

// Static export: `pnpm build` writes plain files to out/, servable from any static host.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true, // /method/ -> method/index.html, so any static host serves it
};

export default nextConfig;
