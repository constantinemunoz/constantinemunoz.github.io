// The room referee. This is the old /api/room server route with the database
// calls removed: it keeps the whole room in memory, applies every request,
// and produces a separate view for each player so nobody receives information
// their role should not see.
//
// In multiplayer it runs inside the room host's browser (see room-client.ts).
// It has no Firebase or browser dependencies so it can be tested in Node.
import {
  activeModules,
  applyModuleAction,
  applyTutorialAction,
  completedModules,
  createGameState,
  createTutorialGameState,
  levelDefinition,
  makeId,
  nextLevelAfterClear,
  publicStateForRole,
  ROLE_META,
  ROLES,
  type GameState,
  type ModuleAction,
  type Role,
  type TutorialAction,
} from "./game.ts";

export type RoomStatus = "lobby" | "playing";

export type Seat = {
  id: string;
  name: string;
  role: Role;
  joinedAt: number;
  readyLevel: number;
};

export type EngineData = {
  code: string;
  status: RoomStatus;
  hostId: string;
  createdAt: number;
  version: number;
  state: GameState;
  seats: Seat[];
};

export type RoomRequest = Record<string, unknown>;

export type HandleResult =
  | { ok: true; signal?: { symbol: string; at: number }; handoffTo?: string; closeRoom?: boolean }
  | { ok: false; error: string };

export type EngineSnapshot = {
  room: {
    code: string;
    status: RoomStatus;
    version: number;
    isHost: boolean;
    readyCount: number;
    players: Array<{ name: string; role: Role; online: boolean; ready: boolean }>;
    game: ReturnType<typeof publicStateForRole>;
  };
  player: { id: string; name: string; role: Role };
};

