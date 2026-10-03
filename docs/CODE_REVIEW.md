# Snip No Evil code review

The game was called BOMBANANA when this review was written.

Review of the source that was imported into this repository on 2026-10-01. Everything in
`lib/`, `app/`, `db/`, `drizzle/`, `scripts/` and the build configuration was read in full.

## Status after the move to Firebase

The Cloudflare server route (`app/api/room/route.ts`) and its D1 database were replaced by
a room referee that runs in the host's browser (`lib/room-engine.ts`) and Firebase Realtime
Database (`lib/room-client.ts`, `database.rules.json`). The findings below are the original
review of the imported code; this table records where each one stands now.

| Finding | Status |
| --- | --- |
| H1 cannot rejoin a started room | Fixed. An offline seat can be reclaimed with the room code, in the lobby or mid-game. |
| H2 session dropped on any error | Fixed. The saved room is only forgotten when the seat is really gone. |
| H3 stale host seat orphans the room | Fixed. A leaving host hands the room on; a vanished host is replaced after a few seconds. |
| M1 timer garbage on first frame | Fixed. Timers also use Firebase's shared server clock. |
| M2 stale poll overwrites fresher data | Gone. Polling was replaced by ordered live updates. |
| M3 unguarded `crypto.randomUUID` | Fixed with a fallback in `lib/game.ts`. |
| M4 start/rematch not guarded | Fixed. Start only works from the lobby; the unused rematch action was removed. |
| M5 rooms never deleted | Fixed. Rooms idle for 24 hours are deleted when someone creates a room. |
| M6 concurrent joins return 500 | Gone. The host applies requests one at a time. |
| M7 invalid JSON is a 500 | Gone. Malformed requests get a clear rejection. |
| M8 polling load | Gone. Updates are pushed; nothing polls. |
| M9 no way to leave a room | Fixed. Leave buttons in the lobby and the game header. |
| L2 clipboard error unhandled | Fixed. |
| L7, L9, L11 | Gone with the server code, the D1 example and `.openai/hosting.json`. |
| L1, L3, L4, L5, L6, L8, L10, L12 | Still open. They are minor and unchanged. |

New trade-off: the host's browser holds the full game state, so a host who opens the
browser's developer tools could see the answers. The database rules keep the other two
players' views private, and only a seated player can take over as host.

Verification of the new setup, all against local Firebase emulators running the real rules:

| Check | Result |
| --- | --- |
| `pnpm run test` (22,000 game rounds + 119 room referee checks) | pass |
| Security rules: 37 allowed and forbidden reads and writes across four users | pass |
| Three browsers: create, join, ready, timer, solve Level 1, cursor and sign relay, reload, rejoin a closed seat, host closes tab and another player takes over, play Level 2, leave | pass, no console errors |
| Three browsers: Level 0 practice round with relay strip, highlights and stall nudges, then Level 1; text chat privacy for DEAF, MUTE cannot type | pass, no console errors |

## What was verified

| Check | Result |
| --- | --- |
| `pnpm run test:game` (22,000 randomized rounds, all modules, all levels, tutorial) | pass |
| `pnpm run lint` | clean |
| `pnpm run typecheck` (`tsc --noEmit`) | clean |
| `pnpm run build` (vinext / Cloudflare build) | builds |
| `pnpm run build:static` + Playwright smoke test of the exported site | start screen, static notice, graceful multiplayer error, developer mode (Level 1 solved), tutorial preview all work; no JavaScript errors |

Manual consistency also checks out: every rule table the Mute Specialist sees
(`CableManual`, `DirectionManual`, `SliderManual`, `CalculatorManual`, `PianoManual`) is
rendered from the same constants the server uses to generate answers, and
`publicStateForRole` never sends a solution field (`targetColor`, `target`, `targetDigit`,
`braille` for the Observer, colours for the Operator) to a role that should not have it.

## Changed while setting up the GitHub Pages site

