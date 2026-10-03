"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent as ReactFormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Banana,
  Bomb,
  BookOpen,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Clock3,
  Copy,
  CornerDownLeft,
  Ear,
  EarOff,
  Eye,
  Grid3x3,
  EyeOff,
  Hand,
  Hash,
  Lightbulb,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MousePointer2,
  Piano,
  Play,
  Radio,
  RefreshCw,
  RotateCw,
  Scissors,
  Send,
  ShieldAlert,
  Shuffle,
  SlidersVertical,
  Smile,
  TimerReset,
  TriangleAlert,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  activeModules,
  applyModuleAction,
  CABLE_RULES,
  CALCULATOR_RULES,
  completedModules,
  createGameState,
  DIRECTION_RULES,
  LEVELS,
  EASY_MODULES,
  INFINITE_LEVEL,
  LAST_CAMPAIGN_LEVEL,
  MEDIUM_MODULES,
  levelDefinition,
  makeId,
  nextLevelAfterClear,
  PIANO_RULES,
  PRACTICE_CABLE,
  publicStateForRole,
  resetLog,
  ROLE_META,
  ROLES,
  SLIDER_NUMBER_GROUPS,
  SLIDER_RULES,
  SOUND_GROUPS,
  SOUNDBOARD_RULES,
  SYMBOL_NAMES,
  SYMBOL_RULES,
  SYMBOLS,
  type Direction,
  type SymbolKey,
  type SoundGroup,
  type GameState,
  type LightColor,
  type ModuleAction,
  type ActionLogEntry,
  type ModuleKey,
  type Role,
  type SliderTest,
} from "@/lib/game";
import { getLearnedTips, getServerLearnedTips, markTipsLearned, subscribeLearnedTips } from "@/lib/coach-store";
import {
  createRoom,
  describeError,
  joinRoom,
  leaveRoom,
  resumeRoom,
  roomRequest,
  sendCursor,
  sendSignal,
  serverNow,
  type LiveFeed,
  type RoomConnection,
} from "@/lib/room-client";

type Player = { name: string; role: Role; online: boolean; ready: boolean };
type CableView = { count: number; colors?: LightColor[]; light?: LightColor; cut?: number | null; solved: boolean };
type SliderView = { lights?: LightColor[]; braille?: number[]; current: boolean[]; solved: boolean };
type DirectionView = { light?: LightColor; braille?: number; pressed?: Direction | null; solved: boolean };
type CalculatorView = { expression?: string; entered?: string; enteredLength?: number; stage: "entry" | "confirm"; light?: LightColor | null; pressed?: number | null; solved: boolean };
type PianoView = { modeLight?: LightColor; melody?: LightColor[]; pressedCount?: number; solved: boolean };
// DEAF gets seed, button colors and the beep; BLIND gets the pointer and the button count.
// BLIND gets the Braille numbers and which button beeped; DEAF gets the colors.
type SoundboardView = { colors?: LightColor[]; braille?: number[]; beep?: number | null; pressed: number[]; solved: boolean };
type SymbolView = { seed?: 1 | 2 | 3 | 4; pointer: number; buttons?: LightColor[]; buttonCount?: number; pressed: number | null; solved: boolean; beep?: boolean };
type ChatMessageView = { id: string; senderRole: Role; senderName: string; text: string; sentAt: number; seq?: number };
type PublicGameView = {
  serial: string | null;
  level: number;
  levelTitle: string;
  activeModules: ModuleKey[];
  phase: "waiting" | "playing";
  lastResult: "new" | "cleared" | "timeout" | "strikes";
  startAt: number | null;
  durationMs: number;
  mistakes: number;
  maxMistakes: number;
  actionLog: Array<ActionLogEntry | string>;
  completed: number;
  moduleCount: number;
  chatEnabled: boolean;
  tutorialEnabled: boolean;
  lastSignalAt: number | null;
  lastActionAt: number | null;
  messages: ChatMessageView[];
  modules: { cable: CableView; slider: SliderView; direction: DirectionView; calculator: CalculatorView; piano: PianoView; symbol: SymbolView; soundboard: SoundboardView };
  operatorCursor?: CursorPoint;
  muteSignal?: MuteSignal;
};
type RoomSnapshot = {
  room: {
    code: string;
    status: "lobby" | "playing" | "defused" | "exploded";
    version: number;
    isHost: boolean;
    startLevel: number;
    readyCount: number;
    players: Player[];
    game: PublicGameView;
  };
  player: { id: string; name: string; role: Role };
};
// x/y: position within the whole suitcase. anchor/ax/ay: the control under the
// pointer and the position inside it, so DEAF's screen can draw the cursor on
// the same control even though the two screens lay the suitcase out differently.
type CursorPoint = { x: number; y: number; active: boolean; anchor?: string; ax?: number; ay?: number };
type MuteSignal = { symbol: string; updatedAt: number; active: boolean };

const ROLE_ICONS = { operator: Hand, observer: Eye, specialist: BookOpen };
const LIGHT_COLORS: LightColor[] = ["RED", "YELLOW", "GREEN", "BLUE"];
const WIRE_COLORS: Record<LightColor, string> = {
  RED: "#f2534f",
  YELLOW: "#f7cf45",
  GREEN: "#35df64",
  BLUE: "#3185fc",
};
const MODULE_META: Record<ModuleKey, { label: string; icon: typeof Scissors }> = {
  cable: { label: "CABLE", icon: Scissors },
  slider: { label: "COLOR SLIDER", icon: SlidersVertical },
  direction: { label: "DIRECTION", icon: ArrowUp },
  calculator: { label: "CALCULATOR", icon: Calculator },
  piano: { label: "PIANO", icon: Piano },
  symbol: { label: "SYMBOL DIAL", icon: Compass },
  soundboard: { label: "SOUNDBOARD", icon: Grid3x3 },
};
const levelName = (level: number) => (level === INFINITE_LEVEL ? "∞" : String(level));
const tierName = (pool: ModuleKey[]) => (pool === EASY_MODULES ? " EASY" : pool === MEDIUM_MODULES ? " MEDIUM" : "");
const BRAILLE: Record<number, number[]> = {
  0: [2, 4, 5],
  1: [1],
  2: [1, 2],
  3: [1, 4],
  4: [1, 4, 5],
  5: [1, 5],
  6: [1, 2, 4],
  7: [1, 2, 4, 5],
  8: [1, 2, 5],
  9: [2, 4],
};

// Storage key kept from the game's old name so saved sessions survive the rename.
const SESSION_KEY = "bombanana-session";

// Sends a request to the room host (see lib/room-client.ts) and resolves with
// this player's updated view of the room.
async function requestRoom(payload: Record<string, unknown>) {
  return (await roomRequest(payload)) as unknown as RoomSnapshot;
}

// Adds the Blind cursor and the Mute sign, which travel outside the room views
// because they change many times a second.
function withLiveFeed(data: RoomSnapshot, live: LiveFeed, now: number): RoomSnapshot {
  const { cursor, signal } = live;
  return {
    ...data,
    room: {
      ...data.room,
      game: {
        ...data.room.game,
        operatorCursor: cursor ? { x: cursor.x, y: cursor.y, anchor: cursor.anchor, ax: cursor.ax, ay: cursor.ay, active: now > 0 && cursor.active && now - cursor.at < 2_000 } : { x: 0.5, y: 0.5, active: false },
        muteSignal: signal ? { symbol: signal.symbol, updatedAt: signal.at, active: now > 0 && Boolean(signal.symbol) && now - signal.at < 6_000 } : { symbol: "", updatedAt: 0, active: false },
      },
    },
  };
}

function formatTime(ms: number) {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

const TUTORIAL_PAGES = ["THE BOMB", "THE SQUAD", "THE RELAY", "EASY MODULES", "MEDIUM MODULES", "THE ROUND"];

function TutorialSpread({ page }: { page: number }) {
  if (page === 0) return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>BOMB</h3><div className="tutorial-case"><Bomb /><div><span>2:30</span><i>× × ×</i></div></div><p>Every suitcase combines one or more modules with the same shared clock.</p></section><section className="tutorial-page"><h3>READ THE DISPLAY</h3><div className="tutorial-callout"><Clock3 /><div><b>TIME</b><span>The timer appears on all three screens. Finish every active module before it reaches zero.</span></div></div><div className="tutorial-callout danger"><TriangleAlert /><div><b>STRIKES</b><span>A wrong answer adds a strike. Three strikes or no time left sends the same level back to the ready room.</span></div></div></section></div>;

  if (page === 1) return <div className="tutorial-spread"><section className="tutorial-page"><h3>THREE MONKEYS</h3><div className="tutorial-role-stack">{ROLES.map((role) => <div key={role}><span>{ROLE_META[role].monkey}</span><p><b>{ROLE_META[role].short}</b><small>{ROLE_META[role].name}</small></p></div>)}</div><p>Each player receives different information. Nobody can solve the suitcase alone.</p></section><section className="tutorial-page"><h3>WHO KNOWS WHAT?</h3><div className="tutorial-role-facts"><div><span>🙈</span><p><b>BLIND</b><small>Touches every control and reads Braille patterns, but sees no colors or screen details.</small></p></div><div><span>🙉</span><p><b>DEAF</b><small>Sees colors, displays, the Blind player&apos;s cursor, and the Mute player&apos;s signs—but never gets the manual.</small></p></div><div><span>🙊</span><p><b>MUTE</b><small>Reads the full rulebook and sends numbers or expressions, but never sees the bomb.</small></p></div></div></section></div>;

  if (page === 2) return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>PASS THE CLUES</h3><div className="tutorial-relay"><div><span>🙉</span><b>DEAF</b></div><ArrowRight /><div><span>🙊</span><b>MUTE</b></div><ArrowRight /><div><span>🙈</span><b>BLIND</b></div></div><p>The answer only appears after the team combines the visible clue, the Braille clue, and the manual rule.</p><div className="tutorial-text-rule"><MessageCircle /><span><b>OPTIONAL TEXT CHAT</b> BLIND and DEAF may type. MUTE reads only and uses signals.</span></div></section><section className="tutorial-page"><h3>SIGNAL LOOP</h3><ol className="tutorial-steps"><li><b>1</b><span>DEAF reports the light colors, cable colors, or display.</span></li><li><b>2</b><span>BLIND reports cable count or Braille patterns.</span></li><li><b>3</b><span>MUTE checks the manual and sends a number or signal.</span></li><li><b>4</b><span>DEAF confirms the signal and guides BLIND to the correct control.</span></li></ol><div className="tutorial-chat-demo"><MessageCircle /><span>0–10</span><span>👍 👎 🔁 👆 👇 👈 👉</span></div><p className="tutorial-privacy-note">DEAF sees only their own typed messages. BLIND and MUTE can read messages from DEAF.</p></section></div>;

  if (page === 3) return <div className="tutorial-spread"><section className="tutorial-page"><h3>EASY MODULES I</h3><div className="tutorial-module"><Scissors /><div><b>CABLE</b><span>Combine the light, cable colors, and cable count. MUTE identifies one color; BLIND cuts that cable.</span></div></div><div className="tutorial-module"><SlidersVertical /><div><b>COLOR SLIDER</b><span>Combine the four-light order with all four Braille values. Set every switch up or down, then press ENTER.</span></div></div></section><section className="tutorial-page"><h3>EASY MODULES II</h3><div className="tutorial-module"><ArrowUp /><div><b>DIRECTION</b><span>Combine one light with one Braille pattern. MUTE returns up, down, left, or right.</span></div></div><div className="tutorial-module"><Calculator /><div><b>CALCULATOR</b><span>Enter the equation result first. Then combine its odd/even result with the new light and press one final Braille key.</span></div></div></section></div>;

  if (page === 4) return <div className="tutorial-spread"><section className="tutorial-page"><h3>MEDIUM MODULES</h3><div className="tutorial-module"><Compass /><div><b>SYMBOL DIAL</b><span>BLIND turns the pointer until BEEP! pops up on BLIND&apos;s screen. DEAF reads the seed light, the symbol and the button colors. MUTE names the button.</span></div></div><div className="tutorial-module"><Piano /><div><b>PIANO</b><span>DEAF reads the mode light and four melody lights. MUTE turns each color into a key. BLIND plays the four keys in order.</span></div></div><div className="tutorial-module"><Grid3x3 /><div><b>SOUNDBOARD</b><span>BLIND presses buttons until one beeps on BLIND&apos;s screen. Its Braille number and its color give MUTE the positions to press.</span></div></div></section><section className="tutorial-page"><h3>LEVELS 8 TO 15</h3><div className="tutorial-callout"><Grid3x3 /><div><b>MEDIUM LEVELS</b><span>Levels 8 to 10 add the dial and the piano. From 11 the soundboard joins, then medium and easy mixes. Four minutes each.</span></div></div><div className="tutorial-callout"><Shuffle /><div><b>INFINITE MODE</b><span>After Level 15 every suitcase picks four modules from all seven.</span></div></div><div className="tutorial-callout danger"><TriangleAlert /><div><b>WRONG PRESS</b><span>A wrong piano key or soundboard button is a strike and starts that module&apos;s presses over.</span></div></div></section></div>;

  return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>READY ROOM</h3><div className="tutorial-ready-demo"><div><span>🙈</span><b>READY</b></div><div><span>🙉</span><b>READY</b></div><div><span>🙊</span><b>READY</b></div></div><p>The timer begins only after all three players ready up.</p></section><section className="tutorial-page"><h3>ROUND LOOP</h3><ol className="tutorial-steps"><li><b>1</b><span>Review the next level and swap roles if the squad wants to.</span></li><li><b>2</b><span>All three players press READY. A short countdown arms the suitcase.</span></li><li><b>3</b><span>Solve every listed module before time or strikes run out.</span></li><li><b>4</b><span>A cleared level advances. A failed level must be replayed.</span></li></ol><div className="tutorial-win-strip"><TimerReset /><b>LEVELS 1 → 15 · ∞</b><Banana /></div></section></div>;
}

function TutorialButton({ className = "", label = "How to play" }: { className?: string; label?: string }) {
  const [page, setPage] = useState(0);
  return <Dialog onOpenChange={(open) => { if (!open) setPage(0); }}><DialogTrigger asChild><Button type="button" variant="outline" className={className}><CircleHelp />{label}</Button></DialogTrigger><DialogContent className="tutorial-dialog" showCloseButton={false}><div className="tutorial-topline"><div><DialogTitle>SNIP NO EVIL FIELD GUIDE</DialogTitle><DialogDescription>{TUTORIAL_PAGES[page]} · PAGE {page + 1} OF {TUTORIAL_PAGES.length}</DialogDescription></div><DialogClose asChild><button type="button" aria-label="Close tutorial"><X /></button></DialogClose></div><TutorialSpread page={page} /><footer className="tutorial-footer"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}><ChevronLeft /> BACK</button><div aria-label={`Tutorial page ${page + 1} of ${TUTORIAL_PAGES.length}`}>{TUTORIAL_PAGES.map((title, index) => <button type="button" key={title} onClick={() => setPage(index)} data-active={index === page} aria-label={`Open ${title.toLowerCase()} page`} />)}</div>{page < TUTORIAL_PAGES.length - 1 ? <button type="button" onClick={() => setPage((current) => Math.min(TUTORIAL_PAGES.length - 1, current + 1))}>NEXT <ChevronRight /></button> : <DialogClose asChild><button type="button">DONE <Check /></button></DialogClose>}</footer></DialogContent></Dialog>;
}