export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const SIGNAL_SYMBOLS = new Set([
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

const MODULE_ACTIONS: ModuleAction[] = [
  "cut-cable",
  "toggle-slider",
  "check-slider",
  "press-direction",
  "calculator-key",
  "calculator-clear",
  "calculator-enter",
  "piano-key",
];

const TUTORIAL_ACTIONS: TutorialAction[] = [
  "begin",
  "inspect-blind",
  "observe-light",
  "deaf-message",
  "manual-rule",
  "mute-signal",
  "practice-error",
  "solve-cable",
];

export function cleanCode(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

export function cleanName(value: unknown) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 20);
}

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export function randomRoomCode() {
  return Array.from({ length: 5 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
}

function fail(error: string): HandleResult {
  return { ok: false, error };
}

function requestValue(request: RoomRequest) {
  return typeof request.value === "number" || typeof request.value === "string" ? request.value : undefined;
}

export class RoomEngine {
  data: EngineData;
  private online = new Set<string>();

  constructor(data: EngineData) {
    this.data = data;
  }

  static create(options: { code: string; hostId: string; name: string; role: Role; chatEnabled: boolean; tutorialEnabled: boolean; now: number }) {
    const state = createGameState(1, "waiting", "new", options.chatEnabled, [], options.tutorialEnabled);
    return new RoomEngine({
      code: options.code,
      status: "lobby",
      hostId: options.hostId,
      createdAt: options.now,
      version: 1,
      state,
      seats: [{ id: options.hostId, name: options.name, role: options.role, joinedAt: options.now, readyLevel: -1 }],
    });
  }

  static restore(json: string) {
    const data = JSON.parse(json) as EngineData;
    if (!data || typeof data.code !== "string" || !data.state?.modules || !Array.isArray(data.seats)) {
      throw new Error("The saved room could not be read.");
    }
    return new RoomEngine(data);
  }

  serialize() {
    return JSON.stringify(this.data);
  }

  seat(id: string) {
    return this.data.seats.find((seat) => seat.id === id);
  }

  seatForRole(role: Role) {
    return this.data.seats.find((seat) => seat.role === role);
  }

  // The host is running this code, so it is online by definition.
  isOnline(id: string) {
    return id === this.data.hostId || this.online.has(id);
  }

  setOnline(ids: Iterable<string>) {
    const next = new Set(ids);
    const relevant = (set: Set<string>) => this.data.seats.map((seat) => set.has(seat.id)).join(",");
    const changed = relevant(next) !== relevant(this.online);
    this.online = next;
    return changed;
  }

  roles() {
    return Object.fromEntries(this.data.seats.map((seat) => [seat.role, seat.id])) as Partial<Record<Role, string>>;
  }

  private resetReady() {
    for (const seat of this.data.seats) seat.readyLevel = -1;
  }

  private settle(now: number) {
    const state = this.data.state;
    if (this.data.status !== "playing") return false;

    if (state.phase === "tutorial" && state.tutorial?.completedAt && now >= state.tutorial.completedAt + 4_000) {
      const next = createGameState(1, "playing", "new", state.chatEnabled, [], state.tutorialEnabled);
      next.startAt = now + 3_000;
      next.actionLog = ["Tutorial complete. Level 1 armed with normal role restrictions."];
      this.data.state = next;
      this.resetReady();
      return true;
    }

    if (state.phase === "playing" && state.startAt && now >= state.startAt + state.durationMs) {
      state.phase = "waiting";
      state.lastResult = "timeout";
      state.startAt = null;
      state.messages = [];
      state.actionLog.push(`Level ${state.level} timed out. Ready up to retry it.`);
      this.resetReady();
      return true;
    }
    return false;
  }

  // Applies time-based transitions (timeouts, the end of the tutorial).
  tick(now: number) {
    const changed = this.settle(now);
    if (changed) this.data.version += 1;
    return changed;
  }

  handle(id: string, request: RoomRequest, now: number): HandleResult {
    const settled = this.settle(now);
    let result: HandleResult;
    try {
      result = this.dispatch(id, request, now);
    } catch {
      result = fail("The room hit a snag. Try again.");
    }
    if (result.ok || settled) this.data.version += 1;
    return result;
  }

  private dispatch(id: string, request: RoomRequest, now: number): HandleResult {
    const action = String(request.action ?? "");
    if (action === "join") return this.join(id, request, now);

    const seat = this.seat(id);
    if (!seat) return fail("That seat no longer exists.");
    if (action === "leave") return this.leave(seat);
    if (action === "message") return this.message(seat, request, now);
    if (action === "start") return this.start(seat, now);
    if (action === "switch-role") return this.switchRole(seat, request);
    if (action === "tutorial-action") return this.tutorialAction(seat, request, now);
    if (action === "ready") return this.ready(seat, now);
    if (action === "module") return this.module(seat, request, now);
    return fail("Unknown room action.");
  }

  private join(id: string, request: RoomRequest, now: number): HandleResult {
    const name = cleanName(request.name);
    const role = request.role;
    if (!name || !isRole(role)) return fail("Name and role are required.");
    if (this.seat(id)) return { ok: true };

    const taken = this.seatForRole(role);
    if (taken && this.isOnline(taken.id)) return fail(`${ROLE_META[role].name} is already taken. Pick another role.`);
    // A seat whose player is offline can be reclaimed, in the lobby or mid-game,
    // so someone who closed their tab can rejoin with the room code.
    if (taken) this.data.seats = this.data.seats.filter((seat) => seat !== taken);
    this.data.seats.push({ id, name, role, joinedAt: now, readyLevel: -1 });
    return { ok: true };
  }

  private leave(seat: Seat): HandleResult {
    this.data.seats = this.data.seats.filter((candidate) => candidate !== seat);
    if (seat.id !== this.data.hostId) return { ok: true };
    const successor = this.data.seats.find((candidate) => this.online.has(candidate.id)) ?? this.data.seats[0];
    if (!successor) return { ok: true, closeRoom: true };
    this.data.hostId = successor.id;
    return { ok: true, handoffTo: successor.id };
  }

  private message(seat: Seat, request: RoomRequest, now: number): HandleResult {
    const state = this.data.state;
    if (this.data.status !== "playing" || !state.chatEnabled) return fail("Text chat is not enabled for this room.");
    if (seat.role === "specialist") return fail("The Mute Specialist can only use hand signals.");
    const text = String(request.text ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, 240);
    if (!text) return fail("Type a message first.");
    state.messages.push({ id: makeId(), senderId: seat.id, senderRole: seat.role, senderName: seat.name, text, sentAt: now });
    state.messages = state.messages.slice(-40);
    return { ok: true };
  }

  private start(seat: Seat, now: number): HandleResult {
    if (seat.id !== this.data.hostId) return fail("Only the host can launch the bomb.");
    if (this.data.status !== "lobby") return fail("The campaign has already started.");
    if (this.data.seats.length !== 3 || new Set(this.data.seats.map((candidate) => candidate.role)).size !== 3) {
      return fail("All three roles must be filled.");
    }
    const previous = this.data.state;
    const state = previous.tutorialEnabled
      ? createTutorialGameState(previous.chatEnabled)
      : createGameState(1, "waiting", "new", previous.chatEnabled, [], false);
    if (state.phase === "tutorial") state.startAt = now;
    state.actionLog = previous.tutorialEnabled
      ? ["Tutorial suitcase opened. Complete the information chain together."]
      : ["Campaign staged. All three monkeys must ready up for Level 1."];
    this.data.state = state;
    this.data.status = "playing";
    this.resetReady();
    return { ok: true };
  }

  private switchRole(seat: Seat, request: RoomRequest): HandleResult {
    const state = this.data.state;
    const targetRole = request.targetRole;
    if (this.data.status !== "playing" || state.phase !== "waiting") return fail("Roles can only be switched in the ready room.");
    if (!isRole(targetRole)) return fail("Choose a valid role.");
    if (targetRole === seat.role) return { ok: true };
    const other = this.seatForRole(targetRole);
    if (other) other.role = seat.role;
    seat.role = targetRole;
    this.resetReady();
    return { ok: true };
  }

  private tutorialAction(seat: Seat, request: RoomRequest, now: number): HandleResult {
    const state = this.data.state;
    if (this.data.status !== "playing" || state.phase !== "tutorial") return fail("The tutorial is not active.");
    const tutorialAction = String(request.tutorialAction) as TutorialAction;
    if (!TUTORIAL_ACTIONS.includes(tutorialAction)) return fail("Unknown tutorial action.");
    const value = requestValue(request);
    const result = applyTutorialAction(state, seat.role, tutorialAction, value);
    if (!result.ok) return fail(result.error ?? "Complete the highlighted step first.");
    // Keep every timestamp on the shared server clock rather than the host's.
    if (state.tutorial?.completedAt) state.tutorial.completedAt = now;
    if (tutorialAction === "mute-signal") return { ok: true, signal: { symbol: String(value ?? ""), at: now } };
    return { ok: true };
  }

  private ready(seat: Seat, now: number): HandleResult {
    const state = this.data.state;
    if (this.data.status !== "playing" || state.phase !== "waiting") return fail("The squad is not in a ready room.");
    seat.readyLevel = state.level;
    const everyoneReady =
      this.data.seats.length === 3 &&
      new Set(this.data.seats.map((candidate) => candidate.role)).size === 3 &&
      this.data.seats.every((candidate) => candidate.readyLevel === state.level);
    if (!everyoneReady) return { ok: true };

    const nextLevel = state.lastResult === "cleared" ? nextLevelAfterClear(state.level) : state.level;
    const next = createGameState(nextLevel, "playing", "new", state.chatEnabled, [], state.tutorialEnabled);
    next.startAt = now + 3_000;
    next.actionLog = [`${levelDefinition(nextLevel).title}: Level ${nextLevel} armed.`];
    this.data.state = next;
    this.resetReady();
    return { ok: true };
  }

  private module(seat: Seat, request: RoomRequest, now: number): HandleResult {
    const state = this.data.state;
    if (seat.role !== "operator") return fail("Only the Blind Operator can touch the bomb.");
    if (this.data.status !== "playing" || state.phase !== "playing") return fail("The level is not active.");
    if (state.startAt && now < state.startAt) return fail("Wait for the countdown.");
    const moduleAction = String(request.moduleAction) as ModuleAction;
    if (!MODULE_ACTIONS.includes(moduleAction)) return fail("Unknown bomb control.");

    applyModuleAction(state, moduleAction, requestValue(request));
    const finished = completedModules(state) === activeModules(state).length;
    if (finished || state.mistakes >= state.maxMistakes) {
      state.phase = "waiting";
      state.lastResult = finished ? "cleared" : "strikes";
      state.startAt = null;
      state.messages = [];
      state.actionLog.push(finished ? `Level ${state.level} clear. Ready up for the next level.` : `Three strikes. Ready up to retry Level ${state.level}.`);
      this.resetReady();
    }
    return { ok: true };
  }

  snapshotFor(id: string): EngineSnapshot | null {
    const seat = this.seat(id);
    if (!seat) return null;
    const state = this.data.state;
    const seats = [...this.data.seats].sort((a, b) => a.joinedAt - b.joinedAt);
    return {
      room: {
        code: this.data.code,
        status: this.data.status,
        version: this.data.version,
        isHost: this.data.hostId === id,
        readyCount: seats.filter((candidate) => candidate.readyLevel === state.level).length,
        players: seats.map((candidate) => ({
          name: candidate.name,
          role: candidate.role,
          online: this.isOnline(candidate.id),
          ready: state.phase === "waiting" && candidate.readyLevel === state.level,
        })),
        game: publicStateForRole(state, seat.role, seat.id),
      },
      player: { id: seat.id, name: seat.name, role: seat.role },
    };
  }
}
