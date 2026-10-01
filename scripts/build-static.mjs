// Builds the static GitHub Pages version of BOMBANANA.
//
// GitHub Pages only serves files, so the multiplayer room API (app/api) and
// its Cloudflare D1 database cannot run there. This script parks app/api
// outside the app directory, runs `next build` with `output: "export"`, and
// restores the folder afterwards. The exported site (./out) runs the full
// client, including solo developer mode; multiplayer rooms report that the
// server build is required.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiDirectory = path.join(root, "app", "api");
const parkingDirectory = path.join(root, ".static-build");
const parkedApiDirectory = path.join(parkingDirectory, "api");
const outputDirectory = path.join(root, "out");

if (existsSync(parkedApiDirectory)) {
  throw new Error(
    `${parkedApiDirectory} already exists. A previous static build was interrupted; move it back to app/api before building again.`,
  );
}

const hadApi = existsSync(apiDirectory);
if (hadApi) {
  mkdirSync(parkingDirectory, { recursive: true });
  renameSync(apiDirectory, parkedApiDirectory);
}

let status = 1;
try {
  rmSync(outputDirectory, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, STATIC_EXPORT: "1", NEXT_PUBLIC_STATIC_SITE: "1" },
    },
  );
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  if (hadApi) {
    renameSync(parkedApiDirectory, apiDirectory);
    rmSync(parkingDirectory, { recursive: true, force: true });
  }
}

if (status === 0) {
  // GitHub Pages runs Jekyll by default, which drops the _next/ folder.
  writeFileSync(path.join(outputDirectory, ".nojekyll"), "");
  console.log("Static site written to ./out");
}
process.exit(status);
