import type { NextConfig } from "next";

// `scripts/build-static.mjs` sets STATIC_EXPORT=1 to produce the plain-file
// build that GitHub Pages serves. The default (vinext / Cloudflare) build is
// unchanged when the variable is absent.
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
