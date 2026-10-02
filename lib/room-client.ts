// Multiplayer rooms over Firebase Realtime Database.
//
// How a room works:
// - The player who creates a room is its host. The host's browser runs the
//   referee (RoomEngine) and is the only one allowed to read the full game
//   state, which it keeps at rooms/{code}/engine so a new host can resume.
// - Every player sends requests by adding them to rooms/{code}/inbox. The host
//   applies them and writes each player's own filtered view to
//   rooms/{code}/views/{uid} plus a reply to rooms/{code}/outbox/{uid}.
// - The Blind cursor and the Mute hand sign change many times a second, so
//   those players write them straight to rooms/{code}/cursor and /signal.
// - rooms/{code}/presence tracks who has the page open. If the host's browser
//   disappears, another seated player takes over as host automatically.
//
// database.rules.json enforces who may read and write each of these paths.
import { getApps, initializeApp } from "firebase/app";
import { browserSessionPersistence, connectAuthEmulator, getAuth, initializeAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  connectDatabaseEmulator,
  endAt,
  get,
  getDatabase,
  limitToFirst,
  onChildAdded,
  onDisconnect,
  onValue,
  orderByValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { FIREBASE_CONFIG } from "./firebase-config.ts";
import type { Role } from "./game.ts";
import { cleanCode, cleanName, randomRoomCode, RoomEngine, SIGNAL_SYMBOLS, type EngineSnapshot, type RoomRequest } from "./room-engine.ts";

export type LiveCursor = { x: number; y: number; active: boolean; at: number; anchor?: string; ax?: number; ay?: number };
export type CursorReport = { x: number; y: number; active: boolean; anchor?: string; ax?: number; ay?: number };
export type LiveSignal = { symbol: string; at: number };
export type LiveFeed = { cursor: LiveCursor | null; signal: LiveSignal | null };

type Listener = {
  onSnapshot: (snapshot: EngineSnapshot) => void;
  onRemoved: (reason: string) => void;
  onHostStatus: (status: { hostOnline: boolean }) => void;
};

const REQUEST_TIMEOUT_MS = 12_000;
// Brief network blips should not flash a warning or hand the room to someone else.
const HOST_BANNER_DELAY_MS = 2_500;
const HOST_GRACE_MS = 7_000;
const STALE_ROOM_MS = 24 * 60 * 60 * 1000;
const HOST_UNREACHABLE = "The room host's browser isn't responding. If the host closed BOMBANANA, wait a few seconds for another player to take over, then try again.";

// ---------------------------------------------------------------------------
// Firebase setup

let services: { auth: Auth; db: Database } | null = null;
let clockOffset = 0;

function firebase() {
  if (services) return services;
  const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
  let auth: Auth;
  try {
    // Session persistence keeps one identity per browser tab, so three tabs on
    // one computer act as three players, and a reload keeps your seat.
    auth = initializeAuth(app, { persistence: browserSessionPersistence });
  } catch {
    auth = getAuth(app);
  }
  const db = getDatabase(app);
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDatabaseEmulator(db, "127.0.0.1", 9000);
  }
  onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    clockOffset = Number(snapshot.val()) || 0;
  });
  services = { auth, db };
  return services;
}

// Firebase's estimate of the shared server clock. Every timer uses this so all
// three players see the same countdown even if their computer clocks differ.
export function serverNow() {
  return Date.now() + clockOffset;
}

async function ensureUser() {
  const { auth } = firebase();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export function describeError(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code: unknown }).code) : "";
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  if (/permission[_ ]denied/i.test(code) || /permission[_ ]denied/i.test(message)) {
    return "Firebase refused the request. Check that the BOMBANANA database rules are published in the Firebase console.";
  }
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
    return "Anonymous sign-in is turned off. Turn it on in the Firebase console under Authentication, Sign-in method.";
  }
  if (code === "auth/network-request-failed") return "Couldn't reach the game server. Check your internet connection and try again.";
  return message || "Something went wrong. Try again.";
}

function isPermissionDenied(cause: unknown) {
  return describeError(cause).startsWith("Firebase refused");
}

