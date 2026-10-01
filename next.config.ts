import type { NextConfig } from "next";

// BOMBANANA is a fully static site: `next build` writes plain files to ./out,
// which GitHub Pages serves. Multiplayer rooms run through Firebase Realtime
// Database from the browser, so there is no server code.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
