# constantinemunoz.github.io — Snip No Evil

Snip No Evil (formerly BOMBANANA) is an unofficial three-player browser bomb-defusal game. One player is the
**Blind Operator** (touches every control, sees no colours), one is the **Deaf Observer**
(sees the live bomb and the Blind cursor, gets no manual) and one is the **Mute Specialist**
(reads the full manual, can only send numbers and hand signs). Clear fifteen campaign levels,
then keep going in infinite mode.

Levels 1 to 7 use the four easy modules (cables, color sliders, direction, calculator).
Levels 8 to 15 bring in the three medium modules: the symbol dial and the soundboard, where
only the Blind player sees the module beep, and the piano. Level 11 pairs the soundboard
with the dial, and Levels 12 to 15 mix medium and easy modules with four minutes each.
After Level 15, infinite mode picks four of the seven modules for every case. The case feed
only reports strikes, plus chat and the start and end of each round. The room creator can turn on
an untimed Level 0 practice round, or type a level to start the campaign there.

Nobody picks a role on the home screen. Type a name (and the room code to join) and
press Play: the room hands out the first open seat, and players tap a seat in the lobby
or ready room to move or swap.

Live site: <https://constantinemunoz.github.io/>

## How it is hosted

Everything is free:

| Piece | Service | Plan |
| --- | --- | --- |
| The website | GitHub Pages | Free |
| Multiplayer rooms | Firebase Realtime Database + anonymous sign-in | Spark (free, no card) |

The site is plain files. There is no server of our own. When someone creates a room,
**their browser becomes the room host**: it runs the referee (`lib/room-engine.ts`),
applies everyone's moves and sends each player only what their role is allowed to see.
Firebase carries the messages in real time. If the host closes their tab, another player
takes over automatically after a few seconds.

The free Spark plan allows 100 open browser tabs at once (about 33 games) and 10 GB of
downloads a month. If a limit is ever reached, Firebase pauses until the next month; it
never charges you.

One trade-off: the host's browser holds the full bomb, so a host who opens the browser's
developer tools could peek. The other two players' secrets are protected by the database
rules.

## One-time Firebase setup

Already done for `bombanana-ee9ee` except for the rules:

1. In the [Firebase console](https://console.firebase.google.com/), open the project,
   then **Realtime Database**, then the **Rules** tab.
2. Replace everything in the editor with the contents of
   [`database.rules.json`](database.rules.json) and click **Publish**.

Until the rules are published the database stays locked and Create/Join show
"Firebase refused the request". Publish again whenever `database.rules.json` changes.

If you ever recreate the project: create a Realtime Database (locked mode), enable
**Authentication → Sign-in method → Anonymous**, add `constantinemunoz.github.io` under
**Authentication → Settings → Authorized domains**, register a web app, and paste its
config into `lib/firebase-config.ts`. The web config is public by design.

## Deployment

`.github/workflows/deploy-pages.yml` runs on every push to `main`: it installs
dependencies, runs the tests, builds the static site and publishes it to GitHub Pages.

**One GitHub setting has to be changed by hand.** GitHub creates `<user>.github.io`
repositories with the Pages source set to "Deploy from a branch", which runs GitHub's own
Jekyll build on every push and competes with this workflow. Open **Settings → Pages**, and
under **Build and deployment** set **Source** to **GitHub Actions**.

## Run it on your computer

Requires Node.js 22.13 or newer. The setup scripts enable pnpm, install the locked
dependencies and start the dev server at <http://localhost:3000>. Local play uses the same
Firebase database as the live site.

```bash
./SETUP_AND_RUN_MAC_LINUX.command                                       # macOS / Linux
powershell -ExecutionPolicy Bypass -File .\SETUP_AND_RUN_WINDOWS.ps1    # Windows
```

Each browser tab is a separate player, so you can test a room alone with three tabs.

## Commands

```bash
pnpm install --frozen-lockfile   # install the exact locked dependencies
pnpm run dev                     # dev server on http://localhost:3000
pnpm run build                   # static site in ./out (what GitHub Pages serves)
pnpm run test                    # game rules (34,000 random rounds) + room referee tests
pnpm run lint                    # ESLint
pnpm run typecheck               # tsc --noEmit
```

To develop against local Firebase emulators instead of the real project, start the
database and auth emulators (`npx firebase-tools emulators:start --only database,auth`,
which needs Java) and run the app with `NEXT_PUBLIC_FIREBASE_EMULATOR=1`.

## Project layout

- `app/game-client.tsx` — start screen, lobby, ready room, the three role views, Level 0 coaching, developer mode
- `app/globals.css` — the complete visual design
- `app/fonts/goofus-hand.woff2` — GoofusHand, the only font in the game, built from
  `fonts-src/GoofusHand.ttf` by `scripts/build-font.py` (adds the symbols the game shows,
  fixed-width timer digits and consistent line metrics; run it again after changing the
  source font: `pip install fonttools brotli && python3 scripts/build-font.py`)
- `lib/game.ts` — module rules, levels (including the Level 0 practice round), timers and per-role visibility
- `lib/room-engine.ts` — the room referee that runs in the host's browser
- `lib/room-client.ts` — Firebase connection: create, join, rejoin, leave, host takeover
- `lib/firebase-config.ts` — the public Firebase web config
- `database.rules.json` — who may read and write what in the database
- `scripts/test-game-logic.mjs`, `scripts/test-room-engine.mjs` — tests
- `docs/CODE_REVIEW.md` — the code review done when the site was set up, with status

Snip No Evil is an unofficial browser tribute and is not affiliated with Lefto Studio or TARK.
