// Tests the room referee that runs in the host's browser (lib/room-engine.ts).
// Run with: pnpm run test:room
import { CABLE_RULES } from "../lib/game.ts";
import { RoomEngine } from "../lib/room-engine.ts";

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}
function ok(result, message) {
  assert(result.ok, `${message}: ${result.error ?? "rejected"}`);
  return result;
}
function rejected(result, pattern, message) {
  assert(!result.ok && pattern.test(result.error), `${message}: expected rejection matching ${pattern}, got ${JSON.stringify(result)}`);
}

let now = 1_000_000;
const HOST = "uid-host";
const DEAF = "uid-deaf";
const MUTE = "uid-mute";

function newRoom({ chatEnabled = false, tutorialEnabled = false } = {}) {
  const engine = RoomEngine.create({ code: "BAN42", hostId: HOST, name: "Ana", role: "operator", chatEnabled, tutorialEnabled, now });
  engine.setOnline([HOST, DEAF, MUTE]);
  ok(engine.handle(DEAF, { action: "join", name: "Ben", role: "observer" }, now), "DEAF joins");
  ok(engine.handle(MUTE, { action: "join", name: "Cat", role: "specialist" }, now), "MUTE joins");
  return engine;
}

function readyAll(engine) {
  for (const id of [HOST, DEAF, MUTE]) ok(engine.handle(id, { action: "ready" }, now), `${id} ready`);
}

function cutCorrectCable(engine, id = HOST) {
  const cable = engine.data.state.modules.cable;
  const index = cable.colors.indexOf(CABLE_RULES[cable.count][cable.light]);
  return engine.handle(id, { action: "module", moduleAction: "cut-cable", value: index }, now);
}

// --- Lobby, start, and the campaign loop -------------------------------------
{
  const engine = newRoom();
  rejected(engine.handle("uid-x", { action: "join", name: "Dan", role: "observer" }, now), /already taken/, "online seat cannot be taken");
  rejected(engine.handle(DEAF, { action: "start" }, now), /Only the host/, "only the host starts");
  ok(engine.handle(HOST, { action: "start" }, now), "host starts");
  assert(engine.data.status === "playing" && engine.data.state.phase === "waiting", "start opens the Level 1 ready room");
  rejected(engine.handle(HOST, { action: "start" }, now), /already started/, "a running campaign cannot be restarted");

  ok(engine.handle(HOST, { action: "ready" }, now), "host ready");
  assert(engine.snapshotFor(HOST).room.readyCount === 1, "ready count updates");
  ok(engine.handle(DEAF, { action: "ready" }, now), "deaf ready");
  ok(engine.handle(MUTE, { action: "ready" }, now), "mute ready");
  assert(engine.data.state.phase === "playing" && engine.data.state.level === 1, "all ready arms Level 1");
  assert(engine.data.state.startAt === now + 3_000, "countdown uses the shared clock");

  rejected(cutCorrectCable(engine), /countdown/, "controls are locked during the countdown");
  now += 3_000;
  rejected(cutCorrectCable(engine, DEAF), /Only the Blind Operator/, "only BLIND touches the bomb");
  ok(cutCorrectCable(engine), "correct cable");
  assert(engine.data.state.phase === "waiting" && engine.data.state.lastResult === "cleared", "Level 1 clears");
  readyAll(engine);
  assert(engine.data.state.level === 2 && engine.data.state.phase === "playing", "clearing advances to Level 2");
}

// --- Secrecy: each player only receives their own role's view ----------------
{
  const engine = newRoom();
  ok(engine.handle(HOST, { action: "start" }, now), "start");
  readyAll(engine);
  const blind = JSON.stringify(engine.snapshotFor(HOST));
  const deaf = engine.snapshotFor(DEAF);
  const mute = engine.snapshotFor(MUTE);
  const cable = engine.data.state.modules.cable;
  assert(!blind.includes('"colors"') && !blind.includes('"targetColor"'), "BLIND view has no cable colors or answer");
  assert(Array.isArray(deaf.room.game.modules.cable.colors) && !JSON.stringify(deaf).includes('"targetColor"'), "DEAF sees colors but not the answer");
  assert(!("braille" in deaf.room.game.modules.slider), "DEAF does not see Braille");
  assert(mute.room.game.manual && !JSON.stringify(mute.room.game.modules).includes(cable.light), "MUTE has the manual but not the bomb");
  assert(engine.snapshotFor("uid-stranger") === null, "non-players get no view");
}

