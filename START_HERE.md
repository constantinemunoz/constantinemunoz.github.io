# BOMBANANA — complete source code

This folder contains the full website source, every game module, the multiplayer room API, database schema and migrations, UI components, tests, assets, and the exact dependency lockfile.

Generated folders are intentionally not included:

- `node_modules/` — downloaded automatically for your computer
- `dist/` and `.next/` — rebuilt automatically from the source
- `.wrangler/` — your local database, created automatically
- `.git/` — version history, not needed to run the game

No API key or paid service is required for local play.

## Fastest setup on macOS or Linux

1. Install **Node.js 22.13 or newer** from <https://nodejs.org/>.
2. Open this folder.
3. On macOS, double-click `SETUP_AND_RUN_MAC_LINUX.command`.
4. If macOS refuses to open it, right-click it, choose **Open**, then confirm.
5. When the terminal prints a local URL, open that URL in your browser.

The same file can be run from a terminal:

```bash
./SETUP_AND_RUN_MAC_LINUX.command
```

## Fastest setup on Windows

1. Install **Node.js 22.13 or newer** from <https://nodejs.org/>.
2. Open PowerShell inside this folder.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\SETUP_AND_RUN_WINDOWS.ps1
```

4. Open the local URL printed in the terminal.

## What the setup scripts do

They automatically:

1. enable the correct `pnpm` version;
2. download the packages listed in `pnpm-lock.yaml`;
3. build the website;
4. create the local multiplayer database;
5. apply all four database migrations in order; and
6. launch BOMBANANA in development mode.

The first launch takes longer because dependencies must be downloaded. Later launches reuse them and skip database initialization.

## Useful commands

After the first setup, these commands are available:

```bash
pnpm run dev       # run the editable development version
pnpm run test:game # test every module and campaign level
pnpm run lint      # check the source code
pnpm run build     # create a production build
pnpm run start     # run the production build locally
```

## Reset the local game database

Delete the `.wrangler` folder and the `.bombanana-local-ready` file, then run the setup script again.

This deletes only rooms created on your computer. It does not affect the published BOMBANANA website.

## Important folders

- `app/game-client.tsx` — the main interface and interactive game views
- `app/globals.css` — the complete visual design
- `app/api/room/route.ts` — multiplayer rooms, roles, chat, ready-up, and level flow
- `lib/game.ts` — module rules, levels, timers, tutorial logic, and visibility rules
- `drizzle/` — database migrations
- `scripts/test-game-logic.mjs` — randomized module and tutorial tests
- `public/` — browser assets and favicon

## Publishing your own copy

The included `.openai/hosting.json` identifies the existing BOMBANANA Site. If you create a completely separate hosted copy, register a new Site and let the hosting workflow replace the `project_id`. Do not reuse the existing project ID for an unrelated Site.

