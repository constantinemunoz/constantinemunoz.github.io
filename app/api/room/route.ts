import { env } from "cloudflare:workers";
import {
  activeModules,
  applyModuleAction,
  applyTutorialAction,
  completedModules,
  createGameState,
  createTutorialGameState,
  levelDefinition,
  nextLevelAfterClear,
  publicStateForRole,
  resolveLevelModules,
  ROLES,
  type GameState,
  type ModuleAction,
  type Role,
  type TutorialAction,
} from "@/lib/game";

export const dynamic = "force-dynamic";

type RoomRow = {
  code: string;
  status: "lobby" | "playing" | "defused" | "exploded";
  state: string;
  version: number;
  host_player_id: string;
  created_at: number;
  updated_at: number;
};

type PlayerRow = {
  id: string;
  room_code: string;
  name: string;
  role: Role;
  joined_at: number;
  last_seen: number;
  cursor_x: number;
  cursor_y: number;
  cursor_active: number;
  cursor_updated_at: number;
  chat_symbol: string;
  chat_updated_at: number;
  ready_level: number;
};

const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CHAT_SYMBOLS = new Set([
  ...Array.from({ length: 11 }, (_, index) => String(index)),
  "👍",
  "👎",
  "🔁",
  "🖕",
  "👆",
  "👇",
  "👈",
  "👉",
]);

function database() {
  if (!env.DB) throw new Error("Room service is unavailable.");
  return env.DB;
}

function cleanCode(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function cleanName(value: unknown) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 20);
}

function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

function roomCode() {
  return Array.from({ length: 5 }, () =>
    ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)],
  ).join("");
}

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function getRoom(code: string) {
  return database()
    .prepare("SELECT * FROM rooms WHERE code = ?")
    .bind(code)
    .first<RoomRow>();
}

async function getPlayer(code: string, playerId: string) {
  return database()
    .prepare("SELECT * FROM players WHERE room_code = ? AND id = ?")
    .bind(code, playerId)
    .first<PlayerRow>();
}

async function getPlayers(code: string) {
  const result = await database()
    .prepare(
      "SELECT id, room_code, name, role, joined_at, last_seen, cursor_x, cursor_y, cursor_active, cursor_updated_at, chat_symbol, chat_updated_at, ready_level FROM players WHERE room_code = ? ORDER BY joined_at ASC",
    )
    .bind(code)
    .all<PlayerRow>();
  return result.results;
}

function roomState(room: RoomRow) {
  const parsed = JSON.parse(room.state) as Partial<GameState>;
  if (!parsed.level || !parsed.phase || !parsed.modules?.cable) return createGameState();
  const state = parsed as GameState;
  state.chatEnabled = Boolean(state.chatEnabled);
  state.tutorialEnabled = Boolean(state.tutorialEnabled);
  state.tutorial = state.tutorial ?? null;
  state.messages = Array.isArray(state.messages) ? state.messages : [];
  const fallback = createGameState(state.level, state.phase, state.lastResult, state.chatEnabled, [], state.tutorialEnabled);
  state.modules.piano = state.modules.piano ?? fallback.modules.piano;
  state.activeModuleKeys = Array.isArray(state.activeModuleKeys)
    ? state.activeModuleKeys
    : resolveLevelModules(levelDefinition(state.level));
  return state;
}