// --- Timeouts, strikes, and role swaps ----------------------------------------
{
  const engine = newRoom();
  ok(engine.handle(HOST, { action: "start" }, now), "start");
  readyAll(engine);
  const level = engine.data.state;
  assert(!engine.tick(now + 3_000 + level.durationMs - 1), "no timeout before the clock runs out");
  assert(engine.tick(now + 3_000 + level.durationMs), "timeout settles on the host tick");
  assert(engine.data.state.phase === "waiting" && engine.data.state.lastResult === "timeout", "timeout returns to the ready room");

  ok(engine.handle(MUTE, { action: "switch-role", targetRole: "operator" }, now), "swap roles");
  assert(engine.seat(MUTE).role === "operator" && engine.seat(HOST).role === "specialist", "swap exchanges both seats");
  assert(engine.roles().operator === MUTE, "roles map follows the swap");

  readyAll(engine);
  now += 3_000;
  const cable = engine.data.state.modules.cable;
  const wrong = cable.colors.findIndex((color) => color !== CABLE_RULES[cable.count][cable.light]);
  for (let strike = 0; strike < 3; strike += 1) ok(engine.handle(MUTE, { action: "module", moduleAction: "cut-cable", value: wrong }, now), "wrong cut");
  assert(engine.data.state.lastResult === "strikes" && engine.data.state.phase === "waiting", "three strikes ends the attempt");
}

// --- Rejoining and leaving -----------------------------------------------------
{
  const engine = newRoom({ chatEnabled: true });
  ok(engine.handle(HOST, { action: "start" }, now), "start");
  readyAll(engine);

  // MUTE closes their tab mid-game. Their seat can be reclaimed with the code.
  engine.setOnline([HOST, DEAF]);
  assert(engine.snapshotFor(HOST).room.players.find((player) => player.role === "specialist").online === false, "offline players show as offline");
  ok(engine.handle("uid-mute-2", { action: "join", name: "Cat", role: "specialist" }, now), "rejoin into an offline seat mid-game");
  assert(!engine.seat(MUTE) && engine.seat("uid-mute-2")?.role === "specialist", "the reclaimed seat moves to the new tab");
  assert(engine.snapshotFor(MUTE) === null, "the old tab loses its view");

  // DEAF leaves; the role is vacant and anyone with the code can fill it.
  ok(engine.handle(DEAF, { action: "leave" }, now), "DEAF leaves");
  ok(engine.handle("uid-deaf-2", { action: "join", name: "Dee", role: "observer" }, now), "a new player fills the vacant role");

  ok(engine.handle(HOST, { action: "message", text: "  three cables  " }, now), "BLIND sends chat");
  rejected(engine.handle("uid-mute-2", { action: "message", text: "hi" }, now), /hand signals/, "MUTE cannot type");
  assert(engine.snapshotFor("uid-mute-2").room.game.messages.at(-1).text === "three cables", "chat is trimmed and delivered");

  // Chats and game notices share one order; wrong answers reach BLIND as red errors.
  now += 3_000;
  const cable = engine.data.state.modules.cable;
  const wrong = cable.colors.findIndex((color) => color !== CABLE_RULES[cable.count][cable.light]);
  ok(engine.handle(HOST, { action: "module", moduleAction: "cut-cable", value: wrong }, now), "wrong cut");
  ok(engine.handle(HOST, { action: "message", text: "oops" }, now), "chat after the mistake");
  const blindGame = engine.snapshotFor(HOST).room.game;
  const strike = blindGame.actionLog.at(-1);
  const chatSeqs = blindGame.messages.map((message) => message.seq);
  assert(strike.tone === "error" && chatSeqs[0] < strike.seq && strike.seq < chatSeqs[1], "feed order: chat, then the wrong answer, then the next chat");
  assert(!engine.snapshotFor("uid-deaf-2").room.game.actionLog.some((entry) => entry.tone === "error"), "wrong-answer notices stay with BLIND");
}