// Closed scissors pointing right: two ring handles and a long blade. The two
// halves snip open and shut when the page loads and when the title is hovered.
function SnipMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`snip-mark ${className}`} viewBox="0 0 124 72" aria-hidden="true">
      <g className="snip-half snip-half-top">
        <path d="M34 22 L118 35 L46 40 Z" fill="#e8eef4" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="20" cy="17" rx="15" ry="11" fill="none" stroke="currentColor" strokeWidth="10" />
        <ellipse className="snip-grip" cx="20" cy="17" rx="15" ry="11" fill="none" strokeWidth="5" />
      </g>
      <g className="snip-half snip-half-bottom">
        <path d="M34 50 L118 35 L46 32 Z" fill="#cfd9e3" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="20" cy="55" rx="15" ry="11" fill="none" stroke="currentColor" strokeWidth="10" />
        <ellipse className="snip-grip" cx="20" cy="55" rx="15" ry="11" fill="none" strokeWidth="5" />
      </g>
      <circle cx="46" cy="36" r="4" fill="currentColor" />
    </svg>
  );
}

// Hand-drawn red strike-through, two crossing lines like a scribbled-out word.
function Scribble() {
  return <svg className="scribble" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M-3 31 Q 45 21 104 9" /><path d="M-2 8 Q 46 15 103 30" /></svg>;
}

function StartScreen({ onEnter, onTest, notice }: { onEnter: (connection: RoomConnection, data: RoomSnapshot) => void; onTest: () => void; notice?: string }) {
  const [mode, setMode] = useState("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [chatEnabled, setChatEnabled] = useState(false);
  const [tutorialEnabled, setTutorialEnabled] = useState(false);
  const [startLevelText, setStartLevelText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startLevel = startLevelText.trim() === "" ? 1 : Number(startLevelText);

  async function submit(event?: ReactFormEvent) {
    event?.preventDefault();
    setError("");
    if (!name.trim()) return setError("Type your name first.");
    if (mode === "join" && code.replace(/\W/g, "").length !== 5) return setError("Enter the five-character room code.");
    if (mode === "create" && (!Number.isInteger(startLevel) || startLevel < 1 || startLevel > INFINITE_LEVEL)) return setError(`Start level must be a whole number from 1 to ${INFINITE_LEVEL}.`);
    setBusy(true);
    try {
      // No role is picked here: the room hands out the first open seat and
      // players can switch seats in the lobby.
      const entered = mode === "join"
        ? await joinRoom({ code, name })
        : await createRoom({ name, chatEnabled, tutorialEnabled, startLevel });
      const data = entered.snapshot as unknown as RoomSnapshot;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: data.room.code })); } catch { /* Private windows may block storage; the game still works. */ }
      onEnter(entered.connection, data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enter the room.");
    } finally {
      setBusy(false);
    }
  }

  const nameRow = <><label className="home-label" htmlFor="player-name">Name:</label><Input id="player-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 20))} placeholder="Your name" className="game-input home-input" autoComplete="nickname" /></>;
  const feedback = notice ? <p className="room-notice" role="status">{notice}</p> : null;
  const play = <>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy} className="home-play">{busy ? (mode === "create" ? "Opening…" : "Joining…") : "Play"}</Button></>;

  return (
    <main className="home-shell">
      <header className="home-title">
        <p className="home-senses" aria-label="See no evil, hear no evil, speak no evil."><span aria-hidden="true">SEE<Scribble /></span><span aria-hidden="true">HEAR<Scribble /></span><span aria-hidden="true">SPEAK<Scribble /></span></p>
        <h1 aria-label="Snip No Evil"><span aria-hidden="true">SNIP</span> <span aria-hidden="true">NO</span> <span aria-hidden="true">EVIL</span><SnipMark className="home-scissors" /></h1>
      </header>
      <Tabs value={mode} onValueChange={(next) => { setMode(next); setError(""); }} className="home-card">
        <TabsList className="home-tabs"><TabsTrigger value="join">Join game</TabsTrigger><TabsTrigger value="create">Create game</TabsTrigger></TabsList>
        <TabsContent value="join" className="home-panel">
          <form onSubmit={submit} noValidate>
            {feedback}
            <div className="home-fields">{nameRow}<label className="home-label" htmlFor="room-code">Room:</label><Input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder="ABC12" className="game-input home-input code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} /></div>
            {play}
          </form>
        </TabsContent>
        <TabsContent value="create" className="home-panel">
          <form onSubmit={submit} noValidate>
            {feedback}
            <div className="home-fields">{nameRow}</div>
            <div className="room-option-stack"><label className="chat-mode-toggle"><span><b>OPTIONAL TEXT CHAT</b><small>{chatEnabled ? "BLIND and DEAF can type during the game." : "Role signals stay limited to the existing tools."}</small></span><Switch checked={chatEnabled} onCheckedChange={setChatEnabled} aria-label="Enable text chat" /></label><label className="chat-mode-toggle tutorial-mode-toggle"><span><b>LEVEL 0 · PRACTICE ROUND</b><small>{tutorialEnabled ? `One untimed cable round to learn the relay, then Level ${startLevel || 1}.` : `Skip practice and start at Level ${startLevel || 1}.`}</small></span><Switch checked={tutorialEnabled} onCheckedChange={setTutorialEnabled} aria-label="Level 0 practice round before Level 1" /></label><label className="chat-mode-toggle start-level-field" htmlFor="start-level"><span><b>START AT LEVEL</b><small>Optional. 1 to {LAST_CAMPAIGN_LEVEL}, or {INFINITE_LEVEL} for infinite mode. Blank means Level 1.</small></span><Input id="start-level" type="number" inputMode="numeric" min={1} max={INFINITE_LEVEL} step={1} value={startLevelText} onChange={(event) => setStartLevelText(event.target.value.slice(0, 2))} placeholder="1" className="game-input start-level-input" aria-label="Start at level" /></label></div>
            {play}
            <p className="home-hint">You&apos;ll get a room code to send to your two friends.</p>
          </form>
        </TabsContent>
      </Tabs>
      <div className="entry-links home-links"><TutorialButton className="rules-link" label="Rules" /><button type="button" className="text-link" onClick={onTest}><Wrench /> Try it alone</button></div>
      <footer className="home-footer"><span>Three players, three devices, one voice call.</span><span>Unofficial browser tribute. Not affiliated with Lefto Studio or TARK.</span></footer>
    </main>
  );
}

function LobbySeat({ player, role, you, busy, onPick }: { player?: Player; role: Role; you: boolean; busy: boolean; onPick: () => void }) {
  const meta = ROLE_META[role];
  const label = you ? `You are the ${meta.name}` : player ? `Swap seats with ${player.name}` : `Move to the ${meta.name} seat`;
  return <button type="button" className={player ? "seat-card" : "seat-card empty-seat"} data-you={you} disabled={busy || you} onClick={onPick} aria-label={label}>
    <span className="seat-monkey" aria-hidden="true">{meta.monkey}</span>
    <div><small>{meta.short}<span className="seat-role-name"> · {meta.name}</span></small><b>{player && <span className={player.online ? "presence online" : "presence"} aria-label={player.online ? "online" : "away"} />}{player?.name ?? "OPEN SEAT"}</b><i>{you ? "That's you" : player ? "Tap to swap seats" : "Tap to sit here"}</i></div>
    <div className="seat-state">{you ? <em className="seat-you">YOU</em> : player ? <em className="seat-swap"><ArrowLeftRight aria-hidden="true" /> SWAP</em> : <em className="seat-swap seat-sit">SIT</em>}</div>
  </button>;
}

const DEMO_STEPS: Array<{ who: Role; title: string; says: string; sign?: string }> = [
  { who: "observer", title: "DEAF LOOKS", says: "Red light. Three cables: blue, red, green." },
  { who: "specialist", title: "MUTE LOOKS IT UP", says: "3 cables + red light = blue. Blue is first, so…", sign: "1" },
  { who: "observer", title: "DEAF PASSES IT ON", says: "MUTE says 1. Cut the top cable!" },
  { who: "operator", title: "BLIND CUTS", says: "Top cable… snip. Defused!" },
];

function DemoBomb({ colored, cut }: { colored: boolean; cut: boolean }) {
  return <div className="demo-bomb" data-colored={colored} data-cut={cut}><i className="demo-light" /><span data-wire="BLUE" data-cut={cut} /><span data-wire="RED" /><span data-wire="GREEN" />{cut && <b>DEFUSED</b>}</div>;
}

function DemoManual() {
  return <div className="demo-manual"><div className="demo-manual-head"><i /><Light color="RED" /><Light color="YELLOW" /><Light color="GREEN" /><Light color="BLUE" /></div><div className="demo-manual-row" data-hit="true"><CableCountDiagram count={3} /><span data-hit="true"><ManualWire color="BLUE" /></span><span><ManualWire color="RED" /></span><span><ManualWire color="YELLOW" /></span><span><ManualWire color="GREEN" /></span></div><div className="demo-manual-row"><CableCountDiagram count={4} /><span><ManualWire color="GREEN" /></span><span><ManualWire color="BLUE" /></span><span><ManualWire color="RED" /></span><span><ManualWire color="YELLOW" /></span></div></div>;
}

// A looping four-panel strip of one round, shown while the lobby waits.
function RelayDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % DEMO_STEPS.length), 3_400);
    return () => window.clearInterval(timer);
  }, []);
  const current = DEMO_STEPS[step];
  return <section className="relay-demo" aria-label="How one round works"><header><b>HOW ONE ROUND WORKS</b><span>Nothing to read. Just watch.</span></header><div className="relay-demo-stage" data-step={step}><div className="relay-demo-visual">{step === 1 ? <DemoManual /> : <DemoBomb colored={step !== 3} cut={step === 3} />}</div><div className="relay-demo-actor" data-role={current.who}><span aria-hidden="true">{ROLE_META[current.who].monkey}</span><b>{ROLE_META[current.who].short}</b></div><div className="relay-demo-bubble" key={step} data-kind={current.sign ? "sign" : "speech"}><p>{current.says}</p>{current.sign && <strong aria-label={`Sign ${current.sign}`}>{current.sign}</strong>}</div></div><ol className="relay-demo-steps">{DEMO_STEPS.map((item, index) => <li key={item.title} data-active={index === step} data-done={index < step}><span aria-hidden="true">{ROLE_META[item.who].monkey}</span>{item.title}</li>)}</ol></section>;
}

