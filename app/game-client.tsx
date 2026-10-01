"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent as ReactFormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
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
  Clock3,
  Copy,
  CornerDownLeft,
  Ear,
  EarOff,
  Eye,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  activeModules,
  applyModuleAction,
  applyTutorialAction,
  CABLE_RULES,
  CALCULATOR_RULES,
  completedModules,
  createGameState,
  createTutorialGameState,
  DIRECTION_RULES,
  LEVELS,
  levelDefinition,
  makeId,
  nextLevelAfterClear,
  PIANO_RULES,
  publicStateForRole,
  resetLog,
  ROLE_META,
  ROLES,
  SLIDER_NUMBER_GROUPS,
  SLIDER_RULES,
  type Direction,
  type GameState,
  type LightColor,
  type ModuleAction,
  type ActionLogEntry,
  type ModuleKey,
  type Role,
  type SliderTest,
  type TutorialAction,
  type TutorialFeedEntry,
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
type ChatMessageView = { id: string; senderRole: Role; senderName: string; text: string; sentAt: number; seq?: number };
type TutorialView = {
  step: number;
  practiceMistakes: number;
  completedAt: number | null;
  feed: TutorialFeedEntry[];
  cable: { count: number; colors: LightColor[]; light: LightColor; cut: number | null; solved: boolean };
};
type PublicGameView = {
  serial: string | null;
  level: number;
  levelTitle: string;
  activeModules: ModuleKey[];
  phase: "waiting" | "playing" | "tutorial";
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
  tutorial: TutorialView | null;
  messages: ChatMessageView[];
  modules: { cable: CableView; slider: SliderView; direction: DirectionView; calculator: CalculatorView; piano: PianoView };
  operatorCursor?: CursorPoint;
  muteSignal?: MuteSignal;
};
type RoomSnapshot = {
  room: {
    code: string;
    status: "lobby" | "playing" | "defused" | "exploded";
    version: number;
    isHost: boolean;
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
};
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

function RoleChoice({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as Role)} className="role-picker" aria-label="Choose a role">
      {ROLES.map((role) => {
        const meta = ROLE_META[role];
        return (
          <label className="role-option" key={role} data-selected={value === role}>
            <RadioGroupItem value={role} className="sr-only" />
            <span className="role-monkey" aria-hidden="true">{meta.monkey}</span>
            <span><b>{meta.name}</b><small>{meta.short}</small></span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

const TUTORIAL_PAGES = ["THE BOMB", "THE SQUAD", "THE RELAY", "THE MODULES", "THE PIANO", "THE ROUND"];

function TutorialSpread({ page }: { page: number }) {
  if (page === 0) return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>BOMB</h3><div className="tutorial-case"><Bomb /><div><span>2:30</span><i>× × ×</i></div></div><p>Every suitcase combines one or more modules with the same shared clock.</p></section><section className="tutorial-page"><h3>READ THE DISPLAY</h3><div className="tutorial-callout"><Clock3 /><div><b>TIME</b><span>The timer appears on all three screens. Finish every active module before it reaches zero.</span></div></div><div className="tutorial-callout danger"><TriangleAlert /><div><b>STRIKES</b><span>A wrong answer adds a strike. Three strikes or no time left sends the same level back to the ready room.</span></div></div></section></div>;

  if (page === 1) return <div className="tutorial-spread"><section className="tutorial-page"><h3>THREE MONKEYS</h3><div className="tutorial-role-stack">{ROLES.map((role) => <div key={role}><span>{ROLE_META[role].monkey}</span><p><b>{ROLE_META[role].short}</b><small>{ROLE_META[role].name}</small></p></div>)}</div><p>Each player receives different information. Nobody can solve the suitcase alone.</p></section><section className="tutorial-page"><h3>WHO KNOWS WHAT?</h3><div className="tutorial-role-facts"><div><span>🙈</span><p><b>BLIND</b><small>Touches every control and reads Braille patterns, but sees no colors or screen details.</small></p></div><div><span>🙉</span><p><b>DEAF</b><small>Sees colors, displays, the Blind player&apos;s cursor, and the Mute player&apos;s signs—but never gets the manual.</small></p></div><div><span>🙊</span><p><b>MUTE</b><small>Reads the full rulebook and sends numbers or expressions, but never sees the bomb.</small></p></div></div></section></div>;

  if (page === 2) return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>PASS THE CLUES</h3><div className="tutorial-relay"><div><span>🙉</span><b>DEAF</b></div><ArrowRight /><div><span>🙊</span><b>MUTE</b></div><ArrowRight /><div><span>🙈</span><b>BLIND</b></div></div><p>The answer only appears after the team combines the visible clue, the Braille clue, and the manual rule.</p><div className="tutorial-text-rule"><MessageCircle /><span><b>OPTIONAL TEXT CHAT</b> BLIND and DEAF may type. MUTE reads only and uses signals.</span></div></section><section className="tutorial-page"><h3>SIGNAL LOOP</h3><ol className="tutorial-steps"><li><b>1</b><span>DEAF reports the light colors, cable colors, or display.</span></li><li><b>2</b><span>BLIND reports cable count or Braille patterns.</span></li><li><b>3</b><span>MUTE checks the manual and sends a number or signal.</span></li><li><b>4</b><span>DEAF confirms the signal and guides BLIND to the correct control.</span></li></ol><div className="tutorial-chat-demo"><MessageCircle /><span>0–10</span><span>👍 👎 🔁 👆 👇 👈 👉</span></div><p className="tutorial-privacy-note">DEAF sees only their own typed messages. BLIND and MUTE can read messages from DEAF.</p></section></div>;

  if (page === 3) return <div className="tutorial-spread"><section className="tutorial-page"><h3>MODULES I</h3><div className="tutorial-module"><Scissors /><div><b>CABLE</b><span>Combine the light, cable colors, and cable count. MUTE identifies one color; BLIND cuts that cable.</span></div></div><div className="tutorial-module"><SlidersVertical /><div><b>COLOR SLIDER</b><span>Combine the four-light order with all four Braille values. Set every switch up or down, then press ENTER.</span></div></div></section><section className="tutorial-page"><h3>MODULES II</h3><div className="tutorial-module"><ArrowUp /><div><b>DIRECTION</b><span>Combine one light with one Braille pattern. MUTE returns up, down, left, or right.</span></div></div><div className="tutorial-module"><Calculator /><div><b>CALCULATOR</b><span>Enter the equation result first. Then combine its odd/even result with the new light and press one final Braille key.</span></div></div></section></div>;

  if (page === 4) return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>PIANO</h3><div className="tutorial-piano-demo"><Piano /><div>{LIGHT_COLORS.map((color) => <Light key={color} color={color} />)}</div><span>{Array.from({ length: 8 }, (_, index) => <BrailleCell key={index} value={index + 1} compact />)}</span></div><p>DEAF reads the large mode light and the four colored melody lights. MUTE converts every color through the matching manual row. BLIND plays the four Braille keys in order.</p></section><section className="tutorial-page"><h3>AFTER LEVEL 10</h3><div className="tutorial-callout"><Shuffle /><div><b>INFINITE MODE</b><span>Every new suitcase chooses four different modules from all five. Clear it, ready up, and another random case begins.</span></div></div><div className="tutorial-callout danger"><TriangleAlert /><div><b>WRONG NOTE</b><span>A wrong piano key adds a strike and restarts only the four-note melody from its first note.</span></div></div></section></div>;

  return <div className="tutorial-spread"><section className="tutorial-page tutorial-art-page"><h3>READY ROOM</h3><div className="tutorial-ready-demo"><div><span>🙈</span><b>READY</b></div><div><span>🙉</span><b>READY</b></div><div><span>🙊</span><b>READY</b></div></div><p>The timer begins only after all three players ready up.</p></section><section className="tutorial-page"><h3>ROUND LOOP</h3><ol className="tutorial-steps"><li><b>1</b><span>Review the next level and swap roles if the squad wants to.</span></li><li><b>2</b><span>All three players press READY. A short countdown arms the suitcase.</span></li><li><b>3</b><span>Solve every listed module before time or strikes run out.</span></li><li><b>4</b><span>A cleared level advances. A failed level must be replayed.</span></li></ol><div className="tutorial-win-strip"><TimerReset /><b>LEVELS 1 → 10 · ∞</b><Banana /></div></section></div>;
}

function TutorialButton({ className = "", label = "How to play" }: { className?: string; label?: string }) {
  const [page, setPage] = useState(0);
  return <Dialog onOpenChange={(open) => { if (!open) setPage(0); }}><DialogTrigger asChild><Button type="button" variant="outline" className={className}><CircleHelp />{label}</Button></DialogTrigger><DialogContent className="tutorial-dialog" showCloseButton={false}><div className="tutorial-topline"><div><DialogTitle>BOMBANANA FIELD GUIDE</DialogTitle><DialogDescription>{TUTORIAL_PAGES[page]} · PAGE {page + 1} OF {TUTORIAL_PAGES.length}</DialogDescription></div><DialogClose asChild><button type="button" aria-label="Close tutorial"><X /></button></DialogClose></div><TutorialSpread page={page} /><footer className="tutorial-footer"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}><ChevronLeft /> BACK</button><div aria-label={`Tutorial page ${page + 1} of ${TUTORIAL_PAGES.length}`}>{TUTORIAL_PAGES.map((title, index) => <button type="button" key={title} onClick={() => setPage(index)} data-active={index === page} aria-label={`Open ${title.toLowerCase()} page`} />)}</div>{page < TUTORIAL_PAGES.length - 1 ? <button type="button" onClick={() => setPage((current) => Math.min(TUTORIAL_PAGES.length - 1, current + 1))}>NEXT <ChevronRight /></button> : <DialogClose asChild><button type="button">DONE <Check /></button></DialogClose>}</footer></DialogContent></Dialog>;
}

function StartScreen({ onEnter, onTest, notice }: { onEnter: (connection: RoomConnection, data: RoomSnapshot) => void; onTest: () => void; notice?: string }) {
  const [mode, setMode] = useState("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [chatEnabled, setChatEnabled] = useState(false);
  const [tutorialEnabled, setTutorialEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Give your monkey a name.");
    if (mode === "join" && code.replace(/\W/g, "").length !== 5) return setError("Enter the five-character room code.");
    setBusy(true);
    try {
      const entered = mode === "join"
        ? await joinRoom({ code, name, role })
        : await createRoom({ name, role, chatEnabled, tutorialEnabled });
      const data = entered.snapshot as unknown as RoomSnapshot;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: data.room.code })); } catch { /* Private windows may block storage; the game still works. */ }
      onEnter(entered.connection, data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enter the room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start-shell">
      <header className="brand-lockup" aria-label="Bombanana browser drill">
        <div className="brand-bomb"><Bomb aria-hidden="true" /></div>
        <div><span className="eyebrow">THREE MONKEY BOMB SQUAD</span><h1>BOMBA<span>NANA</span></h1></div>
        <Banana className="brand-banana" aria-hidden="true" />
      </header>
      <section className="start-grid">
        <div className="brief-panel">
          <Badge className="brief-badge">3 PLAYERS · 10 LEVELS · 5 MODULES · ∞</Badge>
          <h2>Every monkey holds one piece of the answer.</h2>
          <p>Clear ten suitcase levels together, then keep going in infinite mode. Every round starts only after all three roles ready up.</p>
          <div className="mini-roles">
            {ROLES.map((item, index) => (
              <div key={item}><span className="role-index">0{index + 1}</span><span className="mini-monkey">{ROLE_META[item].monkey}</span><div><b>{ROLE_META[item].short}</b><small>{ROLE_META[item].ability}</small></div></div>
            ))}
          </div>
        </div>
        <div className="entry-card">
          {notice && <p className="room-notice" role="status">{notice}</p>}
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="entry-tabs"><TabsTrigger value="create">Create room</TabsTrigger><TabsTrigger value="join">Join room</TabsTrigger></TabsList>
            <TabsContent value="create" className="entry-content"><p>You’ll receive a room code for the other two players.</p></TabsContent>
            <TabsContent value="join" className="entry-content">
              <label className="field-label" htmlFor="room-code">Room code</label>
              <Input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 5))} placeholder="BAN42" className="game-input code-input" autoComplete="off" />
            </TabsContent>
          </Tabs>
          <label className="field-label" htmlFor="player-name">Monkey name</label>
          <Input id="player-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 20))} placeholder="Constantine" className="game-input" autoComplete="nickname" />
          <span className="field-label">Choose your assignment</span>
          <RoleChoice value={role} onChange={setRole} />
          {mode === "create" && <div className="room-option-stack"><label className="chat-mode-toggle"><span><b>OPTIONAL TEXT CHAT</b><small>{chatEnabled ? "BLIND and DEAF can type during the game." : "Role signals stay limited to the existing tools."}</small></span><Switch checked={chatEnabled} onCheckedChange={setChatEnabled} aria-label="Enable text chat" /></label><label className="chat-mode-toggle tutorial-mode-toggle"><span><b>TUTORIAL MODE</b><small>Learn how to play before Level 1</small></span><Switch checked={tutorialEnabled} onCheckedChange={setTutorialEnabled} aria-label="Tutorial Mode — Learn how to play before Level 1" /></label></div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button onClick={submit} disabled={busy} className="launch-button">{busy ? "Opening case…" : mode === "create" ? "Create squad" : "Claim seat"}<span aria-hidden="true">→</span></Button>
          <TutorialButton className="tutorial-entry-button" label="Read how to play" />
          <div className="test-entry-divider"><span>OR TEST IT SOLO</span></div>
          <Button onClick={onTest} variant="outline" className="test-entry-button"><Wrench /> Open developer mode</Button>
        </div>
      </section>
      <footer className="start-footer"><span>Unofficial browser tribute. Not affiliated with Lefto Studio or TARK.</span><span>Built for three separate tabs or devices.</span></footer>
    </main>
  );
}

function RoleChip({ player }: { player?: Player }) {
  if (!player) return <div className="seat-card empty-seat"><span>+</span><b>OPEN SEAT</b></div>;
  const meta = ROLE_META[player.role];
  return <div className="seat-card"><span className="seat-monkey">{meta.monkey}</span><div><small>{meta.short}</small><b>{player.name}</b></div><span className={player.online ? "presence online" : "presence"} /></div>;
}

function Lobby({ data, onData, onTest, onLeave, banner }: { data: RoomSnapshot; onData: (data: RoomSnapshot) => void; onTest: () => void; onLeave: () => void; banner?: string }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slots = ROLES.map((role) => data.room.players.find((player) => player.role === role));
  const full = data.room.players.length === 3;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
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
      <div className="lobby-topline"><Radio /> ROOM OPEN <span>WAITING FOR SQUAD</span></div>
      <div className="room-code-block"><small>ROOM CODE</small><button onClick={copyCode}>{data.room.code} {copied ? <Check /> : <Copy />}</button></div>
      <div className="seat-grid">{slots.map((player, index) => <RoleChip player={player} key={ROLES[index]} />)}</div>
      <div className="lobby-option-grid"><div className="lobby-chat-status" data-enabled={data.room.game.chatEnabled}><MessageCircle /><b>TEXT CHAT {data.room.game.chatEnabled ? "ON" : "OFF"}</b><span>{data.room.game.chatEnabled ? "BLIND + DEAF can type" : "No typed messages this run"}</span></div><div className="lobby-chat-status tutorial-lobby-status" data-enabled={data.room.game.tutorialEnabled}><CircleHelp /><b>TUTORIAL {data.room.game.tutorialEnabled ? "ON" : "OFF"}</b><span>{data.room.game.tutorialEnabled ? "Before Level 1" : "Start normally"}</span></div></div>
      {banner && <p className="room-notice" role="status">{banner}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {data.room.isHost ? <Button className="launch-button" disabled={!full || busy} onClick={start}><Play /> {busy ? "Staging…" : full ? data.room.game.tutorialEnabled ? "Start interactive tutorial" : "Open Level 1 ready room" : `Waiting for ${3 - data.room.players.length}`}</Button> : <div className="waiting-bar"><span /> Host opens the campaign when every role is filled.</div>}
      <TutorialButton className="tutorial-lobby-button" label="How to play" />
      <Button onClick={onTest} variant="outline" className="test-entry-button lobby-test-button"><Wrench /> Test all levels alone</Button>
      <Button onClick={onLeave} variant="outline" className="test-entry-button lobby-leave-button"><LogOut /> Leave room</Button>
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
  return <div className="mute-signal-stage"><div className="mute-signal-space" aria-live="polite">{signal?.active && <div className="mute-signal-bubble" key={signal.updatedAt}>{signal.symbol}</div>}</div><div className="mute-monkey"><Hand className="mute-hand mute-hand-left" /><span>🙊</span><Hand className="mute-hand mute-hand-right" /></div><small>{signal?.active ? "SIGN RECEIVED" : "WAITING FOR SIGN"}</small></div>;
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

function CableManual() {
  return <section className="manual-page" data-module="cable"><div className="manual-page-title"><Scissors /></div><ManualSteps steps={[<span className="visual-pair" key="count"><CableCountDiagram count={3} /><span>/</span><CableCountDiagram count={4} /></span>, <span className="visual-light-row" key="lights">{LIGHT_COLORS.map((color) => <Light key={color} color={color} />)}</span>, <span className="visual-pair" key="cut"><Scissors /><ManualWire color="BLUE" /></span>]} /><div className="manual-rule-table cable-rule-table"><ManualLightHeader lead={<span />} />{([3, 4] as const).map((count) => <div className="manual-table-row" key={count}><strong className="manual-row-label"><CableCountDiagram count={count} /></strong>{LIGHT_COLORS.map((light) => <span className="cable-answer" key={light}><ManualWire color={CABLE_RULES[count][light]} /></span>)}</div>)}</div></section>;
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

function SpecialistPanel({ game }: { game: PublicGameView }) {
  const pages = [
    { key: "cable" as const, icon: Scissors, component: <CableManual /> },
    { key: "slider" as const, icon: SlidersVertical, component: <SliderManual /> },
    { key: "direction" as const, icon: ArrowUp, component: <DirectionManual /> },
    { key: "calculator" as const, icon: Calculator, component: <CalculatorManual /> },
    { key: "piano" as const, icon: Piano, component: <PianoManual /> },
  ];
  const firstActivePage = Math.max(0, pages.findIndex((manualPage) => game.activeModules.includes(manualPage.key)));
  const [page, setPage] = useState(firstActivePage);
  const PageIcon = pages[page].icon;

  return <div className="manual-book"><header><div className="manual-header-symbols"><BookOpen /><b>{game.level}</b><span>·</span><PageIcon /><b>{page + 1}/{pages.length}</b></div></header><div className="manual-pages">{pages[page].component}</div><footer className="manual-pagination"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Previous manual page"><ChevronLeft /></button><div aria-label={`Manual page ${page + 1} of ${pages.length}`}>{pages.map((manualPage, index) => { const Icon = manualPage.icon; return <button type="button" key={manualPage.key} data-active={index === page} data-needed={game.activeModules.includes(manualPage.key)} onClick={() => setPage(index)} aria-label={`Open manual page ${index + 1}`}><Icon /><span>{index + 1}</span></button>; })}</div><button type="button" onClick={() => setPage((current) => Math.min(pages.length - 1, current + 1))} disabled={page === pages.length - 1} aria-label="Next manual page"><ChevronRight /></button></footer></div>;
}

const TUTORIAL_COACH = [
  { role: null, title: "LOOK AT ALL 3 BOXES", text: "Tutorial only: everybody can see all three jobs. In the real game, you only see your own job." },
  { role: "operator" as Role, title: "BLIND: LOOK AT THE BLACK CASE", text: "BLIND can click the suitcase and count 3 cables. BLIND cannot see their colors or the light color." },
  { role: "observer" as Role, title: "DEAF: FIND THE RED LIGHT", text: "DEAF sees the missing color clue. Click the huge button with the red light." },
  { role: "observer" as Role, title: "DEAF: SEND THE CLUE", text: "Tell the team: RED LIGHT + 3 CABLES. The clue appears in the Case Feed." },
  { role: "specialist" as Role, title: "MUTE: FIND THE MATCHING PICTURE", text: "In the manual, match 3 cables + red light. The picture says to cut the blue cable." },
  { role: "specialist" as Role, title: "MUTE: SEND THE ANSWER", text: "The blue cable is first. Send the number 1 to the team." },
  { role: "operator" as Role, title: "BLIND: LEARN WHAT A MISTAKE LOOKS LIKE", text: "For practice, click the middle cable. Everyone sees the error in the Case Feed." },
  { role: "operator" as Role, title: "BLIND: CUT THE CORRECT CABLE", text: "MUTE sent 1. Click the top cable. The diagonal gap means it is cut." },
] as const;

function TutorialCoachAction({ step, disabled, onAction }: { step: number; disabled: boolean; onAction: (action: TutorialAction, value?: number | string) => void }) {
  const run = () => {
    if (step === 0) onAction("begin");
    if (step === 1) onAction("inspect-blind");
    if (step === 2) onAction("observe-light");
    if (step === 3) onAction("deaf-message");
    if (step === 4) onAction("manual-rule");
    if (step === 5) onAction("mute-signal", 1);
    if (step === 6) onAction("practice-error", 1);
    if (step === 7) onAction("solve-cable", 0);
  };
  const content = [
    { label: "START THE PRACTICE", icon: <Play /> },
    { label: "SHOW WHAT BLIND CAN SEE", icon: <Eye /> },
    { label: "CLICK THE RED LIGHT", icon: <Light color="RED" /> },
    { label: "SEND: RED LIGHT + 3 CABLES", icon: <Send /> },
    { label: "CHOOSE THE BLUE-WIRE PICTURE", icon: <Scissors /> },
    { label: "SEND THE NUMBER 1", icon: <span className="tutorial-number-icon">1</span> },
    { label: "CUT THE MIDDLE CABLE", icon: <TriangleAlert /> },
    { label: "CUT THE TOP CABLE", icon: <Check /> },
  ][step];
  if (!content) return null;
  return <Button className="tutorial-next-action" disabled={disabled} onClick={run}><span className="tutorial-click-here"><MousePointer2 /> CLICK HERE</span><span className="tutorial-next-action-label">{content.icon}<b>{content.label}</b></span></Button>;
}

function TutorialManualRule({ active, solved, disabled, onChoose }: { active: boolean; solved: boolean; disabled: boolean; onChoose: () => void }) {
  return <div className="tutorial-manual-sheet" data-active={active} data-solved={solved}><div className="tutorial-manual-title"><Scissors /></div><div className="tutorial-manual-lookup"><CableCountDiagram count={3} /><span>+</span><Light color="RED" /><ArrowRight /></div><button type="button" onClick={onChoose} disabled={disabled} aria-label="Choose the three cable red light rule"><ManualWire color="BLUE" /><Scissors /></button><div className="tutorial-manual-other" aria-hidden="true"><CableCountDiagram count={4} /><Light color="YELLOW" /><ManualWire color="BLUE" /></div></div>;
}

function TutorialFeed({ entries, practiceMistakes }: { entries: TutorialFeedEntry[]; practiceMistakes: number }) {
  const streamRef = useRef<HTMLDivElement>(null);
  const newest = entries.at(-1)?.id;
  useEffect(() => { if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }, [newest]);
  return <aside className="tutorial-case-feed"><header><Radio /><b>CASE FEED</b><span><MessageCircle /> MESSAGES + EVENTS</span></header><div ref={streamRef}>{entries.map((entry) => <article key={entry.id} data-kind={entry.kind} data-role={entry.role ?? "system"}><span>{entry.role ? ROLE_META[entry.role].monkey : entry.kind === "error" ? "!" : entry.kind === "solved" ? "✓" : "●"}</span><p>{entry.text}</p></article>)}</div><footer><ShieldAlert /><span>{practiceMistakes}/3</span><small>In real rounds, errors show in everyone&apos;s Case Feed.</small></footer></aside>;
}

function TutorialExperience({ game, role, players, busy, onAction, onCursorMove }: { game: PublicGameView; role: Role; players: Player[]; busy: boolean; onAction: (action: TutorialAction, value?: number | string) => void; onCursorMove?: (point: CursorPoint) => void }) {
  const tutorial = game.tutorial;
  if (!tutorial) return null;
  const step = tutorial.step;
  const coach = TUTORIAL_COACH[Math.min(step, TUTORIAL_COACH.length - 1)];
  const requiredRole = step < TUTORIAL_COACH.length ? coach.role : null;
  const allowed = !requiredRole || requiredRole === role;
  const requiredPlayer = requiredRole ? players.find((player) => player.role === requiredRole) : null;
  const tutorialGame: PublicGameView = {
    ...game,
    serial: "TRAINING",
    activeModules: ["cable"],
    completed: tutorial.cable.solved ? 1 : 0,
    moduleCount: 1,
    modules: { ...game.modules, cable: tutorial.cable },
  };
  const blindCableAction = (_action: ModuleAction, value?: number | string) => {
    if (step === 6) onAction("practice-error", value);
    if (step === 7) onAction("solve-cable", value);
  };
  const loopStage = step <= 2 ? 0 : step === 3 ? 1 : step === 4 ? 2 : step === 5 ? 3 : 4;

  if (step >= 8) return <section className="tutorial-complete" role="status"><div><span>🍌</span><small>OBSERVE → COMMUNICATE → CHECK MANUAL → COMMUNICATE ANSWER → OPERATE</small><h2>TUTORIAL COMPLETE</h2><p>You now know the information chain. Work together and defuse the suitcase.</p><b>LEVEL 1 STARTING…</b></div></section>;

  return <section className="interactive-tutorial" data-step={step}>
    <header className="tutorial-coach-card"><div className="tutorial-coach-copy"><small>STEP {step + 1} OF 8</small><h2>{coach.title}</h2><p>{coach.text}</p></div><div className="tutorial-coach-action" data-your-turn={allowed}>{requiredRole ? <span>{allowed ? `YOUR TURN — YOU ARE ${ROLE_META[requiredRole].short}` : `${requiredPlayer?.name ?? ROLE_META[requiredRole].short}'S TURN — ${ROLE_META[requiredRole].short}`}</span> : <span>ANY PLAYER CAN START</span>}<TutorialCoachAction step={step} disabled={busy || !allowed} onAction={onAction} />{!allowed && requiredRole && <small>Wait here. {requiredPlayer?.name ?? `The ${ROLE_META[requiredRole].short} player`} must click the big button.</small>}</div></header>
    <div className="tutorial-role-grid">
      <section className="tutorial-role-panel blind-tutorial-panel" data-focus={requiredRole === "operator"}><header><span>🙈</span><div><b>BLIND — OPERATOR</b><small>CLICKS THE CASE · COLORS HIDDEN</small></div>{requiredRole === "operator" && <strong>DO THIS NOW</strong>}</header><div className="tutorial-role-body tutorial-blind-bomb" data-cable-step={step}><SuitcaseBomb game={tutorialGame} vision="blind" act={allowed && (step === 6 || step === 7) ? blindCableAction : undefined} busy={busy} onCursorMove={role === "operator" ? onCursorMove : undefined} />{step === 6 && <div className="tutorial-wire-pointer tutorial-wire-pointer-middle"><ArrowLeft /><b>MIDDLE</b></div>}{step === 7 && <div className="tutorial-wire-pointer tutorial-wire-pointer-top"><ArrowLeft /><b>TOP</b></div>}</div></section>
      <section className="tutorial-role-panel deaf-tutorial-panel" data-focus={requiredRole === "observer"}><header><span>🙉</span><div><b>DEAF — OBSERVER</b><small>SEES COLORS + CURSOR · NO MANUAL</small></div>{requiredRole === "observer" && <strong>DO THIS NOW</strong>}</header><div className="tutorial-role-body tutorial-deaf-bomb"><SuitcaseBomb game={tutorialGame} vision="color" cursor={game.operatorCursor} />{step === 2 && <div className="tutorial-light-target" aria-hidden="true"><ArrowDown /><Light color="RED" /><b>RED LIGHT</b></div>}{step === 3 && <div className="tutorial-deaf-message" aria-hidden="true"><Send /><b>RED + 3</b></div>}</div></section>
      <section className="tutorial-role-panel mute-tutorial-panel" data-focus={requiredRole === "specialist"}><header><span>🙊</span><div><b>MUTE — MANUAL</b><small>READS PICTURES · BOMB HIDDEN</small></div>{requiredRole === "specialist" && <strong>DO THIS NOW</strong>}</header><div className="tutorial-role-body"><TutorialManualRule active={step === 4} solved={step > 4} disabled={busy || !allowed || step !== 4} onChoose={() => onAction("manual-rule")} /><div className="tutorial-sign-board" data-active={step === 5}><div className="tutorial-sign-sample">{step > 5 ? "1" : "?"}</div><div><button type="button" disabled={busy || !allowed || step !== 5} onClick={() => onAction("mute-signal", 1)}>1</button>{["👍", "👎", "🔁"].map((symbol) => <button type="button" key={symbol} disabled aria-label={`${symbol} sign example`}>{symbol}</button>)}</div><small>0–10 · 👍 👎 🔁 👆 👇 👈 👉</small></div></div></section>
    </div>
    <div className="tutorial-lower"><TutorialFeed entries={tutorial.feed} practiceMistakes={tutorial.practiceMistakes} /><div className="tutorial-chain" aria-label="Core gameplay information chain">{["OBSERVE", "COMMUNICATE", "CHECK MANUAL", "COMMUNICATE ANSWER", "OPERATE"].map((label, index) => <div key={label} data-active={index === loopStage}><span>{index === 0 ? "🙉" : index === 2 || index === 3 ? "🙊" : index === 4 ? "🙈" : "💬"}</span><b>{label}</b>{index < 4 && <ArrowRight />}</div>)}</div></div>
  </section>;
}

function RoundWaitingRoom({ data, onReady, onSwitchRole, busy, developer }: { data: RoomSnapshot; onReady: () => void; onSwitchRole: (role: Role) => void; busy: boolean; developer?: boolean }) {
  const game = data.room.game;
  const retry = game.lastResult === "timeout" || game.lastResult === "strikes" || game.lastResult === "new";
  const nextLevel = game.lastResult === "cleared" ? nextLevelAfterClear(game.level) : game.level;
  const next = levelDefinition(nextLevel);
  const self = data.room.players.find((player) => player.role === data.player.role);
  const heading = game.lastResult === "timeout" ? "TIME EXPIRED" : game.lastResult === "strikes" ? "THREE STRIKES" : game.lastResult === "cleared" ? (game.level === 10 ? "CAMPAIGN CLEAR" : game.level === 11 ? "INFINITE CASE CLEAR" : `LEVEL ${game.level} CLEAR`) : "CAMPAIGN READY";
  const levelLabel = next.level === 11 ? "∞" : String(next.level);
  return <section className="round-waiting-room"><div className="waiting-result" data-result={game.lastResult}><span>{game.lastResult === "cleared" ? "🍌" : game.lastResult === "timeout" ? "⏱" : game.lastResult === "strikes" ? "💥" : "💣"}</span><small>{retry ? "NEXT ATTEMPT" : "NEXT LEVEL"}</small><h2>{heading}</h2></div><div className="next-level-card"><div><small>LEVEL {levelLabel} · {formatTime(next.durationMs)}</small><h3>{next.title}</h3></div><div className="next-modules">{next.modules.map((module) => { const MetaIcon = MODULE_META[module].icon; return <span key={module}><MetaIcon />{MODULE_META[module].label}</span>; })}{Boolean(next.randomCount) && <span className="random-module-chip"><Shuffle />{next.randomCount} RANDOM</span>}</div></div><div className="role-switch-panel"><div className="role-switch-note"><b>CHOOSE YOUR ROLE</b><span>Select another seat to swap. A swap clears everyone&apos;s READY.</span></div><div className="ready-seat-grid">{ROLES.map((role) => { const player = data.room.players.find((candidate) => candidate.role === role); const current = role === data.player.role; return <button type="button" key={role} data-ready={player?.ready} data-current={current} disabled={busy || current} onClick={() => onSwitchRole(role)} aria-label={current ? `You are ${ROLE_META[role].name}` : `Swap with ${player?.name ?? ROLE_META[role].name}`}><span>{ROLE_META[role].monkey}</span><div><small>{ROLE_META[role].short}</small><b>{player?.name ?? "OPEN"}</b></div><strong>{current ? "YOU" : player?.ready ? "READY · SWAP" : "SWAP"}</strong></button>; })}</div></div><div className="waiting-actions"><TutorialButton className="waiting-tutorial-button" label="How to play" /><Button className="ready-button" disabled={busy || (!developer && self?.ready)} onClick={onReady}>{busy ? "UPDATING…" : developer ? "READY ALL & START" : self?.ready ? `WAITING FOR ${3 - data.room.readyCount}` : "I'M READY"}<Play /></Button></div><p>The timer starts only when all three monkeys are ready.</p></section>;
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

type DeveloperControls = {
  role: Role;
  level: number;
  onRoleChange: (role: Role) => void;
  onLevelChange: (level: number) => void;
  onAction: (action: ModuleAction, value?: number | string) => void;
  onTutorialAction: (action: TutorialAction, value?: number | string) => void;
  onChat: (symbol: string) => void;
  onMessage: (text: string) => void;
  onCursorMove: (point: CursorPoint) => void;
  onReady: () => void;
  onWaitingPreview: () => void;
  onTutorialPreview: () => void;
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
  const coachModules = game.phase === "playing" && prestart === 0
    ? game.activeModules.filter((module) => !game.modules[module]?.solved && !learnedTips.has(`${role}:${module}`))
    : [];

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

  const tutorialAct = useCallback(async (tutorialAction: TutorialAction, value?: number | string) => {
    if (developer) return developer.onTutorialAction(tutorialAction, value);
    setBusy(true); setError("");
    try { onData(await requestRoom({ action: "tutorial-action", tutorialAction, value })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tutorial action did not respond."); }
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
    if (developer || role !== "operator" || (game.phase !== "playing" && game.phase !== "tutorial")) return;
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
    <header className="game-header"><div className="game-header-start"><Link className="game-brand" href="/"><Bomb /><b>BOMBA<span>NANA</span></b></Link>{onLeave && !developer && <button type="button" className="leave-room-button" onClick={onLeave} aria-label="Leave room"><LogOut /><span>LEAVE</span></button>}</div><div className="room-pill"><Users /> {developer ? "TEST MODE" : "ROOM"} <b>{data.room.code}</b></div><div className="level-pill">{game.phase === "tutorial" ? <b>TUTORIAL</b> : <>LEVEL <b>{game.level === 11 ? "∞" : game.level}</b></>}</div><div className="timer-block" data-urgent={remaining < 30_000 && game.phase === "playing"}><Clock3 /><div><strong>{game.phase === "waiting" ? "READY" : prestart > 0 ? `0:0${prestart}` : formatTime(remaining)}</strong><Progress value={game.phase === "waiting" ? 100 : timePercent} /></div></div><div className="strike-block"><ShieldAlert />{Array.from({ length: game.maxMistakes }, (_, index) => <i key={index} data-hit={game.phase === "tutorial" ? index < (game.tutorial?.practiceMistakes ?? 0) : index < game.mistakes} />)}</div></header>
    <section className="role-banner"><div className="role-identity"><span>{meta.monkey}</span><div><small>YOUR ASSIGNMENT</small><h1>{meta.name}</h1></div></div><p><RoleIcon />{meta.ability}</p><RoleSenses role={role} compact /></section>
    {developer && <section className="developer-toolbar"><div className="developer-heading"><Wrench /><div><b>DEVELOPER MODE</b><span>Timer paused · shared test bomb</span></div></div><div className="developer-role-switcher">{ROLES.map((item) => <Button key={item} variant="outline" data-active={developer.role === item} onClick={() => developer.onRoleChange(item)}><span>{ROLE_META[item].monkey}</span>{ROLE_META[item].short}</Button>)}</div><div className="developer-level-switcher">{LEVELS.map(({ level }) => <button key={level} data-active={developer.level === level && game.phase !== "tutorial"} onClick={() => developer.onLevelChange(level)}>{level === 11 ? "∞" : level}</button>)}</div><details className="developer-solution"><summary>Reveal solution</summary><div>{developer.solution.map((line) => <span key={line}>{line}</span>)}</div></details><div className="developer-actions"><Button variant="outline" data-active={game.phase === "tutorial"} onClick={developer.onTutorialPreview}>Tutorial</Button><Button variant="outline" onClick={developer.onWaitingPreview}>Ready room</Button><Button variant="outline" onClick={developer.onReset}><RefreshCw /> Reset</Button><Button variant="outline" onClick={developer.onExit}><X /></Button></div></section>}
    <div className="progress-rail"><span>{game.phase === "tutorial" ? `${game.tutorial?.step ?? 0}/8 STEPS` : `${game.completed}/${game.moduleCount} MODULES`}</span><Progress value={game.phase === "tutorial" ? ((game.tutorial?.step ?? 0) / 8) * 100 : (game.completed / game.moduleCount) * 100} /><span>{game.phase === "tutorial" ? "INFORMATION CHAIN" : game.levelTitle}</span></div>
    {banner && <p className="room-notice game-notice" role="status">{banner}</p>}
    {error && <p className="game-error">{error}</p>}
    {game.phase === "playing" && prestart > 0 && <RoleCountdownCard role={role} seconds={prestart} />}
    {game.phase === "waiting" ? <RoundWaitingRoom data={data} onReady={ready} onSwitchRole={switchRole} busy={busy} developer={Boolean(developer)} /> : game.phase === "tutorial" ? <TutorialExperience game={game} role={role} players={data.room.players} busy={busy} onAction={tutorialAct} onCursorMove={role === "operator" ? reportCursor : undefined} /> : <section className="game-workspace" data-role={role}>
      {coachModules.length > 0 && <CoachStrip role={role} modules={coachModules} onDismiss={(module) => markTipsLearned([`${role}:${module}`], !developer)} />}
      {role === "operator" && <SuitcaseBomb game={game} vision="blind" act={act} busy={busy || prestart > 0} onCursorMove={reportCursor} />}
      {role === "observer" && <ObserverPanel game={game} feed={caseFeed} />}
      {role === "specialist" && <SpecialistPanel key={`${game.level}-${game.activeModules.join("-")}`} game={game} />}
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
  const loadTutorial = useCallback(() => { setState(createTutorialGameState(true)); setRole("operator"); setCursor({ x: 0.55, y: 0.72, active: true }); setMuteSignal({ symbol: "", updatedAt: 0, active: false }); }, []);
  const act = useCallback((moduleAction: ModuleAction, value?: number | string) => {
    setState((current) => {
      const next = structuredClone(current);
      applyModuleAction(next, moduleAction, value);
      const done = completedModules(next) === activeModules(next).length;
      if (done || next.mistakes >= next.maxMistakes) {
        next.phase = "waiting";
        next.lastResult = done ? "cleared" : "strikes";
        next.startAt = null;
        next.messages = [];
      }
      return next;
    });
  }, []);

  const tutorialAct = useCallback((tutorialAction: TutorialAction, value?: number | string) => {
    setState((current) => {
      const next = structuredClone(current);
      applyTutorialAction(next, role, tutorialAction, value);
      return next;
    });
    if (tutorialAction === "mute-signal") setMuteSignal({ symbol: String(value ?? ""), updatedAt: Date.now(), active: true });
  }, [role]);

  useEffect(() => {
    if (state.phase !== "tutorial" || !state.tutorial?.completedAt) return;
    const timer = window.setTimeout(() => setState(createDeveloperBomb(1)), 4_000);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.tutorial?.completedAt]);

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
        code: "LOCAL", status: "playing", version: 1, isHost: true, readyCount: 0,
        players: ROLES.map((item) => ({ name: item === role ? "Test Player" : `${ROLE_META[item].short} Preview`, role: item, online: true, ready: false })),
        game: role === "observer" || state.phase === "tutorial" ? { ...roleGame, operatorCursor: cursor, muteSignal } : roleGame,
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
    return lines;
  }, [state]);

  return <Game data={data} onData={() => undefined} developer={{ role, level: state.level, onRoleChange: setRole, onLevelChange: loadLevel, onAction: act, onTutorialAction: tutorialAct, onChat: (symbol) => setMuteSignal({ symbol, updatedAt: Date.now(), active: true }), onMessage: (text) => role !== "specialist" && setState((current) => { const seq = (current.feedSeq ?? 0) + 1; return { ...current, feedSeq: seq, messages: [...current.messages, { id: makeId(), senderId: `developer-${role}`, senderRole: role, senderName: "Test Player", text, sentAt: Date.now(), seq }].slice(-40) }; }), onCursorMove: (point) => point.active && setCursor(point), onReady: ready, onWaitingPreview: () => setState((current) => ({ ...current, phase: "waiting", lastResult: "cleared", startAt: null, messages: [] })), onTutorialPreview: loadTutorial, onReset: () => state.phase === "tutorial" ? loadTutorial() : loadLevel(state.level), onExit, solution }} />;
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
  const needsLive = Boolean(connection && data && (data.player.role === "observer" || data.room.game.phase === "tutorial"));
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