These are the only code changes made. Everything under "Findings" below is reported, not
changed.

1. **Static build support.** `next.config.ts` switches to `output: "export"` when
   `STATIC_EXPORT=1`; `scripts/build-static.mjs` parks `app/api` during the build and
   restores it; `public/.nojekyll` stops GitHub Pages from dropping `_next/`;
   `.github/workflows/deploy-pages.yml` deploys on push to `main`.
2. **Graceful failure without a room server** (`app/game-client.tsx`). `requestRoom` used
   to call `response.json()` on whatever came back, so on a static host the user saw
   `Unexpected token '<'`. It now checks the content type and throws a readable message.
   The start screen probes `/api/room` once and shows a "no room server" notice.
3. **Developer-mode level switcher collapsed** (`app/globals.css`). The strip used
   `overflow-x: auto` inside a grid column sized `auto`, so at a 1400px-wide window only
   levels 1 to 6 were reachable and at 1100px the strip was 0px wide. It now wraps.
4. Housekeeping: README rewritten for this repository (the original vinext starter notes
   moved to `docs/vinext-starter.md`), `package.json` name set to `bombanana`,
   `typecheck` and `build:static` scripts added, `tsconfig.tsbuildinfo` (a 585 KB build
   cache that was inside the zip) left out and ignored.

## Findings

Severity reflects impact on a real three-player session. File references point at the
code as imported.

### High

**H1. A player who closes their tab can never rejoin a started room.**
`app/api/room/route.ts`, `join`: `if (room.status !== "lobby") return error("That round has already started.", 409)`.
The seat is remembered in `sessionStorage`, which is per tab, so closing the tab (or a
phone browser discarding it) loses the seat and the stale-seat takeover only exists in
the lobby. The other two players are then stuck.
*Fix:* allow `join` while `status === "playing"` when the requested role's seat is empty
or its `last_seen` is older than 45 s, and reuse the room's game state as-is.

**H2. Session restore drops the seat on any error, not just a missing seat.**
`app/game-client.tsx`, `GameClient` mount effect: the `.catch` after the restore fetch
removes `bombanana-session` for network errors and 5xx responses as well as 404.
Together with H1, one reload during a brief outage permanently ejects the player.
*Fix:* clear the session only when the response is a 404; otherwise keep it and let the
poll retry.

**H3. Taking over a stale host seat orphans the room.**
`route.ts`, `join`: when the host's row is deleted as stale and the seat re-taken,
`rooms.host_player_id` still points at the deleted player, so nobody can press Start.
*Fix:* when the deleted stale player was the host, set `host_player_id` to the new
player's id in the same batch.

### Medium

**M1. Timer shows a garbage value for the first frames.**
`game-client.tsx`, `Game`: `const [now, setNow] = useState(0)` makes `remaining` equal to
`startAt + durationMs` and `prestart` a ten-digit number until the 200 ms interval fires,
so the header briefly prints `0:0<huge number>`. `Game` only mounts on the client, so
`useState(() => Date.now())` is safe.

**M2. Stale poll responses can briefly overwrite a fresher action response.**
`GameClient` polls on an interval and every response calls `setData`; a poll that started
before an action can resolve after it and roll the UI back for one interval. The server
already sends `room.version` but the client never compares it.
*Fix:* ignore a snapshot whose `room.version` is lower than the one currently shown.

**M3. Unguarded `crypto.randomUUID()` in shared game logic.**
`lib/game.ts`, `createTutorialGameState` and `tutorialEntry`. The browser only exposes
`randomUUID` in secure contexts, so opening the dev server from another device over plain
HTTP (`http://192.168.x.x:5173`) and pressing Tutorial in developer mode throws.
`game-client.tsx` guards the same call in two places; the library should too.

**M4. `start` / `rematch` have no status guard.**
`route.ts`: the only checks are host identity and three filled roles, so a crafted
request from the host resets a running campaign to Level 1. `rematch` is never sent by
the client. *Fix:* require `status === "lobby"` for `start`, and either remove `rematch`
or require `phase === "waiting"`.

