// Remembers which "your move" tips this player has learned, keyed by
// "role:module". A tip shows until the team clears that module once while
// this player holds that role, so returning players are not nagged and a
// role swap brings back the tips for the new job.
// Key kept from the game's old name so learned tips survive the rename.
const STORAGE_KEY = "bombanana-learned-tips";
const EMPTY: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();
let persisted: Set<string> | null = null;
const sessionOnly = new Set<string>();
let snapshot: ReadonlySet<string> | null = null;

function loadPersisted() {
  if (persisted) return persisted;
  persisted = new Set();
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(list)) for (const key of list) if (typeof key === "string") persisted.add(key);
  } catch {
    // Storage can be blocked (private windows); tips then reset on reload.
  }
  return persisted;
}

export function getLearnedTips(): ReadonlySet<string> {
  if (!snapshot) snapshot = new Set([...loadPersisted(), ...sessionOnly]);
  return snapshot;
}

export function getServerLearnedTips() {
  return EMPTY;
}

export function subscribeLearnedTips(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// persist=false keeps the change for this page only (used by developer mode).
export function markTipsLearned(keys: string[], persist = true) {
  const known = getLearnedTips();
  const fresh = keys.filter((key) => key && !known.has(key));
  if (fresh.length === 0) return;
  const target = persist ? loadPersisted() : sessionOnly;
  for (const key of fresh) target.add(key);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadPersisted()]));
    } catch {
      // Ignore storage errors; the in-memory copy still hides the tip.
    }
  }
  snapshot = null;
  for (const listener of listeners) listener();
}