async function snapshot(room: RoomRow, player: PlayerRow) {
  const state = roomState(room);
  const players = await getPlayers(room.code);
  const game = publicStateForRole(state, player.role, player.id);
  const operator = players.find((candidate) => candidate.role === "operator");
  const specialist = players.find((candidate) => candidate.role === "specialist");
  const roleGame =
    player.role === "observer" || state.phase === "tutorial"
      ? {
          ...game,
          operatorCursor: operator
            ? {
                x: operator.cursor_x / 10_000,
                y: operator.cursor_y / 10_000,
                active:
                  Boolean(operator.cursor_active) &&
                  Date.now() - operator.cursor_updated_at < 2_000,
              }
            : { x: 0.5, y: 0.5, active: false },
          muteSignal: specialist
            ? {
                symbol: specialist.chat_symbol,
                updatedAt: specialist.chat_updated_at,
                active:
                  Boolean(specialist.chat_symbol) &&
                  Date.now() - specialist.chat_updated_at < 6_000,
              }
            : { symbol: "", updatedAt: 0, active: false },
        }
      : game;
  return {
    room: {
      code: room.code,
      status: room.status,
      version: room.version,
      isHost: room.host_player_id === player.id,
      readyCount: players.filter((candidate) => candidate.ready_level === state.level).length,
      players: players.map(({ name, role, last_seen, ready_level }) => ({
        name,
        role,
        online: Date.now() - last_seen < 18_000,
        ready: state.phase === "waiting" && ready_level === state.level,
      })),
      game: roleGame,
    },
    player: { id: player.id, name: player.name, role: player.role },
  };
}

async function mutateRoom(
  room: RoomRow,
  state: GameState,
  status: RoomRow["status"] = room.status,
) {
  const result = await database()
    .prepare(
      "UPDATE rooms SET state = ?, status = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?",
    )
    .bind(JSON.stringify(state), status, Date.now(), room.code, room.version)
    .run();
  if (!result.success || Number(result.meta.changes) !== 1) {
    throw new Error("Room state changed. Try the action again.");
  }
}

async function resetReadyPlayers(code: string) {
  await database()
    .prepare("UPDATE players SET ready_level = -1 WHERE room_code = ?")
    .bind(code)
    .run();
}

async function settleExpiredLevel(room: RoomRow) {
  const state = roomState(room);
  if (
    room.status !== "playing" ||
    state.phase !== "playing" ||
    !state.startAt ||
    Date.now() < state.startAt + state.durationMs
  ) {
    return room;
  }

  state.phase = "waiting";
  state.lastResult = "timeout";
  state.startAt = null;
  state.messages = [];
  state.actionLog.push(`Level ${state.level} timed out. Ready up to retry it.`);
  try {
    await mutateRoom(room, state, "playing");
    await resetReadyPlayers(room.code);
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes("changed")) throw cause;
  }
  return (await getRoom(room.code)) ?? room;
}

async function settleTutorialCompletion(room: RoomRow) {
  const state = roomState(room);
  if (
    room.status !== "playing" ||
    state.phase !== "tutorial" ||
    !state.tutorial?.completedAt ||
    Date.now() < state.tutorial.completedAt + 4_000
  ) {
    return room;
  }

  const nextState = createGameState(1, "playing", "new", state.chatEnabled, [], state.tutorialEnabled);
  nextState.startAt = Date.now() + 3_000;
  nextState.actionLog = ["Tutorial complete. Level 1 armed with normal role restrictions."];
  try {
    await mutateRoom(room, nextState, "playing");
    await resetReadyPlayers(room.code);
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes("changed")) throw cause;
  }
  return (await getRoom(room.code)) ?? room;
}