function roomPath(code: string, path = "") {
  return path ? `rooms/${code}/${path}` : `rooms/${code}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Host runtime: runs the referee for one room in the host's browser.

class HostRuntime {
  private engine: RoomEngine | null;
  private stopped = false;
  private unsubscribers: Unsubscribe[] = [];
  private ticker: ReturnType<typeof setInterval> | null = null;
  private published = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly code: string,
    private readonly uid: string,
    engine: RoomEngine | null = null,
  ) {
    this.engine = engine;
  }

  async start() {
    const { db } = firebase();
    if (!this.engine) {
      const saved = await get(ref(db, roomPath(this.code, "engine")));
      if (this.stopped) return;
      if (typeof saved.val() !== "string") return this.stop();
      this.engine = RoomEngine.restore(saved.val());
      // This browser just took over as host.
      this.engine.data.hostId = this.uid;
      this.engine.data.version += 1;
    }
    // Load who is online before handling any request, so a pending join cannot
    // claim the seat of a player who is still connected.
    const present = await get(ref(db, roomPath(this.code, "presence")));
    if (this.stopped) return;
    this.engine.setOnline(Object.keys(present.val() ?? {}));
    this.publish();
    this.unsubscribers.push(
      onValue(ref(db, roomPath(this.code, "presence")), (snapshot) => {
        if (this.engine?.setOnline(Object.keys(snapshot.val() ?? {}))) {
          this.engine.data.version += 1;
          this.publish();
        }
      }),
      // Signs travel on a direct channel; note them so every view can show
      // which step of the relay the team is on.
      onValue(ref(db, roomPath(this.code, "signal")), (snapshot) => {
        const value = snapshot.val() as { at?: unknown } | null;
        if (value && typeof value.at === "number" && this.engine?.noteSignal(value.at)) this.publish();
      }),
      onChildAdded(ref(db, roomPath(this.code, "inbox")), (snapshot) => {
        const key = snapshot.key;
        const entry = snapshot.val() as { uid?: unknown; payload?: unknown } | null;
        if (key && entry) this.queue = this.queue.then(() => this.process(key, entry)).catch(() => undefined);
      }),
    );
    this.ticker = setInterval(() => {
      if (!this.stopped && this.engine?.tick(serverNow())) this.publish();
    }, 500);
  }

  stop() {
    this.stopped = true;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private process(key: string, entry: { uid?: unknown; payload?: unknown }) {
    const engine = this.engine;
    if (this.stopped || !engine) return;
    const uid = typeof entry.uid === "string" ? entry.uid : "";
    let request: RoomRequest | null = null;
    try {
      const parsed = JSON.parse(String(entry.payload ?? ""));
      if (parsed && typeof parsed === "object") request = parsed as RoomRequest;
    } catch {
      request = null;
    }
    const result = uid && request ? engine.handle(uid, request, serverNow()) : ({ ok: false, error: "That request could not be read." } as const);

    if (result.ok && result.closeRoom) {
      // The last player left. Delete the room.
      const { db } = firebase();
      update(ref(db), { [roomPath(this.code)]: null, [`roomIndex/${this.code}`]: null }).catch(() => undefined);
      return this.stop();
    }

    const extra: Record<string, unknown> = {
      [`inbox/${key}`]: null,
      ...(uid ? { [`outbox/${uid}/${key}`]: { ok: result.ok, error: result.ok ? "" : result.error, version: engine.data.version } } : {}),
    };
    if (result.ok && result.handoffTo) extra["meta/hostUid"] = result.handoffTo;
    this.publish(extra);
    if (result.ok && result.handoffTo) this.stop();
  }

  private publish(extra: Record<string, unknown> = {}) {
    const engine = this.engine;
    if (!engine) return;
    const { db } = firebase();
    const updates: Record<string, unknown> = {
      [roomPath(this.code, "engine")]: engine.serialize(),
      [roomPath(this.code, "roles")]: engine.roles(),
      [roomPath(this.code, "meta/status")]: engine.data.status,
      [`roomIndex/${this.code}`]: serverNow(),
    };
    const seated = new Set(engine.data.seats.map((seat) => seat.id));
    for (const id of seated) {
      const view = JSON.stringify(engine.snapshotFor(id));
      if (this.published.get(id) === view) continue;
      this.published.set(id, view);
      updates[roomPath(this.code, `views/${id}`)] = view;
    }
    for (const id of [...this.published.keys()]) {
      if (seated.has(id)) continue;
      this.published.delete(id);
      updates[roomPath(this.code, `views/${id}`)] = null;
    }
    for (const [path, value] of Object.entries(extra)) updates[roomPath(this.code, path)] = value;
    update(ref(db), updates).catch((cause) => {
      // Losing host rights (another player took over) shows up as a denied write.
      if (isPermissionDenied(cause)) this.stop();
    });
  }
}

// ---------------------------------------------------------------------------
// Room connection: one per browser tab while you are in a room.

export class RoomConnection {
  private unsubscribers: Unsubscribe[] = [];
  private listener: Listener | null = null;
  private latest: EngineSnapshot | null = null;
  private seated = false;
  private hostId: string | null = null;
  private presence: Record<string, unknown> = {};
  private presenceLoaded = false;
  private host: HostRuntime | null = null;
  private takeoverTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private hostReportedOnline = true;
  private versionWaiters: Array<{ version: number; resolve: () => void }> = [];
  private closed = false;
  private hostStarted = false;
  private presenceEntry: ReturnType<typeof push> | null = null;

  private constructor(
    readonly code: string,
    readonly uid: string,
    pendingHost: HostRuntime | null,
  ) {
    this.host = pendingHost;
  }

  static open(code: string, uid: string, pendingHost: HostRuntime | null = null) {
    const connection = new RoomConnection(code, uid, pendingHost);
    connection.connect();
    return connection;
  }

  private connect() {
    const { db } = firebase();
    this.unsubscribers.push(
      // One presence entry per connection: a reload's new entry cannot be wiped
      // by the old tab's disconnect cleanup arriving late.
      onValue(ref(db, ".info/connected"), (snapshot) => {
        if (snapshot.val() !== true || this.closed) return;
        const entry = push(ref(db, roomPath(this.code, `presence/${this.uid}`)));
        this.presenceEntry = entry;
        onDisconnect(entry)
          .remove()
          .then(() => set(entry, true))
          .catch(() => undefined);
      }),
      onValue(ref(db, roomPath(this.code, `views/${this.uid}`)), (snapshot) => {
        const raw = snapshot.val();
        if (typeof raw !== "string") {
          if (this.seated) {
            this.seated = false;
            this.latest = null;
            this.listener?.onRemoved("You are no longer in that room. Your seat was closed or claimed by someone else.");
          }
          return;
        }
        this.seated = true;
        this.latest = JSON.parse(raw) as EngineSnapshot;
        this.versionWaiters = this.versionWaiters.filter((waiter) => {
          if (this.latest && this.latest.room.version < waiter.version) return true;
          waiter.resolve();
          return false;
        });
        this.listener?.onSnapshot(this.latest);
        this.syncHost();
      }),
      onValue(ref(db, roomPath(this.code, "meta/hostUid")), (snapshot) => {
        this.hostId = typeof snapshot.val() === "string" ? snapshot.val() : null;
        this.syncHost();
      }),
      onValue(ref(db, roomPath(this.code, "presence")), (snapshot) => {
        this.presence = snapshot.val() ?? {};
        this.presenceLoaded = true;
        this.syncHost();
      }),
    );
  }

  subscribe(listener: Listener) {
    this.listener = listener;
    const latest = this.latest;
    if (latest) queueMicrotask(() => this.listener === listener && listener.onSnapshot(latest));
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  // Becomes host when the room says so, steps down when it no longer does,
  // and takes over when the host has been offline for a few seconds.
  private syncHost() {
    if (this.closed) return;
    if (this.hostId === this.uid) {
      this.clearTakeover();
      this.reportHost(true);
      if (!this.host) this.host = new HostRuntime(this.code, this.uid);
      if (!this.hostStarted) {
        this.hostStarted = true;
        this.host.start().catch(() => undefined);
      }
      return;
    }
    if (this.host) {
      this.host.stop();
      this.host = null;
      this.hostStarted = false;
    }
    const hostOnline = !this.hostId || !this.presenceLoaded || this.presence[this.hostId] != null;
    if (hostOnline) {
      this.clearTakeover();
      this.reportHost(true);
    } else if (!this.takeoverTimer) {
      this.bannerTimer = setTimeout(() => {
        this.bannerTimer = null;
        this.reportHost(false);
      }, HOST_BANNER_DELAY_MS);
      this.takeoverTimer = setTimeout(() => {
        this.takeoverTimer = null;
        this.takeOver().catch(() => undefined);
      }, HOST_GRACE_MS);
    }
  }

  private clearTakeover() {
    if (this.takeoverTimer) clearTimeout(this.takeoverTimer);
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.takeoverTimer = null;
    this.bannerTimer = null;
  }

  private reportHost(hostOnline: boolean) {
    if (this.hostReportedOnline === hostOnline) return;
    this.hostReportedOnline = hostOnline;
    this.listener?.onHostStatus({ hostOnline });
  }

  private async takeOver() {
    const expected = this.hostId;
    if (this.closed || !this.seated || !expected || this.presence[expected] != null) return;
    const { db } = firebase();
    await runTransaction(ref(db, roomPath(this.code, "meta/hostUid")), (current) => (current === expected ? this.uid : undefined), {
      applyLocally: false,
    });
  }

  async request(payload: RoomRequest, options: { timeoutMs?: number; waitForView?: boolean } = {}) {
    const { timeoutMs = REQUEST_TIMEOUT_MS, waitForView = true } = options;
    const { db } = firebase();
    const entry = push(ref(db, roomPath(this.code, "inbox")));
    const key = entry.key as string;
    const responseRef = ref(db, roomPath(this.code, `outbox/${this.uid}/${key}`));
    let unsubscribe: Unsubscribe = () => undefined;
    const response = new Promise<{ ok: boolean; error?: string; version?: number }>((resolve, reject) => {
      unsubscribe = onValue(
        responseRef,
        (snapshot) => {
          const value = snapshot.val();
          if (value) resolve(value);
        },
        reject,
      );
    });
    try {
      const sent = set(entry, { uid: this.uid, payload: JSON.stringify(payload), at: serverNow() });
      sent.catch(() => undefined);
      const reply = await withTimeout(Promise.race([response, sent.then(() => response)]), timeoutMs, HOST_UNREACHABLE);
      remove(responseRef).catch(() => undefined);
      if (!reply.ok) throw new Error(reply.error || "The room rejected that request.");
      if (waitForView && typeof reply.version === "number") await this.waitForVersion(reply.version);
      return this.latest;
    } catch (cause) {
      remove(entry).catch(() => undefined);
      throw new Error(describeError(cause));
    } finally {
      unsubscribe();
    }
  }

  private waitForVersion(version: number) {
    if (this.latest && this.latest.room.version >= version) return Promise.resolve();
    const wait = new Promise<void>((resolve) => this.versionWaiters.push({ version, resolve }));
    return withTimeout(wait, 4_000, "").catch(() => undefined);
  }

  // Stops reporting removal to the screen, used when the player leaves on purpose.
  detach() {
    this.listener = null;
  }

  watchLive(callback: (feed: LiveFeed) => void) {
    const { db } = firebase();
    const feed: LiveFeed = { cursor: null, signal: null };
    const stopCursor = onValue(ref(db, roomPath(this.code, "cursor")), (snapshot) => {
      feed.cursor = snapshot.val();
      callback({ ...feed });
    });
    const stopSignal = onValue(ref(db, roomPath(this.code, "signal")), (snapshot) => {
      feed.signal = snapshot.val();
      callback({ ...feed });
    });
    return () => {
      stopCursor();
      stopSignal();
    };
  }

  sendCursor(point: CursorReport) {
    const { db } = firebase();
    const value: LiveCursor = { x: point.x, y: point.y, active: point.active, at: serverNow() };
    // Firebase rejects undefined fields, so only include the anchor when there is one.
    if (point.anchor && typeof point.ax === "number" && typeof point.ay === "number") {
      value.anchor = point.anchor.slice(0, 40);
      value.ax = point.ax;
      value.ay = point.ay;
    }
    return set(ref(db, roomPath(this.code, "cursor")), value);
  }

  sendSignal(symbol: string) {
    if (!SIGNAL_SYMBOLS.has(symbol)) return Promise.reject(new Error("Choose a valid sign."));
    const { db } = firebase();
    return set(ref(db, roomPath(this.code, "signal")), { symbol, at: serverNow() });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearTakeover();
    this.host?.stop();
    this.host = null;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.listener = null;
    const entry = this.presenceEntry;
    if (entry) {
      onDisconnect(entry).cancel().catch(() => undefined);
      remove(entry).catch(() => undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry points used by the game screens.

let current: RoomConnection | null = null;

function activate(connection: RoomConnection) {
  current?.close();
  current = connection;
  return connection;
}

async function cleanupStaleRooms() {
  const { db } = firebase();
  const stale = await get(query(ref(db, "roomIndex"), orderByValue(), endAt(serverNow() - STALE_ROOM_MS), limitToFirst(20)));
  const codes: string[] = [];
  stale.forEach((child) => {
    if (child.key) codes.push(child.key);
  });
  await Promise.all(codes.map((code) => update(ref(db), { [roomPath(code)]: null, [`roomIndex/${code}`]: null }).catch(() => undefined)));
}

export async function createRoom(options: { name: string; role: Role; chatEnabled: boolean; tutorialEnabled: boolean; startLevel?: number }) {
  try {
    const uid = await ensureUser();
    const { db } = firebase();
    cleanupStaleRooms().catch(() => undefined);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomRoomCode();
      const now = serverNow();
      const claimed = await runTransaction(
        ref(db, roomPath(code, "meta")),
        (existing) => (existing === null ? { hostUid: uid, createdAt: now, status: "lobby" } : undefined),
        { applyLocally: false },
      );
      if (!claimed.committed) continue;
      const engine = RoomEngine.create({ code, hostId: uid, name: cleanName(options.name), role: options.role, chatEnabled: options.chatEnabled, tutorialEnabled: options.tutorialEnabled, startLevel: options.startLevel, now });
      const snapshot = engine.snapshotFor(uid) as EngineSnapshot;
      const connection = activate(RoomConnection.open(code, uid, new HostRuntime(code, uid, engine)));
      return { connection, snapshot };
    }
    throw new Error("Could not find a free room code. Try again.");
  } catch (cause) {
    throw new Error(describeError(cause));
  }
}

export async function joinRoom(options: { code: string; name: string; role: Role }) {
  const code = cleanCode(options.code);
  let connection: RoomConnection | null = null;
  try {
    const uid = await ensureUser();
    const { db } = firebase();
    const meta = await get(ref(db, roomPath(code, "meta")));
    if (!meta.exists()) throw new Error("Room not found. Check the five-character code.");
    connection = activate(RoomConnection.open(code, uid));
    const snapshot = await connection.request({ action: "join", name: cleanName(options.name), role: options.role });
    if (!snapshot) throw new Error("The room did not send your seat. Try again.");
    return { connection, snapshot };
  } catch (cause) {
    if (connection && current === connection) {
      connection.close();
      current = null;
    }
    throw new Error(describeError(cause));
  }
}

// Reopens the room this tab was in before a reload. Returns null when the seat
// is gone; throws when Firebase cannot be reached so the caller can keep the
// saved session and let the player retry.
export async function resumeRoom(code: string) {
  const uid = await ensureUser();
  const { db } = firebase();
  const view = await get(ref(db, roomPath(cleanCode(code), `views/${uid}`)));
  if (typeof view.val() !== "string") return null;
  const connection = activate(RoomConnection.open(cleanCode(code), uid));
  return { connection, snapshot: JSON.parse(view.val()) as EngineSnapshot };
}

export async function leaveRoom() {
  const connection = current;
  if (!connection) return;
  connection.detach();
  try {
    await connection.request({ action: "leave" }, { timeoutMs: 3_000, waitForView: false });
  } catch {
    // Leaving still closes this tab's connection even if the host is gone.
  }
  connection.close();
  if (current === connection) current = null;
}

export function roomRequest(payload: RoomRequest) {
  if (!current) return Promise.reject(new Error("You are not in a room."));
  return current.request(payload);
}

export function sendCursor(point: CursorReport) {
  current?.sendCursor(point).catch(() => undefined);
}

export function sendSignal(symbol: string) {
  if (!current) return Promise.reject(new Error("You are not in a room."));
  return current.sendSignal(symbol).catch((cause) => {
    throw new Error(describeError(cause));
  });
}