// --- Host handoff and takeover -------------------------------------------------
{
  const engine = newRoom();
  const left = ok(engine.handle(HOST, { action: "leave" }, now), "host leaves");
  assert(left.handoffTo === DEAF && engine.data.hostId === DEAF, "hosting passes to an online player");
  assert(engine.snapshotFor(DEAF).room.isHost, "the new host sees the host controls");

  ok(engine.handle(DEAF, { action: "leave" }, now), "second host leaves");
  const last = ok(engine.handle(MUTE, { action: "leave" }, now), "last player leaves");
  assert(last.closeRoom === true, "the room closes when nobody is left");
}
{
  // The host's browser disappears. Another player restores the saved state.
  const engine = newRoom();
  ok(engine.handle(HOST, { action: "start" }, now), "start");
  readyAll(engine);
  const saved = engine.serialize();
  const resumed = RoomEngine.restore(saved);
  resumed.data.hostId = DEAF;
  resumed.setOnline([DEAF, MUTE]);
  assert(JSON.stringify(resumed.data.state) === JSON.stringify(engine.data.state), "saved state round-trips exactly");
  // Rooms saved before this update stored the feed as plain strings.
  const legacy = JSON.parse(saved);
  legacy.state.actionLog = ["Level 1 armed.", "Wrong cable cut. Strike 1/3."];
  delete legacy.state.feedSeq;
  const upgraded = RoomEngine.restore(JSON.stringify(legacy)).data.state;
  assert(upgraded.actionLog[0].text === "Level 1 armed." && upgraded.actionLog[1].tone === "error" && typeof upgraded.feedSeq === "number", "old saved rooms are upgraded");
  assert(resumed.snapshotFor(DEAF).room.isHost && !resumed.snapshotFor(HOST).room.isHost, "takeover moves host rights");
  ok(resumed.handle("uid-blind-2", { action: "join", name: "Ana", role: "operator" }, now), "the old host's seat can be reclaimed");
  now += 3_000;
  ok(cutCorrectCable(resumed, "uid-blind-2"), "play continues after takeover");
  assert(resumed.data.state.lastResult === "cleared", "the level clears under the new host");
}

// --- Tutorial ---------------------------------------------------------------------
{
  const engine = newRoom({ tutorialEnabled: true });
  ok(engine.handle(HOST, { action: "start" }, now), "start tutorial");
  assert(engine.data.state.phase === "tutorial" && engine.data.state.startAt === now, "tutorial runs on the shared clock");
  const steps = [
    [HOST, "begin"], [HOST, "inspect-blind"], [DEAF, "observe-light"], [DEAF, "deaf-message"],
    [MUTE, "manual-rule"], [MUTE, "mute-signal", 1], [HOST, "practice-error", 1], [HOST, "solve-cable", 0],
  ];
  rejected(engine.handle(DEAF, { action: "tutorial-action", tutorialAction: "observe-light" }, now), /highlighted/, "tutorial steps must happen in order");
  for (const [id, tutorialAction, value] of steps) {
    const result = ok(engine.handle(id, { action: "tutorial-action", tutorialAction, value }, now), `tutorial ${tutorialAction}`);
    if (tutorialAction === "mute-signal") assert(result.signal?.symbol === "1", "the tutorial sign is broadcast");
  }
  assert(engine.data.state.tutorial.completedAt === now, "completion uses the shared clock");
  assert(!engine.tick(now + 3_999), "tutorial lingers for four seconds");
  assert(engine.tick(now + 4_000) && engine.data.state.phase === "playing" && engine.data.state.level === 1, "tutorial hands off to Level 1");
}

// --- Bad input never throws ---------------------------------------------------------
{
  const engine = newRoom();
  for (const request of [{}, { action: 42 }, { action: "module", moduleAction: "self-destruct" }, { action: "join" }, { action: "switch-role", targetRole: "pilot" }]) {
    const result = engine.handle(HOST, request, now);
    assert(result.ok === false && typeof result.error === "string", `bad request is rejected cleanly: ${JSON.stringify(request)}`);
  }
  rejected(engine.handle("uid-nobody", { action: "ready" }, now), /no longer exists/, "strangers cannot act");
}

console.log(`Passed ${checks} room engine checks: lobby, campaign loop, secrecy, timeouts, swaps, rejoin, leave, host handoff and takeover, tutorial, and bad input.`);