async function settleRoom(room: RoomRow) {
  return settleExpiredLevel(await settleTutorialCompletion(room));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = cleanCode(url.searchParams.get("code"));
    const playerId = String(url.searchParams.get("playerId") ?? "").slice(0, 80);
    if (code.length !== 5 || !playerId) return error("Room code and player are required.");

    const [foundRoom, player] = await Promise.all([
      getRoom(code),
      getPlayer(code, playerId),
    ]);
    if (!foundRoom || !player) return error("That seat no longer exists.", 404);
    const room = await settleRoom(foundRoom);
    return Response.json(await snapshot(room, player));
  } catch (cause) {
    console.error("room GET failed", cause);
    return error("The room could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "create") {
      const name = cleanName(body.name);
      const role = body.role;
      const playerId = String(body.playerId ?? "").slice(0, 80);
      if (!name || !playerId || !isRole(role)) return error("Name and role are required.");

      const now = Date.now();
      const state = createGameState(1, "waiting", "new", Boolean(body.chatEnabled), [], Boolean(body.tutorialEnabled));
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = roomCode();
        try {
          await database().batch([
            database()
              .prepare(
                "INSERT INTO rooms (code, status, state, version, host_player_id, created_at, updated_at) VALUES (?, 'lobby', ?, 1, ?, ?, ?)",
              )
              .bind(code, JSON.stringify(state), playerId, now, now),
            database()
              .prepare(
                "INSERT INTO players (id, room_code, name, role, joined_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .bind(playerId, code, name, role, now, now),
          ]);
          const room = (await getRoom(code))!;
          const player = (await getPlayer(code, playerId))!;
          return Response.json(await snapshot(room, player), { status: 201 });
        } catch (cause) {
          if (attempt === 5) throw cause;
        }
      }
    }

    if (action === "join") {
      const code = cleanCode(body.code);
      const name = cleanName(body.name);
      const role = body.role;
      const playerId = String(body.playerId ?? "").slice(0, 80);
      if (code.length !== 5 || !name || !playerId || !isRole(role)) {
        return error("Valid room code, name, and role are required.");
      }
      const room = await getRoom(code);
      if (!room) return error("Room not found.", 404);
      if (room.status !== "lobby") return error("That round has already started.", 409);

      const occupants = await getPlayers(code);
      const taken = occupants.find((player) => player.role === role);
      if (taken && Date.now() - taken.last_seen < 45_000) {
        return error(`${role} is already taken.`, 409);
      }

      const now = Date.now();
      if (taken) {
        await database()
          .prepare("DELETE FROM players WHERE room_code = ? AND role = ?")
          .bind(code, role)
          .run();
      }
      await database()
        .prepare(
          "INSERT INTO players (id, room_code, name, role, joined_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(playerId, code, name, role, now, now)
        .run();
      const player = (await getPlayer(code, playerId))!;
      return Response.json(await snapshot(room, player), { status: 201 });
    }

    const code = cleanCode(body.code);
    const playerId = String(body.playerId ?? "").slice(0, 80);
    if (code.length !== 5 || !playerId) return error("Room code and player are required.");
    const [foundRoom, player] = await Promise.all([
      getRoom(code),
      getPlayer(code, playerId),
    ]);
    if (!foundRoom || !player) return error("That seat no longer exists.", 404);
    const room = await settleRoom(foundRoom);

    if (action === "heartbeat") {
      await database()
        .prepare("UPDATE players SET last_seen = ? WHERE id = ? AND room_code = ?")
        .bind(Date.now(), playerId, code)
        .run();
      return Response.json({ ok: true });
    }

    if (action === "cursor") {
      if (player.role !== "operator") return error("Only the Blind Operator has a tracked cursor.", 403);
      const x = Number(body.x);
      const y = Number(body.y);
      const active = Boolean(body.active);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return error("Valid cursor coordinates are required.");
      await database()
        .prepare(
          "UPDATE players SET cursor_x = ?, cursor_y = ?, cursor_active = ?, cursor_updated_at = ?, last_seen = ? WHERE id = ? AND room_code = ?",
        )
        .bind(
          Math.round(Math.max(0, Math.min(1, x)) * 10_000),
          Math.round(Math.max(0, Math.min(1, y)) * 10_000),
          active ? 1 : 0,
          Date.now(),
          Date.now(),
          playerId,
          code,
        )
        .run();
      return Response.json({ ok: true });
    }

    if (action === "chat") {
      if (player.role !== "specialist") {
        return error("Only the Mute Specialist can send hand signs.", 403);
      }
      const symbol = String(body.symbol ?? "");
      if (!CHAT_SYMBOLS.has(symbol)) return error("Choose a valid chat sign.");
      const now = Date.now();
      await database()
        .prepare(
          "UPDATE players SET chat_symbol = ?, chat_updated_at = ?, last_seen = ? WHERE id = ? AND room_code = ?",
        )
        .bind(symbol, now, now, playerId, code)
        .run();
      return Response.json({ ok: true });
    }

    if (action === "message") {
      const state = roomState(room);
      if (room.status !== "playing" || !state.chatEnabled) {
        return error("Text chat is not enabled for this room.", 409);
      }
      if (player.role === "specialist") {
        return error("The Mute Specialist can only use hand signals.", 403);
      }
      const text = String(body.text ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim()
        .slice(0, 240);
      if (!text) return error("Type a message first.");
      state.messages.push({
        id: crypto.randomUUID(),
        senderId: player.id,
        senderRole: player.role,
        senderName: player.name,
        text,
        sentAt: Date.now(),
      });
      state.messages = state.messages.slice(-40);
      await mutateRoom(room, state, "playing");
      const updated = (await getRoom(code))!;
      return Response.json(await snapshot(updated, player));
    }

    if (action === "start" || action === "rematch") {
      if (room.host_player_id !== playerId) return error("Only the host can launch the bomb.", 403);
      const players = await getPlayers(code);
      if (players.length !== 3 || new Set(players.map((p) => p.role)).size !== 3) {
        return error("All three roles must be filled.", 409);
      }
      const previousState = roomState(room);
      const state = previousState.tutorialEnabled
        ? createTutorialGameState(previousState.chatEnabled)
        : createGameState(1, "waiting", "new", previousState.chatEnabled, [], false);
      state.actionLog = previousState.tutorialEnabled
        ? ["Tutorial suitcase opened. Complete the information chain together."]
        : ["Campaign staged. All three monkeys must ready up for Level 1."];
      await resetReadyPlayers(code);
      await mutateRoom(room, state, "playing");
      const updated = (await getRoom(code))!;
      return Response.json(await snapshot(updated, player));
    }

    if (action === "switch-role") {
      const state = roomState(room);
      const targetRole = body.targetRole;
      if (room.status !== "playing" || state.phase !== "waiting") {
        return error("Roles can only be switched in the ready room.", 409);
      }
      if (!isRole(targetRole)) return error("Choose a valid role.");
      if (targetRole === player.role) return Response.json(await snapshot(room, player));

      const players = await getPlayers(code);
      const targetPlayer = players.find((candidate) => candidate.role === targetRole);
      const now = Date.now();
      if (targetPlayer) {
        const temporaryRole = `swap-${playerId}`;
        await database().batch([
          database()
            .prepare("UPDATE players SET role = ?, ready_level = -1, last_seen = ? WHERE id = ? AND room_code = ?")
            .bind(temporaryRole, now, playerId, code),
          database()
            .prepare("UPDATE players SET role = ?, ready_level = -1 WHERE id = ? AND room_code = ?")
            .bind(player.role, targetPlayer.id, code),
          database()
            .prepare("UPDATE players SET role = ?, ready_level = -1 WHERE id = ? AND room_code = ?")
            .bind(targetRole, playerId, code),
          database()
            .prepare("UPDATE players SET ready_level = -1 WHERE room_code = ?")
            .bind(code),
        ]);
      } else {
        await database().batch([
          database()
            .prepare("UPDATE players SET role = ?, ready_level = -1, last_seen = ? WHERE id = ? AND room_code = ?")
            .bind(targetRole, now, playerId, code),
          database()
            .prepare("UPDATE players SET ready_level = -1 WHERE room_code = ?")
            .bind(code),
        ]);
      }

      const refreshedPlayer = (await getPlayer(code, playerId))!;
      return Response.json(await snapshot(room, refreshedPlayer));
    }

    if (action === "tutorial-action") {
      const state = roomState(room);
      if (room.status !== "playing" || state.phase !== "tutorial") {
        return error("The tutorial is not active.", 409);
      }
      const tutorialAction = String(body.tutorialAction) as TutorialAction;
      if (!["begin", "inspect-blind", "observe-light", "deaf-message", "manual-rule", "mute-signal", "practice-error", "solve-cable"].includes(tutorialAction)) {
        return error("Unknown tutorial action.");
      }
      const value = typeof body.value === "number" || typeof body.value === "string" ? body.value : undefined;
      const result = applyTutorialAction(state, player.role, tutorialAction, value);
      if (!result.ok) return error(result.error ?? "Complete the highlighted step first.", 409);
      if (tutorialAction === "mute-signal") {
        const now = Date.now();
        await database()
          .prepare("UPDATE players SET chat_symbol = ?, chat_updated_at = ?, last_seen = ? WHERE id = ? AND room_code = ?")
          .bind(String(value ?? ""), now, now, playerId, code)
          .run();
      }
      await mutateRoom(room, state, "playing");
      const updated = (await getRoom(code))!;
      return Response.json(await snapshot(updated, player));
    }

    if (action === "ready") {
      const state = roomState(room);
      if (room.status !== "playing" || state.phase !== "waiting") {
        return error("The squad is not in a ready room.", 409);
      }
      await database()
        .prepare("UPDATE players SET ready_level = ?, last_seen = ? WHERE id = ? AND room_code = ?")
        .bind(state.level, Date.now(), playerId, code)
        .run();
      const players = await getPlayers(code);
      const everyoneReady =
        players.length === 3 &&
        new Set(players.map((candidate) => candidate.role)).size === 3 &&
        players.every((candidate) => candidate.ready_level === state.level);

      if (!everyoneReady) {
        const refreshedPlayer = (await getPlayer(code, playerId))!;
        return Response.json(await snapshot(room, refreshedPlayer));
      }

      const nextLevel = state.lastResult === "cleared" ? nextLevelAfterClear(state.level) : state.level;
      const nextState = createGameState(nextLevel, "playing", "new", state.chatEnabled, [], state.tutorialEnabled);
      nextState.startAt = Date.now() + 3_000;
      nextState.actionLog = [
        `${levelDefinition(nextLevel).title}: Level ${nextLevel} armed.`,
      ];
      await mutateRoom(room, nextState, "playing");
      await resetReadyPlayers(code);
      const updated = (await getRoom(code))!;
      return Response.json(await snapshot(updated, player));
    }

    if (action === "module") {
      if (player.role !== "operator") return error("Only the Blind Operator can touch the bomb.", 403);
      const state = roomState(room);
      if (room.status !== "playing" || state.phase !== "playing") return error("The level is not active.", 409);
      if (state.startAt && Date.now() < state.startAt) return error("Wait for the countdown.", 409);
      const moduleAction = String(body.moduleAction) as ModuleAction;
      if (![
        "cut-cable",
        "toggle-slider",
        "check-slider",
        "press-direction",
        "calculator-key",
        "calculator-clear",
        "calculator-enter",
        "piano-key",
      ].includes(moduleAction)) {
        return error("Unknown bomb control.");
      }
      const value = typeof body.value === "number" || typeof body.value === "string" ? body.value : undefined;
      applyModuleAction(state, moduleAction, value);
      const finished = completedModules(state) === activeModules(state).length;
      if (finished || state.mistakes >= state.maxMistakes) {
        state.phase = "waiting";
        state.lastResult = finished ? "cleared" : "strikes";
        state.startAt = null;
        state.messages = [];
        state.actionLog.push(
          finished
            ? `Level ${state.level} clear. Ready up for the next level.`
            : `Three strikes. Ready up to retry Level ${state.level}.`,
        );
      }
      await mutateRoom(room, state, "playing");
      if (state.phase === "waiting") await resetReadyPlayers(code);
      const updated = (await getRoom(code))!;
      return Response.json(await snapshot(updated, player));
    }

    return error("Unknown room action.");
  } catch (cause) {
    console.error("room POST failed", cause);
    const message = cause instanceof Error ? cause.message : "Room request failed.";
    if (message.includes("changed")) return error(message, 409);
    return error("The room service hit a snag. Try again.", 500);
  }
}