function SetupChecklist() {
  return <section className="setup-checklist" aria-label="Before you start"><b>BEFORE YOU START</b><ul><li><Mic aria-hidden="true" /><span>Get all three of you on a voice call.</span></li><li><EarOff aria-hidden="true" /><span><strong>DEAF</strong> turns their sound off and reads the screen instead.</span></li><li><MicOff aria-hidden="true" /><span><strong>MUTE</strong> mutes their mic and talks only with signs.</span></li></ul></section>;
}

function Lobby({ data, onData, onTest, onLeave, banner }: { data: RoomSnapshot; onData: (data: RoomSnapshot) => void; onTest: () => void; onLeave: () => void; banner?: string }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slots = ROLES.map((role) => data.room.players.find((player) => player.role === role));
  const full = data.room.players.length === 3;
  const missing = 3 - data.room.players.length;

  async function pickSeat(targetRole: Role) {
    setBusy(true); setError("");
    try { onData(await requestRoom({ action: "switch-role", targetRole })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch seats."); }
    finally { setBusy(false); }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* Clipboard access can be denied; the code stays visible. */ }
  }
  async function start() {
    setBusy(true);
    try { onData(await requestRoom({ action: "start" })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the campaign."); }
    finally { setBusy(false); }
  }
  return (
    <main className="lobby-shell"><div className="lobby-card">
      <div className="lobby-topline"><Radio /> ROOM OPEN <span>{full ? "SQUAD COMPLETE" : `WAITING FOR ${missing} MORE`}</span></div>
      <div className="room-code-block"><small>ROOM CODE · SEND IT TO YOUR TWO FRIENDS</small><button onClick={copyCode} aria-label="Copy room code">{data.room.code} {copied ? <Check /> : <Copy />}</button><em>{copied ? "Copied!" : "They open the site, type their name and this code, and press Play."}</em></div>
      <p className="seat-note"><ArrowLeftRight aria-hidden="true" /> Seats are handed out as people join. Tap another seat to move there or swap.</p>
      <div className="seat-grid">{slots.map((player, index) => <LobbySeat player={player} role={ROLES[index]} you={player?.role === data.player.role} busy={busy} onPick={() => pickSeat(ROLES[index])} key={ROLES[index]} />)}</div>
      <RelayDemo />
      <SetupChecklist />
      <div className="lobby-option-grid"><div className="lobby-chat-status" data-enabled={data.room.game.chatEnabled}><MessageCircle /><b>TEXT CHAT {data.room.game.chatEnabled ? "ON" : "OFF"}</b><span>{data.room.game.chatEnabled ? "BLIND + DEAF can type" : "Voice only"}</span></div><div className="lobby-chat-status tutorial-lobby-status" data-enabled={data.room.game.tutorialEnabled}><CircleHelp /><b>LEVEL 0 {data.room.game.tutorialEnabled ? "ON" : "OFF"}</b><span>{data.room.game.tutorialEnabled ? "Practice round first" : `Straight to Level ${data.room.startLevel}`}</span></div>{data.room.startLevel > 1 && <div className="lobby-chat-status start-level-status" data-enabled="true"><Play /><b>START AT LEVEL {levelName(data.room.startLevel)}</b><span>{levelDefinition(data.room.startLevel).title}</span></div>}</div>
      {banner && <p className="room-notice" role="status">{banner}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {data.room.isHost ? <Button className="launch-button" disabled={!full || busy} onClick={start}><Play /> {busy ? "Staging…" : full ? data.room.game.tutorialEnabled ? "Start Level 0 practice" : `Open Level ${levelName(data.room.startLevel)} ready room` : `Waiting for ${missing} more player${missing === 1 ? "" : "s"}`}</Button> : <div className="waiting-bar"><span /> {full ? "The host starts the game." : "The host starts once every seat is filled."}</div>}
      <div className="entry-links lobby-links"><TutorialButton className="rules-link" label="Rules" /><button type="button" className="text-link" onClick={onTest}><Wrench /> Test alone</button><button type="button" className="text-link" onClick={onLeave}><LogOut /> Leave room</button></div>
    </div></main>
  );
}

function Light({ color, hidden = false }: { color?: LightColor | null; hidden?: boolean }) {
  return <i className="module-light" data-color={hidden || !color ? "hidden" : color.toLowerCase()} aria-label={hidden || !color ? "Hidden light" : `${color.toLowerCase()} light`} />;
}

function BrailleCell({ value, hidden = false, compact = false }: { value: number; hidden?: boolean; compact?: boolean }) {
  const active = new Set(BRAILLE[value] ?? []);
  const cell = (
    <span className="braille-cell" data-hidden={hidden} data-compact={compact} aria-label={hidden ? "Hidden Braille value" : `Number ${value}`} title={hidden ? undefined : `Number ${value}`}>
      {Array.from({ length: 6 }, (_, index) => <i key={index} data-raised={!hidden && active.has(index + 1)} />)}
    </span>
  );
  if (hidden) return cell;
  return <TooltipProvider delayDuration={60}><Tooltip><TooltipTrigger asChild>{cell}</TooltipTrigger><TooltipContent className="braille-number-tooltip" side="top" sideOffset={7}><b>{value}</b></TooltipContent></Tooltip></TooltipProvider>;
}

function DirectionGlyph({ direction }: { direction: Direction }) {
  const Icon = direction === "UP" ? ArrowUp : direction === "DOWN" ? ArrowDown : direction === "LEFT" ? ArrowLeft : ArrowRight;
  return <Icon aria-hidden="true" />;
}

function CableModule({ module, vision, act, busy }: { module: CableView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  const count = module.colors?.length ?? module.count;
  return (
    <section className="case-bay cable-module" data-anchor="cable" data-solved={module.solved} aria-label="Cable module">
      <header><Scissors /><Light color={module.light} hidden={vision === "blind"} /></header>
      <div className="case-wires">
        {Array.from({ length: count }, (_, index) => {
          const color = module.colors?.[index] as LightColor | undefined;
          return <button key={index} data-anchor={`cable-wire-${index}`} onClick={() => act?.("cut-cable", index)} disabled={!act || busy || module.solved} data-cut={module.cut === index} aria-label={`Cut cable ${index + 1}`}><i style={vision === "color" && color ? { background: WIRE_COLORS[color] } : undefined} /></button>;
        })}
      </div>
    </section>
  );
}

function SliderModule({ module, vision, act, busy }: { module: SliderView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  return (
    <section className="case-bay slider-module" data-anchor="slider" data-solved={module.solved} aria-label="Color slider module">
      <div className="slider-bank">
        {module.current.map((up: boolean, index: number) => (
          <div className="slider-column" key={index} data-anchor={`slider-column-${index}`}>
            <Light color={module.lights?.[index]} hidden={vision === "blind"} />
            <button className={up ? "up" : ""} data-anchor={`slider-switch-${index}`} onClick={() => act?.("toggle-slider", index)} disabled={!act || busy || module.solved} aria-label={`Move slider ${index + 1} ${up ? "down" : "up"}`}><span><i /></span></button>
            <BrailleCell value={module.braille?.[index] ?? 0} hidden={vision === "color"} compact />
          </div>
        ))}
      </div>
      <button className="module-enter" data-anchor="slider-enter" onClick={() => act?.("check-slider")} disabled={!act || busy || module.solved}>ENTER</button>
    </section>
  );
}

function DirectionModule({ module, vision, act, busy }: { module: DirectionView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  const buttons: Direction[] = ["UP", "LEFT", "RIGHT", "DOWN"];
  return (
    <section className="case-bay direction-module" data-anchor="direction" data-solved={module.solved} aria-label="Direction module">
      <Light color={module.light} hidden={vision === "blind"} />
      <div className="direction-pad">
        {buttons.map((direction) => <button key={direction} data-anchor={`direction-${direction.toLowerCase()}`} data-direction={direction.toLowerCase()} onClick={() => act?.("press-direction", direction)} disabled={!act || busy || module.solved} aria-label={`Press ${direction.toLowerCase()}`}><DirectionGlyph direction={direction} /></button>)}
        <div className="direction-center" data-anchor="direction-center"><BrailleCell value={module.braille ?? 0} hidden={vision === "color"} /></div>
      </div>
    </section>
  );
}

function CalculatorModule({ module, vision, act, busy }: { module: CalculatorView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  const display = vision === "color"
    ? module.stage === "entry" ? `${module.expression} = ${module.entered || "_"}` : `${module.entered} ✓`
    : module.stage === "entry" ? "•".repeat(module.enteredLength ?? 0) || "••" : "•• ✓";
  return (
    <section className="case-bay calculator-module" data-anchor="calculator" data-solved={module.solved} aria-label="Calculator module">
      <div className="calculator-display" data-anchor="calculator-display"><span>{display}</span><Light color={module.light} hidden={vision === "blind" || module.stage !== "confirm"} /></div>
      <div className="calculator-keypad">
        {digits.map((digit) => <button key={digit} data-anchor={`calculator-key-${digit}`} onClick={() => act?.("calculator-key", digit)} disabled={!act || busy || module.solved} data-confirmed={module.pressed === digit} aria-label={`Calculator key ${digit}`}><BrailleCell value={digit} hidden={vision === "color"} compact /></button>)}
        <button className="calc-clear" data-anchor="calculator-clear" onClick={() => act?.("calculator-clear")} disabled={!act || busy || module.solved || module.stage !== "entry"} aria-label="Clear calculator">C</button>
        <button className="calc-enter" data-anchor="calculator-enter" onClick={() => act?.("calculator-enter")} disabled={!act || busy || module.solved || module.stage !== "entry"} aria-label="Submit calculator result"><CornerDownLeft /></button>
      </div>
    </section>
  );
}

function PianoModule({ module, vision, act, busy }: { module: PianoView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  const pressedCount = module.pressedCount ?? 0;
  return (
    <section className="case-bay piano-module" data-anchor="piano" data-solved={module.solved} aria-label="Piano module">
      <header className="piano-display" data-anchor="piano-display">
        <div className="piano-mode-light"><Piano /><Light color={module.modeLight} hidden={vision === "blind"} /></div>
        <div className="piano-melody" aria-label="Four note color melody">
          {Array.from({ length: 4 }, (_, index) => <Light key={index} color={module.melody?.[index]} hidden={vision === "blind"} />)}
        </div>
        <div className="piano-progress" aria-label={`${pressedCount} of 4 notes entered`}>{Array.from({ length: 4 }, (_, index) => <i key={index} data-entered={index < pressedCount} />)}</div>
      </header>
      <div className="piano-keyboard">
        <div className="piano-white-keys">
          {Array.from({ length: 8 }, (_, index) => {
            const key = index + 1;
            return <button type="button" key={key} data-anchor={`piano-key-${key}`} onClick={() => act?.("piano-key", key)} disabled={!act || busy || module.solved} aria-label={`Piano key ${key}`}><BrailleCell value={key} hidden={vision === "color"} compact /></button>;
          })}
        </div>
        <div className="piano-black-keys" aria-hidden="true">{[1, 2, 4, 5, 6].map((position) => <i key={position} style={{ left: `${position * 12.5}%` }} />)}</div>
      </div>
    </section>
  );
}

function SymbolGlyph({ symbol }: { symbol: SymbolKey }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (symbol === "PHI") return <svg {...common}><ellipse cx="12" cy="12" rx="7.5" ry="5.5" /><path d="M12 3v18" /></svg>;
  if (symbol === "STAR") return <svg {...common}><polygon points="12 2.5 14.9 9 22 9.6 16.6 14.4 18.2 21.5 12 17.8 5.8 21.5 7.4 14.4 2 9.6 9.1 9" /></svg>;
  if (symbol === "HOURGLASS") return <svg {...common}><path d="M6 3h12M6 21h12M7.5 3c0 5 4.5 6.5 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6.5-4.5 9s4.5 4 4.5 9" /></svg>;
  return <svg {...common}><path d="M12 4.5l7.5 11.5h-15z" /><path d="M3 21h18" /></svg>;
}

// Symbol dial: four seed lamps, a dial with four symbols and a pointer BLIND
// turns from the center, three big buttons. The BEEP! bubble is BLIND-only.
function SymbolModule({ module, vision, act, busy }: { module: SymbolView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  const buttonCount = module.buttons?.length ?? module.buttonCount ?? 3;
  // Keep turning clockwise even when the pointer wraps from the last symbol to the first.
  const [turns, setTurns] = useState(module.pointer);
  const lastPointer = useRef(module.pointer);
  useEffect(() => {
    const delta = (module.pointer - lastPointer.current + SYMBOLS.length) % SYMBOLS.length;
    lastPointer.current = module.pointer;
    if (delta) setTurns((current) => current + delta);
  }, [module.pointer]);
  const current = SYMBOLS[module.pointer] ?? SYMBOLS[0];
  return (
    <section className="case-bay symbol-module" data-anchor="symbol" data-solved={module.solved} data-beep={Boolean(module.beep)} aria-label="Symbol dial module">
      <div className="symbol-seeds" data-anchor="symbol-seeds" aria-label={vision === "color" && module.seed ? `Seed light ${module.seed} of 4 is lit` : "Four seed lights"}>
        {[1, 2, 3, 4].map((seed) => <i key={seed} data-lit={vision === "color" && module.seed === seed} aria-hidden="true" />)}
      </div>
      <div className="symbol-dial-well"><div className="symbol-dial" data-anchor="symbol-dial" aria-label={`Pointer on the ${SYMBOL_NAMES[current]} symbol`}>
        {SYMBOLS.map((symbol, index) => <span key={symbol} className="symbol-glyph" data-position={index} data-current={index === module.pointer} aria-label={`${SYMBOL_NAMES[symbol]} symbol`}><SymbolGlyph symbol={symbol} /></span>)}
        <i className="symbol-pointer" style={{ transform: `rotate(${turns * 90}deg)` }} aria-hidden="true" />
        <button type="button" className="symbol-rotate" data-anchor="symbol-rotate" onClick={() => act?.("symbol-rotate")} disabled={!act || busy || module.solved} aria-label="Turn the pointer to the next symbol"><RotateCw /></button>
      </div>{module.beep && <span className="symbol-beep" role="status" aria-live="polite"><b>BEEP!</b></span>}</div>
      <div className="symbol-buttons" data-anchor="symbol-buttons" aria-label={`${buttonCount} buttons`}>
        {Array.from({ length: buttonCount }, (_, index) => {
          const color = module.buttons?.[index];
          return <button type="button" key={index} data-anchor={`symbol-button-${index + 1}`} data-color={vision === "color" && color ? color.toLowerCase() : "hidden"} data-pressed={module.pressed === index} onClick={() => act?.("symbol-press", index)} disabled={!act || busy || module.solved} aria-label={vision === "color" && color ? `${color.toLowerCase()} button ${index + 1}` : `Button ${index + 1}`} />;
        })}
      </div>
    </section>
  );
}

// Soundboard: two latches and a 3 by 3 board. BLIND reads each button's
// Braille number and sees BEEP! on the one that beeps; DEAF sees the colors.
function SoundboardModule({ module, vision, act, busy }: { module: SoundboardView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy: boolean }) {
  const pressed = new Set(module.pressed ?? []);
  return (
    <section className="case-bay soundboard-module" data-anchor="soundboard" data-solved={module.solved} aria-label="Soundboard module">
      <div className="soundboard-latches" aria-hidden="true"><i /><i /></div>
      <div className="soundboard-board" data-anchor="soundboard-board">
        {Array.from({ length: 9 }, (_, index) => {
          const color = module.colors?.[index];
          const beeping = module.beep === index;
          const label = `Soundboard button ${index + 1}${vision === "color" && color ? `, ${color.toLowerCase()}` : ""}${beeping ? ", beeping" : ""}`;
          return <button type="button" key={index} data-anchor={`soundboard-button-${index + 1}`} data-color={vision === "color" && color ? color.toLowerCase() : "hidden"} data-pressed={pressed.has(index)} data-beep={beeping} onClick={() => act?.("soundboard-press", index)} disabled={!act || busy || module.solved} aria-label={label}>
            <BrailleCell value={module.braille?.[index] ?? 0} hidden={vision === "color"} compact />
            {beeping && <span className="soundboard-beep" role="status" aria-live="polite"><b>BEEP!</b></span>}
          </button>;
        })}
      </div>
    </section>
  );
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));

function findAnchor(container: HTMLElement, anchor: string) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-anchor]")).find((element) => element.dataset.anchor === anchor) ?? null;
}

function SuitcaseBomb({ game, vision, act, busy = false, cursor, onCursorMove }: { game: PublicGameView; vision: "blind" | "color"; act?: (action: ModuleAction, value?: number | string) => void; busy?: boolean; cursor?: CursorPoint; onCursorMove?: (point: CursorPoint) => void }) {
  const suitcaseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<SVGSVGElement>(null);
  function trackPointer(event: ReactPointerEvent<HTMLDivElement>, active: boolean) {
    if (!onCursorMove) return;
    const container = event.currentTarget;
    const box = container.getBoundingClientRect();
    const point: CursorPoint = { x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height), active };
    const hovered = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-anchor]") : null;
    if (hovered && container.contains(hovered) && hovered.dataset.anchor) {
      const rect = hovered.getBoundingClientRect();
      point.anchor = hovered.dataset.anchor;
      point.ax = clamp01((event.clientX - rect.left) / rect.width);
      point.ay = clamp01((event.clientY - rect.top) / rect.height);
    }
    onCursorMove(point);
  }
  // Short windows squeeze the module boxes. If any control would spill out of
  // its box, zoom the suitcase contents down just enough for everything to fit.
  const fitKey = `${game.activeModules.join(",")}|${game.modules.cable?.colors?.length ?? game.modules.cable?.count ?? 0}`;
  useLayoutEffect(() => {
    const suitcase = suitcaseRef.current;
    const frame = suitcase?.parentElement;
    if (!suitcase || !frame) return;
    const spills = () => {
      const clip = frame.getBoundingClientRect();
      return Array.from(suitcase.querySelectorAll<HTMLElement>(".case-bay")).some((bay) => {
        const box = bay.getBoundingClientRect();
        if (box.bottom > clip.bottom + 1) return true;
        return Array.from(bay.querySelectorAll<HTMLElement>("[data-anchor]")).some((control) => {
          const rect = control.getBoundingClientRect();
          return rect.bottom > box.bottom + 1 || rect.right > box.right + 1 || rect.top < box.top - 1;
        });
      });
    };
    let lastSize = "";
    const fit = () => {
      const size = `${frame.clientWidth}x${frame.clientHeight}`;
      if (size === lastSize) return;
      suitcase.style.zoom = "";
      if (spills()) {
        // The smallest phones with four modules need well under 0.4 to show every key.
        let fits = 0.25;
        let tooBig = 1;
        for (let step = 0; step < 8; step += 1) {
          const middle = (fits + tooBig) / 2;
          suitcase.style.zoom = String(middle);
          if (spills()) tooBig = middle;
          else fits = middle;
        }
        suitcase.style.zoom = String(fits);
      }
      lastSize = `${frame.clientWidth}x${frame.clientHeight}`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fitKey]);

  // Place the remote cursor on this screen's copy of the control BLIND is over.
  useLayoutEffect(() => {
    const container = suitcaseRef.current;
    const pointer = pointerRef.current;
    if (!container || !pointer || !cursor?.active) return;
    const place = () => {
      let left = cursor.x;
      let top = cursor.y;
      const target = cursor.anchor ? findAnchor(container, cursor.anchor) : null;
      if (target && typeof cursor.ax === "number" && typeof cursor.ay === "number") {
        const box = container.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        left = (rect.left - box.left + cursor.ax * rect.width) / box.width;
        top = (rect.top - box.top + cursor.ay * rect.height) / box.height;
      }
      pointer.style.left = `${left * 100}%`;
      pointer.style.top = `${top * 100}%`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [cursor?.active, cursor?.x, cursor?.y, cursor?.anchor, cursor?.ax, cursor?.ay]);
  const renderModule = (module: ModuleKey) => {
    if (module === "cable") return <CableModule key={module} module={game.modules.cable} vision={vision} act={act} busy={busy} />;
    if (module === "slider") return <SliderModule key={module} module={game.modules.slider} vision={vision} act={act} busy={busy} />;
    if (module === "direction") return <DirectionModule key={module} module={game.modules.direction} vision={vision} act={act} busy={busy} />;
    if (module === "calculator") return <CalculatorModule key={module} module={game.modules.calculator} vision={vision} act={act} busy={busy} />;
    if (module === "symbol") return <SymbolModule key={module} module={game.modules.symbol} vision={vision} act={act} busy={busy} />;
    if (module === "soundboard") return <SoundboardModule key={module} module={game.modules.soundboard} vision={vision} act={act} busy={busy} />;
    return <PianoModule key={module} module={game.modules.piano} vision={vision} act={act} busy={busy} />;
  };
  return (
    <div ref={suitcaseRef} className="bomb-suitcase" data-vision={vision} onPointerMove={(event) => trackPointer(event, true)} onPointerLeave={(event) => trackPointer(event, false)}>
      {cursor?.active && <MousePointer2 ref={pointerRef} className="remote-cursor" />}
      <div className="case-lid" data-anchor="case-lid"><div className="case-lid-inner"><div className="lid-cables"><i /><i /><i /></div><div className="case-screen"><span /><strong>{game.serial}</strong><i /></div><div className="lid-vents"><i /><i /><i /></div></div></div>
      <div className="case-hinge" data-anchor="case-hinge"><i /><i /></div>
      <div className="case-base" data-anchor="case-base"><div className="case-module-grid" data-count={game.activeModules.length}>{game.activeModules.map(renderModule)}</div></div>
    </div>
  );
}

function MuteSignalStage({ signal }: { signal?: MuteSignal }) {
  return <div className="mute-signal-stage"><div className="mute-monkey"><Hand className="mute-hand mute-hand-left" /><span>🙊</span><Hand className="mute-hand mute-hand-right" /></div><div className="mute-signal-space" aria-live="polite">{signal?.active ? <div className="mute-signal-bubble" key={signal.updatedAt}>{signal.symbol}</div> : <div className="mute-signal-placeholder" aria-hidden="true">…</div>}</div><small>{signal?.active ? "SIGN RECEIVED" : "WAITING FOR SIGN"}</small></div>;
}

function ObserverPanel({ game, feed }: { game: PublicGameView; feed: ReactNode }) {
  return <><section className="deaf-live-pane"><header><span><i /> LIVE</span><b>BLIND VIEW</b></header><SuitcaseBomb game={game} vision="color" cursor={game.operatorCursor} /></section><div className="deaf-side"><aside className="deaf-mute-pane"><header><span>🙊</span><b>MUTE LIVE</b></header><MuteSignalStage signal={game.muteSignal} /></aside>{feed}</div></>;
}

const CHAT_EXPRESSIONS = [
  { symbol: "👍", label: "Thumbs up" }, { symbol: "👎", label: "Thumbs down" },
  { symbol: "🔁", label: "Repeat" }, { symbol: "🖕", label: "Middle finger" },
  { symbol: "👆", label: "Point up" }, { symbol: "👇", label: "Point down" },
  { symbol: "👈", label: "Point left" }, { symbol: "👉", label: "Point right" },
];

function MuteChat({ onChat }: { onChat: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"menu" | "numbers" | "expressions">("menu");
  const [lastSent, setLastSent] = useState("");
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (sentTimer.current) clearTimeout(sentTimer.current); }, []);
  function choose(symbol: string) {
    onChat(symbol);
    setOpen(false);
    setPage("menu");
    setLastSent(symbol);
    if (sentTimer.current) clearTimeout(sentTimer.current);
    sentTimer.current = setTimeout(() => setLastSent(""), 4_000);
  }
  const HeaderIcon = page === "numbers" ? Hash : page === "expressions" ? Smile : MessageCircle;
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setPage("menu"); }}><PopoverTrigger asChild><Button className="mute-chat-trigger mute-sign-button" aria-label="Send a sign to DEAF"><Hand aria-hidden="true" /><span>{lastSent ? <>SENT <b>{lastSent}</b></> : "SEND A SIGN"}</span></Button></PopoverTrigger><PopoverContent className="mute-chat-popover" side="top" align="center" sideOffset={9}><header className="mute-chat-header">{page !== "menu" && <button onClick={() => setPage("menu")} aria-label="Back to symbol categories"><ArrowLeft /></button>}<HeaderIcon aria-hidden="true" /></header>{page === "menu" && <div className="chat-mode-grid"><button onClick={() => setPage("numbers")} aria-label="Open numbers"><Hash /></button><button onClick={() => setPage("expressions")} aria-label="Open expressions"><Smile /></button></div>}{page === "numbers" && <div className="chat-symbol-grid chat-number-grid">{Array.from({ length: 11 }, (_, number) => <button key={number} onClick={() => choose(String(number))}>{number}</button>)}</div>}{page === "expressions" && <div className="chat-symbol-grid chat-expression-grid">{CHAT_EXPRESSIONS.map(({ symbol, label }) => <button key={label} onClick={() => choose(symbol)} aria-label={label}>{symbol}</button>)}</div>}</PopoverContent></Popover>;
}

type FeedItem =
  | { kind: "action"; key: string; seq: number; text: string; error: boolean }
  | { kind: "message"; key: string; seq: number; message: ChatMessageView };

function CaseFeed({ role, actionLog, chatEnabled, messages, onSend, onSign, busy }: { role: Role; actionLog: Array<ActionLogEntry | string>; chatEnabled: boolean; messages: ChatMessageView[]; onSend: (text: string) => void; onSign?: (symbol: string) => void; busy: boolean }) {
  const [draft, setDraft] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const readOnly = role === "specialist";
  function submit(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || readOnly || busy) return;
    onSend(text);
    setDraft("");
  }
  // Chats and game notices share one sequence, so the newest is always at the bottom.
  const items: FeedItem[] = [
    ...actionLog.map((entry, index): FeedItem => {
      const action = typeof entry === "string" ? { text: entry, seq: 0, tone: undefined } : entry;
      return { kind: "action", key: `action-${action.seq}-${index}`, seq: action.seq, text: action.text, error: action.tone === "error" };
    }),
    ...messages.map((message): FeedItem => ({ kind: "message", key: message.id, seq: message.seq ?? 0, message })),
  ]
    .sort((a, b) => a.seq - b.seq)
    .slice(-20);
  const newest = items.at(-1)?.key;
  useEffect(() => {
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [newest]);
  return <aside className="case-feed" data-role={role}><header><Radio /><b>CASE FEED</b>{chatEnabled && <span><MessageCircle />{role === "observer" ? "OUTGOING ONLY" : role === "specialist" ? "READ + SIGNAL" : "TEAM CHAT"}</span>}</header><div ref={streamRef} className="case-feed-stream" aria-live="polite">{items.map((item, index) => item.kind === "action"
    ? <article className="case-action-entry" data-tone={item.error ? "error" : "info"} key={item.key}>{item.error ? <span className="case-alert-mark" aria-label="Wrong answer">!</span> : <small>{index === items.length - 1 ? "NOW" : "LOG"}</small>}<p>{item.text}</p></article>
    : <article className="case-chat-entry" key={item.key} data-role={item.message.senderRole}><div><b>{ROLE_META[item.message.senderRole].monkey} {item.message.senderName}</b><small>{ROLE_META[item.message.senderRole].short}</small></div><p>{item.message.text}</p></article>)}</div>{readOnly && onSign ? <div className="case-feed-sign"><MuteChat onChat={onSign} /><small>You can&apos;t type or talk. DEAF sees your sign right away.</small></div> : chatEnabled && !readOnly && (<form className="case-feed-form" onSubmit={submit}><Input value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 240))} placeholder={role === "observer" ? "Send a message…" : "Message the team…"} disabled={busy} aria-label="Team chat message" /><Button type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><Send /></Button></form>)}</aside>;
}

function ManualSteps({ steps }: { steps: ReactNode[] }) {
  return <ol className="manual-quick-steps">{steps.map((step, index) => <li key={index}><b>{index + 1}</b><span>{step}</span></li>)}</ol>;
}

function CableCountDiagram({ count }: { count: number }) {
  return <span className="manual-cable-count" aria-label={`${count} cables`}>{Array.from({ length: count }, (_, index) => <i key={index} />)}</span>;
}

function ManualWire({ color }: { color: LightColor }) {
  return <i className="manual-wire" style={{ background: WIRE_COLORS[color] }} aria-label={`${color.toLowerCase()} cable`} />;
}

function ManualBrailleReference() {
  return <span className="manual-braille-reference" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</span>;
}

function ManualColorLabel({ color }: { color: LightColor }) {
  return <span className="manual-color-label"><Light color={color} /></span>;
}

function ManualLightHeader({ lead }: { lead: ReactNode }) {
  return <div className="manual-light-header"><strong>{lead}</strong>{LIGHT_COLORS.map((color) => <ManualColorLabel key={color} color={color} />)}</div>;
}

function ManualRulePager({ row, count, onChange }: { row: number; count: number; onChange: (row: number) => void }) {
  return <nav className="manual-rule-pager" aria-label={`Rule row ${row + 1} of ${count}`}><button type="button" onClick={() => onChange(Math.max(0, row - 1))} disabled={row === 0} aria-label="Previous rule row"><ChevronLeft /></button><div><b>{row + 1}</b><span>/</span><b>{count}</b></div><button type="button" onClick={() => onChange(Math.min(count - 1, row + 1))} disabled={row === count - 1} aria-label="Next rule row"><ChevronRight /></button></nav>;
}

function DirectionCluster() {
  return <span className="manual-direction-cluster"><ArrowUp /><ArrowRight /><ArrowDown /><ArrowLeft /></span>;
}

function ManualSwitch({ up }: { up: boolean }) {
  return <span className={up ? "mini-switch up" : "mini-switch"}><i /></span>;
}

function CableManual({ highlight }: { highlight?: { count: 3 | 4; light: LightColor } }) {
  return <section className="manual-page" data-module="cable"><div className="manual-page-title"><Scissors /></div><ManualSteps steps={[<span className="visual-pair" key="count"><CableCountDiagram count={3} /><span>/</span><CableCountDiagram count={4} /></span>, <span className="visual-light-row" key="lights">{LIGHT_COLORS.map((color) => <Light key={color} color={color} />)}</span>, <span className="visual-pair" key="cut"><Scissors /><ManualWire color="BLUE" /></span>]} /><div className="manual-rule-table cable-rule-table"><ManualLightHeader lead={<span />} />{([3, 4] as const).map((count) => <div className="manual-table-row" key={count} data-coach-row={highlight?.count === count}><strong className="manual-row-label"><CableCountDiagram count={count} /></strong>{LIGHT_COLORS.map((light) => <span className="cable-answer" key={light} data-coach-hit={highlight?.count === count && highlight.light === light}><ManualWire color={CABLE_RULES[count][light]} /></span>)}</div>)}</div></section>;
}

function DirectionManual() {
  const groups = [[1, 4], [2, 7], [5, 3], [6, 9]];
  const [row, setRow] = useState(0);
  const numbers = groups[row];
  return <section className="manual-page" data-module="direction"><div className="manual-page-title"><DirectionCluster /></div><ManualSteps steps={[<span className="visual-pair" key="braille"><BrailleCell value={4} compact /><b>4</b></span>, <span className="visual-light-row" key="lights">{LIGHT_COLORS.map((color) => <Light key={color} color={color} />)}</span>, <DirectionCluster key="directions" />]} /><ManualRulePager row={row} count={groups.length} onChange={setRow} /><div className="manual-rule-table direction-rule-table"><ManualLightHeader lead={<ManualBrailleReference />} /><div className="manual-table-row"><span className="braille-pair"><BrailleCell value={numbers[0]} compact /><b>{numbers[0]}</b><span>/</span><BrailleCell value={numbers[1]} compact /><b>{numbers[1]}</b></span>{LIGHT_COLORS.map((light) => <span className="direction-answer" key={light}><DirectionGlyph direction={DIRECTION_RULES[numbers[0]][light]} /></span>)}</div></div></section>;
}

function RedBrailleReference() {
  return <span className="manual-red-reference"><Light color="RED" /><ArrowDown /><ManualBrailleReference /></span>;
}

function testSymbols(test: SliderTest): [ReactNode, ReactNode] {
  if (test === "ODD") return [<span key="odd">1·3·5·7·9</span>, <span key="even">2·4·6·8</span>];
  if (test === "SET_A") return [<span key="set-a-up">{SLIDER_NUMBER_GROUPS.SET_A.up.join("·")}</span>, <span key="set-a-down">{SLIDER_NUMBER_GROUPS.SET_A.down.join("·")}</span>];
  if (test === "GT_5") return [<span key="gt5">&gt; 5</span>, <span key="lte5">≤ 5</span>];
  return [<span className="manual-comparison" key="gt-red">&gt;<RedBrailleReference /></span>, <span className="manual-comparison" key="lte-red">≤<RedBrailleReference /></span>];
}

function SliderManual() {
  const [row, setRow] = useState(0);
  const rule = SLIDER_RULES[row];
  return <section className="manual-page wide-manual-page" data-module="slider"><div className="manual-page-title"><SlidersVertical /></div><ManualSteps steps={[<span className="visual-light-row" key="order">{rule.lights.map((color) => <Light key={color} color={color} />)}</span>, <span className="visual-pair" key="switch"><BrailleCell value={3} compact /><ManualSwitch up /><span>/</span><BrailleCell value={8} compact /><ManualSwitch up={false} /></span>, <CornerDownLeft key="enter" />]} /><ManualRulePager row={row} count={SLIDER_RULES.length} onChange={setRow} /><div className="slider-rule-focus"><div className="slider-order-label"><SlidersVertical />{rule.lights.map((color) => <ManualColorLabel key={color} color={color} />)}</div><div className="slider-condition-grid">{rule.tests.map((test, index) => { const [up, down] = testSymbols(test); return <div className="slider-rule-column" key={`${test}-${index}`}><ManualColorLabel color={rule.lights[index]} /><span className="manual-direction-rule" data-direction="up"><b><ArrowUp /></b><strong>{up}</strong></span><span className="manual-direction-rule" data-direction="down"><b><ArrowDown /></b><strong>{down}</strong></span></div>; })}</div></div></section>;
}

function CalculatorManual() {
  const rows = ["ODD", "EVEN"] as const;
  const [row, setRow] = useState(0);
  const parity = rows[row];
  const parityDigits = parity === "ODD" ? "1·3·5·7·9" : "0·2·4·6·8";
  return <section className="manual-page wide-manual-page" data-module="calculator"><div className="manual-page-title"><Calculator /></div><ManualSteps steps={[<span className="manual-equation" key="equation">38 + 24 = 62</span>, <span className="visual-pair" key="parity">62 <ArrowRight /> 0·2·4·6·8</span>, <span className="visual-pair" key="confirm"><Light color="GREEN" /><ArrowRight /><BrailleCell value={6} compact /></span>]} /><ManualRulePager row={row} count={rows.length} onChange={setRow} /><div className="manual-rule-table calculator-rule-table"><ManualLightHeader lead={<span className="manual-parity-digits">{parityDigits}</span>} /><div className="manual-table-row"><strong className="manual-row-label"><span className="manual-parity-digits">{parityDigits}</span></strong>{LIGHT_COLORS.map((color) => { const answer = CALCULATOR_RULES[parity][color]; return <span className="calculator-answer" key={color}><b>{answer}</b><BrailleCell value={answer} compact /></span>; })}</div></div></section>;
}

function PianoManual() {
  const [row, setRow] = useState(0);
  const mode = LIGHT_COLORS[row];
  return <section className="manual-page wide-manual-page" data-module="piano"><div className="manual-page-title"><Piano /></div><ManualSteps steps={[<span className="visual-pair" key="mode"><Piano /><Light color={mode} /></span>, <span className="visual-light-row" key="melody">{LIGHT_COLORS.map((color) => <Light key={color} color={color} />)}</span>, <span className="manual-piano-sequence" key="keys">{[1, 3, 5, 7].map((key) => <span key={key}><BrailleCell value={key} compact /><b>{key}</b></span>)}</span>]} /><ManualRulePager row={row} count={LIGHT_COLORS.length} onChange={setRow} /><div className="piano-rule-focus"><div className="piano-rule-mode"><Piano /><Light color={mode} /></div><div className="piano-rule-grid">{LIGHT_COLORS.map((color) => { const key = PIANO_RULES[mode][color]; return <div key={color}><Light color={color} /><ArrowRight /><span><BrailleCell value={key} compact /><b>{key}</b></span></div>; })}</div></div></section>;
}

function SymbolManual() {
  const [row, setRow] = useState(0);
  const seed = (row + 1) as 1 | 2 | 3 | 4;
  const seeds = (lit: number) => <span className="manual-seed-lamps" aria-label={`Seed light ${lit} lit`}>{[1, 2, 3, 4].map((index) => <i key={index} data-lit={index === lit} />)}</span>;
  return <section className="manual-page wide-manual-page" data-module="symbol"><div className="manual-page-title"><Compass /></div><ManualSteps steps={[<span className="visual-pair" key="seed">{seeds(2)}</span>, <span className="visual-pair manual-beep-step" key="beep"><span className="manual-dial-mini"><SymbolGlyph symbol="STAR" /></span><em>BEEP!</em></span>, <span className="visual-pair" key="button"><Light color="BLUE" /><ArrowRight /><span className="manual-symbol-buttons"><i /><i data-hit="true" /><i /></span></span>]} /><ManualRulePager row={row} count={4} onChange={setRow} /><div className="symbol-rule-focus"><div className="symbol-rule-seed">{seeds(seed)}<b>SEED {seed}</b></div><div className="symbol-rule-grid">{SYMBOLS.map((symbol) => <div key={symbol}><span className="symbol-rule-glyph"><SymbolGlyph symbol={symbol} /></span><ArrowRight /><Light color={SYMBOL_RULES[seed][symbol]} /></div>)}</div></div></section>;
}

function SoundGrid({ marks, size = "full" }: { marks: number[]; size?: "full" | "mini" }) {
  return <span className="sound-grid" data-size={size} aria-label={`Press positions ${marks.join(", ")}`}>{Array.from({ length: 9 }, (_, index) => <i key={index} data-marked={marks.includes(index + 1)}>{size === "full" ? index + 1 : null}</i>)}</span>;
}

function SoundboardManual() {
  const [row, setRow] = useState(0);
  const color = LIGHT_COLORS[row];
  const groups: SoundGroup[] = ["LOW", "MID", "HIGH"];
  return <section className="manual-page wide-manual-page" data-module="soundboard"><div className="manual-page-title"><Grid3x3 /></div><ManualSteps steps={[<span className="visual-pair manual-beep-step" key="beep"><span className="manual-sound-button" /><em>BEEP!</em></span>, <span className="visual-pair" key="clue"><Light color="BLUE" /><BrailleCell value={5} compact /></span>, <span className="visual-pair" key="press"><SoundGrid marks={[4, 6, 8]} size="mini" /></span>]} /><ManualRulePager row={row} count={LIGHT_COLORS.length} onChange={setRow} /><div className="soundboard-rule-focus"><div className="soundboard-rule-color"><Grid3x3 /><Light color={color} /></div><div className="soundboard-rule-grid">{groups.map((group) => <div key={group}><span className="soundboard-rule-numbers">{SOUND_GROUPS[group].map((number) => <span key={number}><BrailleCell value={number} compact /><b>{number}</b></span>)}</span><SoundGrid marks={SOUNDBOARD_RULES[color][group]} /></div>)}</div></div></section>;
}

function SpecialistPanel({ game, practice = false }: { game: PublicGameView; practice?: boolean }) {
  const pages = [
    { key: "cable" as const, icon: Scissors, component: <CableManual highlight={practice ? { count: PRACTICE_CABLE.count, light: PRACTICE_CABLE.light } : undefined} /> },
    { key: "slider" as const, icon: SlidersVertical, component: <SliderManual /> },
    { key: "direction" as const, icon: ArrowUp, component: <DirectionManual /> },
    { key: "calculator" as const, icon: Calculator, component: <CalculatorManual /> },
    { key: "piano" as const, icon: Piano, component: <PianoManual /> },
    { key: "symbol" as const, icon: Compass, component: <SymbolManual /> },
    { key: "soundboard" as const, icon: Grid3x3, component: <SoundboardManual /> },
  ];
  const firstActivePage = Math.max(0, pages.findIndex((manualPage) => game.activeModules.includes(manualPage.key)));
  const [page, setPage] = useState(firstActivePage);
  const PageIcon = pages[page].icon;

  return <div className="manual-book"><header><div className="manual-header-symbols"><BookOpen /><b>{game.level}</b><span>·</span><PageIcon /><b>{page + 1}/{pages.length}</b></div></header><div className="manual-pages">{pages[page].component}</div><footer className="manual-pagination"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Previous manual page"><ChevronLeft /></button><div aria-label={`Manual page ${page + 1} of ${pages.length}`}>{pages.map((manualPage, index) => { const Icon = manualPage.icon; return <button type="button" key={manualPage.key} data-active={index === page} data-needed={game.activeModules.includes(manualPage.key)} onClick={() => setPage(index)} aria-label={`Open manual page ${index + 1}`}><Icon /><span>{index + 1}</span></button>; })}</div><button type="button" onClick={() => setPage((current) => Math.min(pages.length - 1, current + 1))} disabled={page === pages.length - 1} aria-label="Next manual page"><ChevronRight /></button></footer></div>;
}

function RoundWaitingRoom({ data, onReady, onSwitchRole, busy, developer }: { data: RoomSnapshot; onReady: () => void; onSwitchRole: (role: Role) => void; busy: boolean; developer?: boolean }) {
  const game = data.room.game;
  const role = data.player.role;
  const meta = ROLE_META[role];
  const nextLevel = game.lastResult !== "cleared" ? game.level : game.level === 0 ? (data.room.startLevel ?? 1) : nextLevelAfterClear(game.level);
  const next = levelDefinition(nextLevel);
  const self = data.room.players.find((player) => player.role === role);
  // The first ready room of a campaign briefs each player on their role.
  const briefing = game.lastResult === "new";
  const retry = game.lastResult === "timeout" || game.lastResult === "strikes";
  const heading = game.lastResult === "timeout" ? "TIME EXPIRED" : game.lastResult === "strikes" ? "THREE STRIKES" : game.lastResult === "cleared" ? (game.level === 0 ? "PRACTICE DONE" : game.level === LAST_CAMPAIGN_LEVEL ? "CAMPAIGN CLEAR" : game.level === INFINITE_LEVEL ? "INFINITE CASE CLEAR" : `LEVEL ${game.level} CLEAR`) : "CAMPAIGN READY";
  const levelLabel = levelName(next.level);
  const timeLabel = next.level === 0 ? "NO TIMER · NO STRIKES" : formatTime(next.durationMs);
  const readyLabel = busy ? "UPDATING…" : developer ? "READY ALL & START" : self?.ready ? `WAITING FOR ${3 - data.room.readyCount}` : briefing ? "GOT IT, I'M READY" : "I'M READY";
  return <section className="round-waiting-room" data-briefing={briefing}>
    {briefing
      ? <div className="role-briefing" data-role={role}><small>YOUR JOB THIS GAME</small><span className="role-briefing-monkey" aria-hidden="true">{meta.monkey}</span><h2>{meta.short}</h2><p>{ROLE_JOBS[role]}</p><RoleSenses role={role} /></div>
      : <div className="waiting-result" data-result={game.lastResult}><span>{game.lastResult === "cleared" ? "🍌" : game.lastResult === "timeout" ? "⏱" : game.lastResult === "strikes" ? "💥" : "💣"}</span><small>{retry ? "TRY AGAIN" : "NEXT UP"}</small><h2>{heading}</h2></div>}
    <div className="next-level-card"><div><small>{briefing ? "FIRST UP" : "NEXT UP"} · LEVEL {levelLabel} · {timeLabel}</small><h3>{next.title}</h3></div><div className="next-modules">{next.modules.map((module) => { const MetaIcon = MODULE_META[module].icon; return <span key={module}><MetaIcon />{MODULE_META[module].label}</span>; })}{(next.random ?? []).map((pick, index) => <span className="random-module-chip" key={index}><Shuffle />{`${pick.count} RANDOM${tierName(pick.pool)}`}</span>)}</div></div>
    <div className="role-switch-panel">
      <div className="role-switch-note"><b>YOUR SQUAD</b><span><ArrowLeftRight aria-hidden="true" /> Tap another seat to swap roles with that player. A swap clears everyone&apos;s READY.</span></div>
      <div className="ready-seat-grid">{ROLES.map((seatRole) => { const player = data.room.players.find((candidate) => candidate.role === seatRole); const current = seatRole === role; return <button type="button" key={seatRole} data-ready={player?.ready} data-current={current} disabled={busy || current} onClick={() => onSwitchRole(seatRole)} aria-label={current ? `You are ${ROLE_META[seatRole].name}` : `Swap roles with ${player?.name ?? ROLE_META[seatRole].name}`}><span className="seat-monkey">{ROLE_META[seatRole].monkey}</span><div><small>{ROLE_META[seatRole].short}<span className="seat-role-name"> · {ROLE_META[seatRole].name}</span></small><b>{player?.name ?? "OPEN SEAT"}</b></div><div className="seat-state">{current ? <em className="seat-you">YOU</em> : <em className="seat-swap"><ArrowLeftRight aria-hidden="true" /> SWAP</em>}<i data-ready={player?.ready}>{player?.ready ? "READY ✓" : "NOT READY"}</i></div></button>; })}</div>
    </div>
    <div className="waiting-actions"><Button className="ready-button" disabled={busy || (!developer && self?.ready)} onClick={onReady}>{readyLabel}<Play /></Button></div>
    <p>{next.level === 0 ? "Level 0 starts when all three are ready. No clock, no strikes, just learn the relay." : "The timer starts only when all three monkeys are ready."}<TutorialButton className="rules-link" label="Rules" /></p>
  </section>;
}

// One sentence per role and module telling a new player what to do right now.
// Shown above the bomb until the team clears that module once.
const COACH_LINES: Record<ModuleKey, Record<Role, string>> = {
  cable: {
    operator: "You can't see colors. Wait for DEAF to tell you which cable, then click it.",
    observer: "Tell MUTE the light color and the cable colors from top to bottom. Then watch MUTE's sign and tell BLIND which cable to cut.",
    specialist: "Find the cable count and light color in your table to get a cable color. Sign where that color sits from the top, using the order DEAF gave you.",
  },
  slider: {
    operator: "Hover each Braille cell to see its number and read all four out loud, left to right. Then flip the switches DEAF tells you and press ENTER.",
    observer: "Tell MUTE the four light colors, left to right. Watch MUTE's signs and tell BLIND which switches go up.",
    specialist: "Flip to the page whose light order matches what DEAF says. Use BLIND's four numbers to pick up or down for each switch, then sign 👆 or 👇 for each one in order.",
  },
  direction: {
    operator: "Hover the Braille cell in the middle and say its number out loud. Then press the arrow DEAF tells you.",
    observer: "Tell MUTE the light color. Watch MUTE's arrow sign and tell BLIND which arrow to press. A wrong press changes the light.",
    specialist: "Flip to the page with BLIND's number, then find DEAF's light color. Sign that arrow with 👆 👇 👈 or 👉.",
  },
  calculator: {
    operator: "Type the answer DEAF gives you on the Braille keys and press the enter key. Then press the one final key DEAF tells you.",
    observer: "Work out the sum on the screen and tell BLIND the answer. When a light appears, tell MUTE the answer and the light color, then pass MUTE's number to BLIND.",
    specialist: "When DEAF gives you the answer and a light color, check whether the answer is odd or even. Find that row and color in your table and sign the number.",
  },
  piano: {
    operator: "Play the four keys DEAF tells you, in order. Hover a key to see its number. A wrong key restarts the tune.",
    observer: "Tell MUTE the color of the big mode light, then the four small melody colors in order. Pass MUTE's four numbers to BLIND.",
    specialist: "Flip to the page for the mode light's color. Turn each melody color into a key number and sign all four in order.",
  },
  symbol: {
    operator: "Click the middle of the dial to turn the pointer one symbol at a time. When BEEP! pops up on your screen, say so. Then press the button DEAF tells you.",
    observer: "When BLIND says it beeped, tell MUTE which of the four seed lights is lit, which symbol the pointer is on, and the three button colors left to right. Then tell BLIND which button.",
    specialist: "Flip to the page for the lit seed light DEAF names. Find the symbol that beeped to get a color. Sign where that color sits among the three buttons, left to right.",
  },
  soundboard: {
    operator: "Press the buttons one at a time until BEEP! pops up on one. Say which button beeped and read its Braille number out loud. Then press the buttons DEAF tells you.",
    observer: "When BLIND finds the beeping button, tell MUTE its color. Then pass MUTE's numbers to BLIND: 1 is top left, 9 is bottom right.",
    specialist: "Flip to the page for the beeping button's color. Find the grid for BLIND's number and sign each marked position: 1 is top left, 9 is bottom right.",
  },
};

const ROLE_JOBS: Record<Role, string> = {
  operator: "You press every button. Listen to DEAF to know which one.",
  observer: "You are the eyes. Describe the bomb and pass MUTE's signs to BLIND.",
  specialist: "You have the manual. Look up the answer and sign it to DEAF.",
};

type Sense = { label: "SEE" | "HEAR" | "TALK"; can: boolean; note: string };
const ROLE_SENSES: Record<Role, Sense[]> = {
  operator: [
    { label: "SEE", can: false, note: "No colors" },
    { label: "HEAR", can: true, note: "Listen to DEAF" },
    { label: "TALK", can: true, note: "Read Braille aloud" },
  ],
  observer: [
    { label: "SEE", can: true, note: "The whole bomb" },
    { label: "HEAR", can: false, note: "Keep sound off" },
    { label: "TALK", can: true, note: "Describe it" },
  ],
  specialist: [
    { label: "SEE", can: false, note: "Bomb hidden" },
    { label: "HEAR", can: true, note: "Everyone" },
    { label: "TALK", can: false, note: "Signs only" },
  ],
};

function SenseIcon({ sense }: { sense: Sense }) {
  if (sense.label === "SEE") return sense.can ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />;
  if (sense.label === "HEAR") return sense.can ? <Ear aria-hidden="true" /> : <EarOff aria-hidden="true" />;
  return sense.can ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />;
}

function RoleSenses({ role, compact = false }: { role: Role; compact?: boolean }) {
  return <ul className="role-senses" data-compact={compact} aria-label="What your role can do">{ROLE_SENSES[role].map((sense) => <li key={sense.label} data-can={sense.can} aria-label={`${sense.label}: ${sense.can ? "yes" : "no"}. ${sense.note}`}><SenseIcon sense={sense} /><b>{sense.label}</b><span className="sense-mark" aria-hidden="true">{sense.can ? "✓" : "✕"}</span>{!compact && <small>{sense.note}</small>}</li>)}</ul>;
}

function RoleCountdownCard({ role, seconds }: { role: Role; seconds: number }) {
  const meta = ROLE_META[role];
  return <div className="role-card-overlay" role="status" aria-live="polite"><div className="role-card" data-role={role}><span className="role-card-count" aria-label={`Starting in ${seconds}`}>{seconds}</span><span className="role-card-monkey" aria-hidden="true">{meta.monkey}</span><small>YOU ARE</small><h2>{meta.short}</h2><p>{ROLE_JOBS[role]}</p><RoleSenses role={role} /></div></div>;
}

// Shows one tip at a time so a case with several new modules never squeezes the bomb.
function CoachStrip({ role, modules, onDismiss }: { role: Role; modules: ModuleKey[]; onDismiss: (module: ModuleKey) => void }) {
  const first = modules[0];
  const Icon = MODULE_META[first].icon;
  return <section className="coach-strip" aria-label="Your move"><article key={first} data-role={role}><span className="coach-badge"><Lightbulb aria-hidden="true" /> YOUR MOVE{modules.length > 1 && <i>1 OF {modules.length}</i>}</span><b className="coach-module"><Icon aria-hidden="true" />{MODULE_META[first].label}</b><p>{COACH_LINES[first][role]}</p><button type="button" onClick={() => onDismiss(first)} aria-label={modules.length > 1 ? `Got it, show the next tip` : `Hide the ${MODULE_META[first].label.toLowerCase()} tip`}><X /></button></article></section>;
}

type RelayStage = "describe" | "operate" | "done";
// How long the team can be silent before a nudge appears (levels 0 to 3).
const NUDGE_AFTER_IDLE_MS = 25_000;
const NUDGE_AFTER_SIGN_MS = 20_000;

const PRACTICE_STEPS: Array<{ role: Role; label: string; stage: RelayStage }> = [
  { role: "observer", label: "DEAF says what the bomb shows", stage: "describe" },
  { role: "specialist", label: "MUTE looks it up and signs", stage: "describe" },
  { role: "observer", label: "DEAF tells BLIND", stage: "operate" },
  { role: "operator", label: "BLIND cuts", stage: "operate" },
];

const PRACTICE_LINES: Record<RelayStage, Record<Role, string>> = {
  describe: {
    observer: "Say what you see out loud: the light color, how many cables, and their colors from top to bottom.",
    specialist: "Listen to DEAF. Find 3 cables + red light in the glowing table. Then press SEND A SIGN and send the cable's position from the top.",
    operator: "Nothing to click yet. Listen: DEAF and MUTE are working out which cable.",
  },
  operate: {
    observer: "MUTE signed a number. Tell BLIND: \"Cut cable number …\", counting from the top.",
    specialist: "Sign sent. DEAF is passing it to BLIND. Watch the feed.",
    operator: "DEAF is telling you which cable. Click it.",
  },
  done: {
    observer: "Cable cut. That's the whole game: see, say, look up, sign, click.",
    specialist: "Cable cut. That's the whole game: see, say, look up, sign, click.",
    operator: "Cable cut. That's the whole game: see, say, look up, sign, click.",
  },
};

const PRACTICE_NUDGES: Record<Exclude<RelayStage, "done">, Record<Role, string>> = {
  describe: {
    observer: "Say this out loud: \"The light is RED. Three cables: blue, red, green.\"",
    specialist: "Row with 3 cables, column with the red light: the answer is BLUE. Blue is the first cable, so press SEND A SIGN and send 1.",
    operator: "Ask DEAF: \"What do you see?\" Then wait for the answer.",
  },
  operate: {
    observer: "Say: \"Cut the top cable.\"",
    specialist: "You're done. If BLIND is lost, DEAF should say \"cut the top cable\".",
    operator: "Click the top cable.",
  },
};

const NUDGES: Record<ModuleKey, Record<Exclude<RelayStage, "done">, Partial<Record<Role, string>>>> = {
  cable: {
    describe: { observer: "Say out loud: the light color, how many cables, and their colors from top to bottom.", specialist: "Find the row for the cable count and the column for the light color. Sign the position of that color, counting from the top.", operator: "Ask DEAF what they see. Nothing to click yet." },
    operate: { observer: "Tell BLIND which cable to click, counting from the top.", operator: "Ask DEAF which cable. MUTE already signed the answer." },
  },
  slider: {
    describe: { observer: "Say the four light colors, left to right. Then ask BLIND for the four Braille numbers.", specialist: "Flip to the page whose light order matches. For each switch use BLIND's number to pick up or down, then sign 👆 or 👇 four times, left to right.", operator: "Hover each Braille cell and read its number out loud, left to right." },
    operate: { observer: "Tell BLIND each switch, left to right: up or down. Then say ENTER.", operator: "Flip the switches DEAF says, left to right, then press ENTER." },
  },
  direction: {
    describe: { observer: "Say the light color, and ask BLIND for the Braille number in the middle.", specialist: "Flip to the page with BLIND's number, find DEAF's light color, and sign that arrow.", operator: "Hover the middle Braille cell and say its number out loud." },
    operate: { observer: "Tell BLIND which arrow to press.", operator: "Press the arrow DEAF says." },
  },
  calculator: {
    describe: { observer: "Work out the sum on the screen and tell BLIND the answer. When a light appears, tell MUTE the answer and the light color.", specialist: "Odd or even answer? Find that row and DEAF's light color, then sign the number.", operator: "Type the answer DEAF gives you and press the enter key." },
    operate: { observer: "Tell BLIND the one final key MUTE signed.", operator: "Press the final key DEAF says." },
  },
  piano: {
    describe: { observer: "Say the big mode light's color, then the four small melody colors in order.", specialist: "Flip to the page for the mode light. Turn each melody color into a key number and sign all four in order.", operator: "Wait for DEAF to give you four key numbers." },
    operate: { observer: "Tell BLIND the four key numbers in order.", operator: "Play the four keys DEAF says, in order." },
  },
  symbol: {
    describe: { observer: "Wait for BLIND to say it beeped. Then tell MUTE the lit seed light, the symbol under the pointer, and the three button colors left to right.", specialist: "Flip to the page for the lit seed light. Find the beeping symbol's color and sign its button position, 1 to 3.", operator: "Click the middle of the dial to turn the pointer until BEEP! pops up on your screen. Then say so." },
    operate: { observer: "Tell BLIND which button to press: left, middle or right.", operator: "Press the button DEAF says." },
  },
  soundboard: {
    describe: { operator: "Press buttons one at a time until one beeps. Say which one and read its Braille number out loud.", observer: "Ask BLIND which button beeped and tell MUTE its color.", specialist: "The color picks the page and BLIND's number picks the grid. Sign each marked position." },
    operate: { observer: "Tell BLIND the positions to press: 1 is top left, 9 is bottom right.", operator: "Press the positions DEAF says, in any order." },
  },
};

function nudgeFor(level: number, module: ModuleKey, role: Role, stage: RelayStage) {
  if (stage === "done") return "";
  if (level === 0) return PRACTICE_NUDGES[stage][role];
  return NUDGES[module][stage][role] ?? "";
}

// Level 0 only: the four-step relay with the current step lit, plus one line
// telling this player what to do right now.
function PracticeChain({ role, stage }: { role: Role; stage: RelayStage }) {
  return <section className="practice-chain" data-stage={stage} aria-label="The relay"><ol>{PRACTICE_STEPS.map((step, index) => { const active = stage === step.stage; const done = stage === "done" || (stage === "operate" && step.stage === "describe"); return <li key={index} data-active={active && !done} data-done={done} data-you={step.role === role}><span>{done ? "✓" : index + 1}</span><em>{ROLE_META[step.role].monkey}</em><b>{step.label}</b></li>; })}</ol><p data-stage={stage}><strong>{stage === "done" ? "DONE" : "YOU, NOW"}</strong>{PRACTICE_LINES[stage][role]}</p></section>;
}

type DeveloperControls = {
  role: Role;
  level: number;
  onRoleChange: (role: Role) => void;
  onLevelChange: (level: number) => void;
  onAction: (action: ModuleAction, value?: number | string) => void;
  onChat: (symbol: string) => void;
  onMessage: (text: string) => void;
  onCursorMove: (point: CursorPoint) => void;
  onReady: () => void;
  onWaitingPreview: () => void;
  onReset: () => void;
  onExit: () => void;
  solution: string[];
};

function Game({ data, onData, developer, onLeave, banner }: { data: RoomSnapshot; onData: (data: RoomSnapshot) => void; developer?: DeveloperControls; onLeave?: () => void; banner?: string }) {
  const game = data.room.game;
  const role = data.player.role;
  const meta = ROLE_META[role];
  const RoleIcon = ROLE_ICONS[role];
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cursorRef = useRef<CursorPoint>({ x: 0.5, y: 0.5, active: false });
  const cursorLastSent = useRef(0);
  const clockReady = now > 0;
  const remaining = game.startAt && clockReady ? game.startAt + game.durationMs - now : game.durationMs;
  // Capped at 3 so clock rounding never shows a "4" on the 3-second countdown.
  const prestart = game.startAt && clockReady ? Math.min(3, Math.max(0, Math.ceil((game.startAt - now) / 1000))) : 0;
  const timePercent = Math.max(0, Math.min(100, (remaining / game.durationMs) * 100));

  // "Your move" tips: one line per unsolved module this player hasn't learned yet.
  const learnedTips = useSyncExternalStore(subscribeLearnedTips, getLearnedTips, getServerLearnedTips);
  const solvedTipKeys = game.activeModules.filter((module) => game.modules[module]?.solved).map((module) => `${role}:${module}`).join(",");
  useEffect(() => {
    if (!developer && solvedTipKeys) markTipsLearned(solvedTipKeys.split(","));
  }, [developer, solvedTipKeys]);
  const coachModules = game.phase === "playing" && prestart === 0 && game.level > 0
    ? game.activeModules.filter((module) => !game.modules[module]?.solved && !learnedTips.has(`${role}:${module}`))
    : [];

  // Which step of the relay the team is on: "describe" until MUTE sends a sign,
  // "operate" until BLIND touches a control, "done" when the case is clear.
  const relayStage: RelayStage = game.completed === game.moduleCount && game.moduleCount > 0
    ? "done"
    : game.lastSignalAt && (!game.lastActionAt || game.lastSignalAt > game.lastActionAt) ? "operate" : "describe";
  const coaching = game.phase === "playing" && prestart === 0 && game.level <= 3;
  const idleSince = Math.max(game.startAt ?? 0, game.lastSignalAt ?? 0, game.lastActionAt ?? 0);
  const idleMs = coaching && clockReady && relayStage !== "done" && idleSince > 0 ? now - idleSince : 0;
  const stalled = idleMs > (relayStage === "operate" ? NUDGE_AFTER_SIGN_MS : NUDGE_AFTER_IDLE_MS);
  const focusModule = game.activeModules.find((module) => !game.modules[module]?.solved);
  const nudge = stalled && focusModule ? nudgeFor(game.level, focusModule, role, relayStage) : "";

  useEffect(() => {
    const tick = () => setNow(serverNow());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 200);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);

  const act = useCallback(async (moduleAction: ModuleAction, value?: number | string) => {
    if (developer) return developer.onAction(moduleAction, value);
    setBusy(true); setError("");
    try { onData(await requestRoom({ action: "module", moduleAction, value })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Control did not respond."); }
    finally { setBusy(false); }
  }, [developer, onData]);

  const reportCursor = useCallback((point: CursorPoint) => {
    cursorRef.current = point;
    if (developer) return developer.onCursorMove(point);
    const { active } = point;
    const timestamp = Date.now();
    if (active && timestamp - cursorLastSent.current < 90) return;
    cursorLastSent.current = timestamp;
    sendCursor(point);
  }, [developer]);

  useEffect(() => {
    if (developer || role !== "operator" || game.phase !== "playing") return;
    const heartbeat = window.setInterval(() => { const point = cursorRef.current; if (point.active) sendCursor(point); }, 300);
    return () => window.clearInterval(heartbeat);
  }, [developer, game.phase, role]);

  const sendChat = useCallback((symbol: string) => {
    if (developer) return developer.onChat(symbol);
    sendSignal(symbol).catch((cause) => setError(cause instanceof Error ? cause.message : "The sign did not send."));
  }, [developer]);

  const sendMessage = useCallback(async (text: string) => {
    if (developer) return developer.onMessage(text);
    setBusy(true); setError("");
    try { onData(await requestRoom({ action: "message", text })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The message did not send."); }
    finally { setBusy(false); }
  }, [developer, onData]);

  async function ready() {
    if (developer) return developer.onReady();
    setBusy(true); setError("");
    try { onData(await requestRoom({ action: "ready" })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not ready up."); }
    finally { setBusy(false); }
  }

  async function switchRole(targetRole: Role) {
    if (developer) return developer.onRoleChange(targetRole);
    setBusy(true); setError("");
    try { onData(await requestRoom({ action: "switch-role", targetRole })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch roles."); }
    finally { setBusy(false); }
  }

  const caseFeed = <CaseFeed role={role} actionLog={game.actionLog} chatEnabled={game.chatEnabled} messages={game.messages} onSend={sendMessage} onSign={sendChat} busy={busy} />;

  return <main className="game-shell" data-role={role} data-developer={Boolean(developer)}>
    <header className="game-header"><div className="game-header-start"><Link className="game-brand" href="/"><SnipMark /><b>SNIP <span>NO EVIL</span></b></Link>{onLeave && !developer && <button type="button" className="leave-room-button" onClick={onLeave} aria-label="Leave room"><LogOut /><span>LEAVE</span></button>}</div><div className="room-pill"><Users /> {developer ? "TEST MODE" : "ROOM"} <b>{data.room.code}</b></div><div className="level-pill">LEVEL <b>{levelName(game.level)}</b>{game.level === 0 && <i>PRACTICE</i>}</div><div className="timer-block" data-urgent={game.level > 0 && remaining < 30_000 && game.phase === "playing"}><Clock3 /><div><strong>{game.phase === "waiting" ? "READY" : prestart > 0 ? `0:0${prestart}` : game.level === 0 ? "NO TIMER" : formatTime(remaining)}</strong><Progress value={game.phase === "waiting" || game.level === 0 ? 100 : timePercent} /></div></div><div className="strike-block"><ShieldAlert />{game.level === 0 ? <em className="no-strikes">NO STRIKES</em> : Array.from({ length: game.maxMistakes }, (_, index) => <i key={index} data-hit={index < game.mistakes} />)}</div></header>
    <section className="role-banner"><div className="role-identity"><span>{meta.monkey}</span><div><small>YOUR ASSIGNMENT</small><h1>{meta.name}</h1></div></div><p><RoleIcon />{meta.ability}</p><RoleSenses role={role} compact /></section>
    {developer && <section className="developer-toolbar"><div className="developer-heading"><Wrench /><div><b>DEVELOPER MODE</b><span>Timer paused · shared test bomb</span></div></div><div className="developer-role-switcher">{ROLES.map((item) => <Button key={item} variant="outline" data-active={developer.role === item} onClick={() => developer.onRoleChange(item)}><span>{ROLE_META[item].monkey}</span>{ROLE_META[item].short}</Button>)}</div><div className="developer-level-switcher">{LEVELS.map(({ level }) => <button key={level} data-active={developer.level === level} onClick={() => developer.onLevelChange(level)}>{levelName(level)}</button>)}</div><details className="developer-solution"><summary>Reveal solution</summary><div>{developer.solution.map((line) => <span key={line}>{line}</span>)}</div></details><div className="developer-actions"><Button variant="outline" onClick={developer.onWaitingPreview}>Ready room</Button><Button variant="outline" onClick={developer.onReset}><RefreshCw /> Reset</Button><Button variant="outline" onClick={developer.onExit}><X /></Button></div></section>}
    <div className="progress-rail"><span>{game.completed}/{game.moduleCount} MODULES</span><Progress value={(game.completed / Math.max(1, game.moduleCount)) * 100} /><span>{game.levelTitle}</span></div>
    {banner && <p className="room-notice game-notice" role="status">{banner}</p>}
    {error && <p className="game-error">{error}</p>}
    {game.phase === "playing" && prestart > 0 && game.level >= 2 && <RoleCountdownCard role={role} seconds={prestart} />}
    {coaching && game.level === 0 && <PracticeChain role={role} stage={relayStage} />}
    {nudge && <div className="stuck-nudge" role="status"><span className="stuck-badge"><TriangleAlert aria-hidden="true" /> STUCK?</span><p>{nudge}</p></div>}
    {game.phase === "waiting" ? <RoundWaitingRoom data={data} onReady={ready} onSwitchRole={switchRole} busy={busy} developer={Boolean(developer)} /> : <section className="game-workspace" data-role={role} data-coach={coaching && game.level === 0 ? relayStage : undefined}>
      {coachModules.length > 0 && <CoachStrip role={role} modules={coachModules} onDismiss={(module) => markTipsLearned([`${role}:${module}`], !developer)} />}
      {role === "operator" && <SuitcaseBomb game={game} vision="blind" act={act} busy={busy || prestart > 0} onCursorMove={reportCursor} />}
      {role === "observer" && <ObserverPanel game={game} feed={caseFeed} />}
      {role === "specialist" && <SpecialistPanel key={`${game.level}-${game.activeModules.join("-")}`} game={game} practice={game.level === 0} />}
      {role !== "observer" && caseFeed}
    </section>}
  </main>;
}

function createDeveloperBomb(level = 1) {
  const next = createGameState(level, "playing", "new", true);
  next.startAt = null;
  resetLog(next, `Developer Level ${level} loaded. Timer paused.`);
  return next;
}

function DeveloperMode({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState<GameState>(() => createDeveloperBomb(1));
  const [role, setRole] = useState<Role>("operator");
  const [cursor, setCursor] = useState<CursorPoint>({ x: 0.55, y: 0.72, active: true });
  const [muteSignal, setMuteSignal] = useState<MuteSignal>({ symbol: "", updatedAt: 0, active: false });

  const loadLevel = useCallback((level: number) => { setState(createDeveloperBomb(level)); setCursor({ x: 0.55, y: 0.72, active: true }); }, []);
  const act = useCallback((moduleAction: ModuleAction, value?: number | string) => {
    setState((current) => {
      const next = structuredClone(current);
      next.lastActionAt = Date.now();
      applyModuleAction(next, moduleAction, value);
      const done = completedModules(next) === activeModules(next).length;
      if (done || (next.level > 0 && next.mistakes >= next.maxMistakes)) {
        next.phase = "waiting";
        next.lastResult = done ? "cleared" : "strikes";
        next.startAt = null;
        next.messages = [];
      }
      return next;
    });
  }, []);

  const ready = useCallback(() => {
    setState((current) => {
      const nextLevel = current.lastResult === "cleared" ? nextLevelAfterClear(current.level) : current.level;
      return createDeveloperBomb(nextLevel);
    });
  }, []);

  const data = useMemo<RoomSnapshot>(() => {
    const roleGame = publicStateForRole(state, role, `developer-${role}`) as unknown as PublicGameView;
    return {
      room: {
        code: "LOCAL", status: "playing", version: 1, isHost: true, startLevel: 1, readyCount: 0,
        players: ROLES.map((item) => ({ name: item === role ? "Test Player" : `${ROLE_META[item].short} Preview`, role: item, online: true, ready: false })),
        game: role === "observer" ? { ...roleGame, operatorCursor: cursor, muteSignal } : roleGame,
      },
      player: { id: "developer", name: "Test Player", role },
    };
  }, [cursor, muteSignal, role, state]);

  const solution = useMemo(() => {
    const lines: string[] = [];
    const enabled = activeModules(state);
    if (enabled.includes("cable")) lines.push(`CABLE · ${state.modules.cable.targetColor}`);
    if (enabled.includes("slider")) lines.push(`SLIDER · ${state.modules.slider.target.map((up) => up ? "↑" : "↓").join(" ")}`);
    if (enabled.includes("direction")) lines.push(`DIRECTION · ${state.modules.direction.target}`);
    if (enabled.includes("calculator")) lines.push(`CALCULATOR · ${state.modules.calculator.answer}, THEN ${state.modules.calculator.targetDigit}`);
    if (enabled.includes("piano")) lines.push(`PIANO · ${state.modules.piano.target.join(" → ")}`);
    if (enabled.includes("soundboard")) { const board = state.modules.soundboard; lines.push(`SOUNDBOARD · BEEP AT ${board.beeper + 1} (${board.numbers[board.beeper]}, ${board.colors[board.beeper]}) → PRESS ${board.target.map((index) => index + 1).join(" ")}`); }
    if (enabled.includes("symbol")) lines.push(`SYMBOL · SEED ${state.modules.symbol.seed} · ${state.modules.symbol.target} → ${state.modules.symbol.targetColor} (BUTTON ${state.modules.symbol.buttons.indexOf(state.modules.symbol.targetColor) + 1})`);
    return lines;
  }, [state]);

  return <Game data={data} onData={() => undefined} developer={{ role, level: state.level, onRoleChange: setRole, onLevelChange: loadLevel, onAction: act, onChat: (symbol) => { const at = Date.now(); setMuteSignal({ symbol, updatedAt: at, active: true }); setState((current) => ({ ...current, lastSignalAt: at })); }, onMessage: (text) => role !== "specialist" && setState((current) => { const seq = (current.feedSeq ?? 0) + 1; return { ...current, feedSeq: seq, messages: [...current.messages, { id: makeId(), senderId: `developer-${role}`, senderRole: role, senderName: "Test Player", text, sentAt: Date.now(), seq }].slice(-40) }; }), onCursorMove: (point) => point.active && setCursor(point), onReady: ready, onWaitingPreview: () => setState((current) => ({ ...current, phase: "waiting", lastResult: "cleared", startAt: null, messages: [] })), onReset: () => loadLevel(state.level), onExit, solution }} />;
}

const HOST_OFFLINE_BANNER = "The host's browser went offline. If they don't come back in a few seconds, another player takes over as host automatically.";

function readSavedCode() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return "";
    const parsed = JSON.parse(saved) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : "";
  } catch {
    return "";
  }
}

function forgetSavedCode() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be blocked. */ }
}

export default function GameClient() {
  const [data, setData] = useState<RoomSnapshot | null>(null);
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [developerMode, setDeveloperMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [hostOnline, setHostOnline] = useState(true);
  const [live, setLive] = useState<LiveFeed>({ cursor: null, signal: null });
  const [clock, setClock] = useState(0);

  // Reopen the room this tab was in before a reload.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const code = readSavedCode();
      if (!code) { setLoading(false); return; }
      resumeRoom(code)
        .then((result) => {
          if (!active) return;
          if (!result) { forgetSavedCode(); return; }
          setConnection(result.connection);
          setData(result.snapshot as unknown as RoomSnapshot);
        })
        // Keep the saved room on a network error so a later reload can retry.
        .catch((cause) => { if (active) setNotice(`Couldn't reopen your room: ${describeError(cause)} Reload the page to try again.`); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, []);

  // Live room updates replace the old polling loop.
  useEffect(() => {
    if (!connection) return;
    return connection.subscribe({
      onSnapshot: (snapshot) => setData(snapshot as unknown as RoomSnapshot),
      onRemoved: (reason) => {
        connection.close();
        forgetSavedCode();
        setConnection(null);
        setData(null);
        setNotice(reason);
      },
      onHostStatus: ({ hostOnline: online }) => setHostOnline(online),
    });
  }, [connection]);

  // DEAF always sees the Blind cursor and the Mute sign. In the tutorial everyone does.
  const needsLive = Boolean(connection && data && data.player.role === "observer");
  useEffect(() => {
    if (!connection || !needsLive) return;
    const stop = connection.watchLive(setLive);
    const timer = window.setInterval(() => setClock(serverNow()), 250);
    return () => { stop(); window.clearInterval(timer); };
  }, [connection, needsLive]);
  const view = useMemo(() => (data && needsLive ? withLiveFeed(data, live, clock) : data), [clock, data, live, needsLive]);

  const enter = useCallback((next: RoomConnection, snapshot: RoomSnapshot) => {
    setNotice("");
    setHostOnline(true);
    setConnection(next);
    setData(snapshot);
  }, []);

  const leave = useCallback(async () => {
    await leaveRoom();
    forgetSavedCode();
    setConnection(null);
    setData(null);
    setNotice("");
  }, []);

  if (loading) return <div className="loading-screen"><Bomb /><span>OPENING CASE</span></div>;
  if (developerMode) return <DeveloperMode onExit={() => setDeveloperMode(false)} />;
  if (!view || !connection) return <StartScreen onEnter={enter} onTest={() => setDeveloperMode(true)} notice={notice} />;
  const banner = !hostOnline && !view.room.isHost ? HOST_OFFLINE_BANNER : "";
  if (view.room.status === "lobby") return <Lobby data={view} onData={setData} onTest={() => setDeveloperMode(true)} onLeave={leave} banner={banner} />;
  return <Game data={view} onData={setData} onLeave={leave} banner={banner} />;
}
