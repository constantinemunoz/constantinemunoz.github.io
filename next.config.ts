import type { NextConfig } from "next";

// Snip No Evil is a fully static site: `next build` writes plain files to ./out,
// which GitHub Pages serves. Multiplayer rooms run through Firebase Realtime
// Database from the browser, so there is no server code.
// The front page is a games shelf; each game gets its own folder (for example
// /snip-no-evil/). trailingSlash makes the export write snip-no-evil/index.html.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
