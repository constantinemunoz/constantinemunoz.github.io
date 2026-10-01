# constantinemunoz.github.io — BOMBANANA

BOMBANANA is an unofficial three-player browser bomb-defusal drill. One player is the
**Blind Operator** (touches every control, sees no colours), one is the **Deaf Observer**
(sees the live bomb and the Blind cursor, gets no manual) and one is the **Mute Specialist**
(reads the full manual, can only send numbers and hand signs). Clear ten campaign levels,
then keep going in infinite mode.

Live site: <https://constantinemunoz.github.io/>

## What runs where

| Where | What works |
| --- | --- |
| GitHub Pages (this site) | The full client in **solo developer mode**: every level, every module, the tutorial and the field guide. |
| Local dev server / Cloudflare | Everything above **plus three-player rooms** (`/api/room`, Cloudflare D1 database). |

GitHub Pages only serves files, so the multiplayer room API and its database cannot run
there. The static build detects the missing server and shows a notice on the start screen
instead of failing. To play with three people, run the project locally (below) or host the
Cloudflare build.

## Run the full game locally

Requires Node.js 22.13 or newer. The setup scripts enable pnpm, install the locked
dependencies, build, create the local D1 database, apply the migrations and start the dev
server on <http://localhost:5173>.

```bash
./SETUP_AND_RUN_MAC_LINUX.command            # macOS / Linux
powershell -ExecutionPolicy Bypass -File .\SETUP_AND_RUN_WINDOWS.ps1   # Windows
```

See [START_HERE.md](START_HERE.md) for the long version, including how to reset the local
database.

## Commands

```bash
pnpm install --frozen-lockfile   # install the exact locked dependencies
pnpm run dev                     # vinext dev server with the room API (port 5173)
pnpm run build                   # Cloudflare / vinext production build (dist/)
pnpm run build:static            # GitHub Pages build without the API (out/)
pnpm run test:game               # 22,000 randomized module and tutorial rounds
pnpm run lint                    # ESLint
pnpm run typecheck               # tsc --noEmit
```

`build:static` temporarily moves `app/api` out of the way, runs `next build` with
`output: "export"`, restores the folder and writes `out/.nojekyll` so GitHub Pages serves
the `_next/` assets.

## Deployment

`.github/workflows/deploy-pages.yml` runs on every push to `main`: it installs
dependencies, runs the game tests, builds the static site and publishes it with
`actions/deploy-pages`.

**One setting has to be changed by hand.** GitHub creates `<user>.github.io` repositories
with the Pages source set to "Deploy from a branch", which runs GitHub's own Jekyll build
on every push and competes with this workflow (the Jekyll build has no `index.html`, so
when it wins the site shows a 404). Open **Settings → Pages**, and under **Build and
deployment** set **Source** to **GitHub Actions**. The workflow cannot do this itself: the
Actions token is not allowed to change Pages settings. After that, every push to `main`
deploys through the workflow only.

## Project layout

- `app/game-client.tsx` — start screen, lobby, ready room, the three role views, tutorial, developer mode
- `app/globals.css` — the complete visual design
- `app/api/room/route.ts` — multiplayer rooms, roles, chat, ready-up and level flow (server build only)
- `lib/game.ts` — module rules, levels, timers, tutorial logic and per-role visibility
- `db/`, `drizzle/` — D1 schema and migrations
- `scripts/test-game-logic.mjs` — randomized module and tutorial tests
- `scripts/build-static.mjs` — GitHub Pages build
- `docs/CODE_REVIEW.md` — findings from the code review done when the site was set up
- `docs/vinext-starter.md` — the original vinext starter notes (Cloudflare hosting, D1, ChatGPT sign-in helpers)

BOMBANANA is an unofficial browser tribute and is not affiliated with Lefto Studio or TARK.