**M5. Rooms and players are never deleted.**
There is no TTL, cleanup or rate limit on `create`, so the D1 database grows without
bound and anyone can fill it. *Fix:* on `create`, delete rooms whose `updated_at` is older
than about 24 h (the `ON DELETE cascade` already removes their players).

**M6. Concurrent joins for the same role return a 500.**
`route.ts`, `join`: two players claiming the same role at once pass the `taken` check and
the second `INSERT` violates `idx_players_room_role`, which surfaces as "The room service
hit a snag" instead of "<role> is already taken". *Fix:* catch the constraint error and
return the 409.

**M7. Invalid JSON body is a 500.**
`route.ts`, `POST`: `await request.json()` is outside any validation, so a malformed body
produces a 500 instead of a 400.

**M8. Polling load.**
The Observer polls every 180 ms and every poll runs three to four D1 queries plus a
possible settle write; that is roughly fifteen requests per second per room. Fine for a
handful of rooms, but it is the first thing that will hit Cloudflare D1 limits.
Consider 400 to 500 ms, or returning early when `version` and player rows are unchanged.

**M9. There is no way to leave a room.**
The header logo is a `next/link` to `/`, which is a no-op client-side navigation on the
same page. Players can only leave by closing the tab, which (see H1) also loses the seat.
*Fix:* a Leave button that clears `bombanana-session` and reloads.

### Low

**L1.** `lib/game.ts`, `cut-cable`: the index is not bounds-checked, so an out-of-range
value counts as a wrong cut and a strike. Validate `0 <= index < count`.

**L2.** `game-client.tsx`, `Lobby.copyCode`: `navigator.clipboard.writeText` is awaited
without `try/catch`; on an http origin or denied permission the rejection is unhandled.

**L3.** `RoundWaitingRoom` labels a brand-new campaign "NEXT ATTEMPT" because
`lastResult === "new"` is grouped with the retry results.

**L4.** The room-code input accepts `0 1 I L O`, which the generator never uses, with no
hint; a mistyped `O` for `0` just says "Room not found".

**L5.** `DIRECTION_RULES` rows 3 and 5 map both YELLOW and BLUE to UP while every other
row is a permutation. Probably intentional, but worth confirming since it makes those rows
easier.

**L6.** `createSliderModule` falls back to the last attempt if no draw matches the chosen
pattern within 1,000 tries, which could in principle produce one of the four excluded
patterns. The 22,000-round test never hit it, so this is theoretical.

**L7.** `roomState()` in `route.ts` builds a complete throw-away `createGameState()` on
every request (it can loop up to 1,000 times in the slider generator) just to have a
fallback piano module. Export `createPianoModule` and use `state.modules.piano ??=`.

**L8.** `PublicGameView.modules` claims all five modules for the Specialist view, but the
server sends only the enabled ones. Harmless today (the Specialist never renders modules)
and hidden by the `as unknown as PublicGameView` cast in `DeveloperMode`.

**L9.** `examples/d1/` references a `notes` table that no migration creates. It is
excluded from `tsconfig.json`; dead code.

**L10.** 50+ vendored shadcn components under `components/ui/`; the game imports ten.
Tree-shaken at build time, but it is dead weight in the repository.

**L11.** `.openai/hosting.json` still carries the `project_id` of the original hosted
site. `START_HERE.md` says not to reuse it for a separate deployment.

**L12.** `press-direction` replaces the whole direction module (new light and new Braille
number) after a wrong press. It is a deliberate penalty, but neither the manual nor the
field guide mentions it, so players tend to re-send the old answer.

### Test coverage

`scripts/test-game-logic.mjs` covers the pure rules thoroughly. Nothing exercises
`app/api/room/route.ts` (create, join, ready, switch-role, settle) or the client. H1, H3,
M4, M6 and M7 would all be caught by a small route test run against Miniflare's local D1.
