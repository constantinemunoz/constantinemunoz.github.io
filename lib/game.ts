export const ROLES = ["operator", "observer", "specialist"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { name: string; monkey: string; short: string; ability: string }> = {
  operator: {
    name: "Blind Operator",
    monkey: "🙈",
    short: "BLIND",
    ability: "Feel the Braille and operate every control. Colors and screen details stay hidden.",
  },
  observer: {
    name: "Deaf Observer",
    monkey: "🙉",
    short: "DEAF",
    ability: "See the live bomb, its colors, the Blind cursor, and the Mute monkey's signs.",
  },
  specialist: {
    name: "Mute Specialist",
    monkey: "🙊",
    short: "MUTE",
    ability: "Read the complete field manual and send signs or numbers. The bomb stays hidden.",
  },
};

export type LightColor = "RED" | "YELLOW" | "GREEN" | "BLUE";
export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
export type ModuleKey = "cable" | "slider" | "direction" | "calculator" | "piano" | "symbol" | "soundboard";
export type SoundGroup = "LOW" | "MID" | "HIGH";
export type SymbolKey = "PHI" | "STAR" | "HOURGLASS" | "TRIANGLE";
export type RoundPhase = "waiting" | "playing";
export type RoundResult = "new" | "cleared" | "timeout" | "strikes";
export type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: Role;
  senderName: string;
  text: string;
  sentAt: number;
  // Position in the case feed, shared with action log entries so chats and
  // game notices appear in the order they happened.
  seq?: number;
};

export type ActionLogEntry = { text: string; seq: number; tone?: "error" };

// A level lists its fixed modules plus random picks, each drawn from a pool
// without repeating a module already in the suitcase.
export type RandomPick = { pool: ModuleKey[]; count: number };
export type LevelDefinition = {
  level: number;
  title: string;
  modules: ModuleKey[];
  durationMs: number;
  random?: RandomPick[];
};

// The four "easy" modules: one clue each and a single answer.
export const EASY_MODULES: ModuleKey[] = ["cable", "slider", "direction", "calculator"];
// The "medium" modules: a hidden step (a beep or a mode light) before the answer.
export const MEDIUM_MODULES: ModuleKey[] = ["piano", "symbol", "soundboard"];
export const CORE_MODULES = EASY_MODULES;
export const ALL_MODULES: ModuleKey[] = [...EASY_MODULES, ...MEDIUM_MODULES];
export const LAST_CAMPAIGN_LEVEL = 15;
export const INFINITE_LEVEL = 16;
const easy = (count: number): RandomPick => ({ pool: EASY_MODULES, count });
const medium = (count: number): RandomPick => ({ pool: MEDIUM_MODULES, count });

// Level 0 is the optional practice round: one fixed cable, no timer, no strikes.
export const PRACTICE_CABLE = { count: 3 as const, colors: ["BLUE", "RED", "GREEN"] as LightColor[], light: "RED" as LightColor, targetColor: "BLUE" as LightColor };

export const LEVELS: LevelDefinition[] = [
  { level: 0, title: "PRACTICE ROUND", modules: ["cable"], durationMs: 0 },
  { level: 1, title: "FIRST CUT", modules: ["cable"], durationMs: 150_000 },
  { level: 2, title: "COLOR ORDER", modules: ["slider"], durationMs: 150_000 },
  { level: 3, title: "CROSSED CIRCUITS", modules: ["cable", "slider"], durationMs: 150_000 },
  { level: 4, title: "TURN SIGNAL", modules: ["slider", "direction"], durationMs: 180_000 },
  { level: 5, title: "DO THE MATH", modules: ["slider", "calculator"], durationMs: 180_000 },
  { level: 6, title: "TRIPLE THREAT", modules: ["calculator", "cable", "slider"], durationMs: 210_000 },
  { level: 7, title: "FULL SUITCASE", modules: ["cable", "slider", "direction", "calculator"], durationMs: 240_000 },
  { level: 8, title: "BEEP TEST", modules: ["symbol"], random: [easy(1)], durationMs: 210_000 },
  { level: 9, title: "KEY CHANGE", modules: ["piano"], random: [easy(1)], durationMs: 210_000 },
  { level: 10, title: "GRAND FINALE", modules: ["symbol", "piano"], durationMs: 240_000 },
  { level: 11, title: "SOUND CHECK", modules: ["soundboard", "symbol"], durationMs: 240_000 },
  { level: 12, title: "MIXED SIGNALS", modules: ["soundboard"], random: [easy(1), medium(1)], durationMs: 240_000 },
  { level: 13, title: "DOUBLE TROUBLE", modules: [], random: [medium(2), easy(1)], durationMs: 240_000 },
  { level: 14, title: "MEDIUM RARE", modules: [], random: [medium(3)], durationMs: 240_000 },
  { level: 15, title: "LAST STAND", modules: [], random: [medium(2), easy(2)], durationMs: 240_000 },
  { level: INFINITE_LEVEL, title: "INFINITE MODE", modules: [], random: [{ pool: ALL_MODULES, count: 4 }], durationMs: 240_000 },
];

export const CABLE_RULES: Record<3 | 4, Record<LightColor, LightColor>> = {
  3: { RED: "BLUE", YELLOW: "RED", GREEN: "YELLOW", BLUE: "GREEN" },
  4: { RED: "GREEN", YELLOW: "BLUE", GREEN: "RED", BLUE: "YELLOW" },
};

export const DIRECTION_RULES: Record<number, Record<LightColor, Direction>> = {
  1: { RED: "UP", YELLOW: "DOWN", GREEN: "LEFT", BLUE: "RIGHT" },
  4: { RED: "UP", YELLOW: "DOWN", GREEN: "LEFT", BLUE: "RIGHT" },
  2: { RED: "RIGHT", YELLOW: "LEFT", GREEN: "UP", BLUE: "DOWN" },
  7: { RED: "RIGHT", YELLOW: "LEFT", GREEN: "UP", BLUE: "DOWN" },
  5: { RED: "LEFT", YELLOW: "UP", GREEN: "RIGHT", BLUE: "UP" },
  3: { RED: "LEFT", YELLOW: "UP", GREEN: "RIGHT", BLUE: "UP" },
  6: { RED: "UP", YELLOW: "RIGHT", GREEN: "DOWN", BLUE: "LEFT" },
  9: { RED: "UP", YELLOW: "RIGHT", GREEN: "DOWN", BLUE: "LEFT" },
};

export type SliderTest = "ODD" | "SET_A" | "GT_5" | "GT_RED";
export const SLIDER_NUMBER_GROUPS = {
  SET_A: {
    up: [1, 2, 6, 9],
    down: [3, 4, 5, 7, 8],
  },
  GT_5: {
    up: [6, 7, 8, 9],
    down: [1, 2, 3, 4, 5],
  },
} as const;

export const SLIDER_RULES: Array<{ lights: LightColor[]; tests: SliderTest[] }> = [
  { lights: ["RED", "GREEN", "BLUE", "YELLOW"], tests: ["ODD", "SET_A", "GT_5", "GT_RED"] },
  { lights: ["GREEN", "BLUE", "YELLOW", "RED"], tests: ["GT_5", "ODD", "GT_RED", "SET_A"] },
  { lights: ["RED", "YELLOW", "BLUE", "GREEN"], tests: ["GT_5", "GT_RED", "SET_A", "ODD"] },
];

export const SLIDER_TARGET_PATTERNS = [
  "DDDU", "DDUD", "DDUU", "DUDD", "DUUD", "DUUU",
  "UDDD", "UDDU", "UDUU", "UUDD", "UUDU", "UUUD",
] as const;

export const CALCULATOR_RULES: Record<"ODD" | "EVEN", Record<LightColor, number>> = {
  ODD: { RED: 1, YELLOW: 3, GREEN: 5, BLUE: 7 },
  EVEN: { RED: 2, YELLOW: 4, GREEN: 6, BLUE: 8 },
};

export const PIANO_RULES: Record<LightColor, Record<LightColor, number>> = {
  RED: { RED: 1, YELLOW: 3, GREEN: 5, BLUE: 7 },
  YELLOW: { RED: 2, YELLOW: 4, GREEN: 6, BLUE: 8 },
  GREEN: { RED: 8, YELLOW: 6, GREEN: 4, BLUE: 2 },
  BLUE: { RED: 7, YELLOW: 5, GREEN: 3, BLUE: 1 },
};

// Symbol dial: the lit seed light (1 to 4) picks the row; the symbol the
// pointer stops on (the one that beeps) picks the button color.
export const SYMBOLS: SymbolKey[] = ["PHI", "STAR", "HOURGLASS", "TRIANGLE"];
export const SYMBOL_NAMES: Record<SymbolKey, string> = { PHI: "phi", STAR: "star", HOURGLASS: "hourglass", TRIANGLE: "triangle" };
export const SYMBOL_RULES: Record<1 | 2 | 3 | 4, Record<SymbolKey, LightColor>> = {
  1: { PHI: "RED", STAR: "BLUE", HOURGLASS: "YELLOW", TRIANGLE: "GREEN" },
  2: { PHI: "GREEN", STAR: "RED", HOURGLASS: "BLUE", TRIANGLE: "YELLOW" },
  3: { PHI: "YELLOW", STAR: "GREEN", HOURGLASS: "RED", TRIANGLE: "BLUE" },
  4: { PHI: "BLUE", STAR: "YELLOW", HOURGLASS: "GREEN", TRIANGLE: "RED" },
};

// Soundboard: nine buttons, each with a Braille number (BLIND) and a color
// (DEAF). One of them beeps on BLIND's screen when pressed. Its color picks the
// manual page and its number group picks the grid: press the marked positions
// (1 is top left, 9 is bottom right), in any order.
export const SOUND_GROUPS: Record<SoundGroup, number[]> = { LOW: [1, 2, 3], MID: [4, 5, 6], HIGH: [7, 8, 9] };
export const SOUNDBOARD_RULES: Record<LightColor, Record<SoundGroup, number[]>> = {
  RED: { LOW: [1, 5, 9], MID: [3, 5, 7], HIGH: [2, 5, 8] },
  YELLOW: { LOW: [1, 2, 3], MID: [4, 5, 6], HIGH: [7, 8, 9] },
  GREEN: { LOW: [1, 4, 7], MID: [3, 6, 9], HIGH: [1, 3, 8] },
  BLUE: { LOW: [2, 4, 6], MID: [4, 6, 8], HIGH: [1, 7, 9] },
};
export function soundGroup(number: number): SoundGroup {
  return number <= 3 ? "LOW" : number <= 6 ? "MID" : "HIGH";
}

export const MANUAL = {
  cable: CABLE_RULES,
  direction: DIRECTION_RULES,
  slider: SLIDER_RULES,
  calculator: CALCULATOR_RULES,
  piano: PIANO_RULES,
  symbol: SYMBOL_RULES,
  soundboard: SOUNDBOARD_RULES,
};

export type GameState = {
  serial: string;
  level: number;
  phase: RoundPhase;
  lastResult: RoundResult;
  startAt: number | null;
  durationMs: number;
  mistakes: number;
  maxMistakes: number;
  actionLog: ActionLogEntry[];
  feedSeq: number;
  chatEnabled: boolean;
  // True when the campaign starts with the Level 0 practice round.
  tutorialEnabled: boolean;
  // When the Mute player last sent a sign and the Blind player last touched a
  // control (server clock). The screens use these to show which step of the
  // relay the team is on and to notice when everyone has gone quiet.
  lastSignalAt: number | null;
  lastActionAt: number | null;
  messages: ChatMessage[];
  activeModuleKeys: ModuleKey[];
  modules: {
    cable: {
      count: 3 | 4;
      colors: LightColor[];
      light: LightColor;
      targetColor: LightColor;
      cut: number | null;
      solved: boolean;
    };
    slider: {
      ruleIndex: number;
      lights: LightColor[];
      braille: number[];
      target: boolean[];
      current: boolean[];
      solved: boolean;
    };
    direction: {
      light: LightColor;
      braille: number;
      target: Direction;
      pressed: Direction | null;
      solved: boolean;
    };
    calculator: {
      left: number;
      right: number;
      operator: "+" | "−";
      answer: number;
      entered: string;
      stage: "entry" | "confirm";
      light: LightColor;
      targetDigit: number;
      pressed: number | null;
      solved: boolean;
    };
    piano: {
      modeLight: LightColor;
      melody: LightColor[];
      target: number[];
      pressed: number[];
      solved: boolean;
    };
    symbol: {
      seed: 1 | 2 | 3 | 4;
      target: SymbolKey;
      pointer: number;
      buttons: LightColor[];
      targetColor: LightColor;
      pressed: number | null;
      solved: boolean;
    };
    soundboard: {
      numbers: number[];
      colors: LightColor[];
      beeper: number;
      found: boolean;
      target: number[];
      pressed: number[];
      solved: boolean;
    };
  };
};

const COLORS: LightColor[] = ["RED", "YELLOW", "GREEN", "BLUE"];
const BRAILLE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

// crypto.randomUUID only exists in secure contexts (https or localhost). The
// room host runs this code in a browser, so fall back instead of throwing when
// someone opens a dev server over plain http on their local network.
export function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const shuffled = <T,>(items: readonly T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

function createCableModule() {
  const count = (Math.random() > 0.5 ? 4 : 3) as 3 | 4;
  const light = pick(COLORS);
  const targetColor = CABLE_RULES[count][light];
  const extras = shuffled(COLORS.filter((color) => color !== targetColor)).slice(0, count - 1);
  return { count, colors: shuffled([targetColor, ...extras]), light, targetColor, cut: null, solved: false };
}

function sliderTarget(test: SliderTest, number: number, redNumber: number) {
  if (test === "ODD") return number % 2 === 1;
  if (test === "SET_A") return (SLIDER_NUMBER_GROUPS.SET_A.up as readonly number[]).includes(number);
  if (test === "GT_5") return (SLIDER_NUMBER_GROUPS.GT_5.up as readonly number[]).includes(number);
  return number > redNumber;
}

function createSliderModule() {
  const ruleIndex = Math.floor(Math.random() * SLIDER_RULES.length);
  const rule = SLIDER_RULES[ruleIndex];
  const desiredPattern = pick(SLIDER_TARGET_PATTERNS);
  let fallbackBraille = shuffled(BRAILLE_NUMBERS).slice(0, 4);

  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const braille = shuffled(BRAILLE_NUMBERS).slice(0, 4);
    const redNumber = braille[rule.lights.indexOf("RED")];
    const target = rule.tests.map((test, index) => sliderTarget(test, braille[index], redNumber));
    const pattern = target.map((up) => up ? "U" : "D").join("");
    fallbackBraille = braille;
    if (pattern === desiredPattern) {
      return { ruleIndex, lights: [...rule.lights], braille, target, current: [false, false, false, false], solved: false };
    }
  }

  const redNumber = fallbackBraille[rule.lights.indexOf("RED")];
  return {
    ruleIndex,
    lights: [...rule.lights],
    braille: fallbackBraille,
    target: rule.tests.map((test, index) => sliderTarget(test, fallbackBraille[index], redNumber)),
    current: [false, false, false, false],
    solved: false,
  };
}

function createDirectionModule() {
  const braille = pick([1, 2, 3, 4, 5, 6, 7, 9]);
  const light = pick(COLORS);
  return { light, braille, target: DIRECTION_RULES[braille][light], pressed: null, solved: false };
}

function createCalculatorModule() {
  const subtract = Math.random() > 0.5;
  const left = subtract ? Math.floor(25 + Math.random() * 70) : Math.floor(8 + Math.random() * 42);
  const right = subtract
    ? Math.floor(2 + Math.random() * Math.max(2, left - 3))
    : Math.floor(2 + Math.random() * Math.min(40, 98 - left));
  const answer = subtract ? left - right : left + right;
  const light = pick(COLORS);
  const parity = answer % 2 === 0 ? "EVEN" : "ODD";
  return {
    left,
    right,
    operator: subtract ? ("−" as const) : ("+" as const),
    answer,
    entered: "",
    stage: "entry" as const,
    light,
    targetDigit: CALCULATOR_RULES[parity][light],
    pressed: null,
    solved: false,
  };
}

function createPianoModule() {
  const modeLight = pick(COLORS);
  const melody = Array.from({ length: 4 }, () => pick(COLORS));
  return {
    modeLight,
    melody,
    target: melody.map((color) => PIANO_RULES[modeLight][color]),
    pressed: [] as number[],
    solved: false,
  };
}

function createSymbolModule() {
  const seed = pick([1, 2, 3, 4] as const);
  const target = pick(SYMBOLS);
  const targetColor = SYMBOL_RULES[seed][target];
  const extras = shuffled(COLORS.filter((color) => color !== targetColor)).slice(0, 2);
  return {
    seed,
    target,
    pointer: Math.floor(Math.random() * SYMBOLS.length),
    buttons: shuffled([targetColor, ...extras]),
    targetColor,
    pressed: null,
    solved: false,
  };
}

function shuffledNumbers() {
  return shuffled(BRAILLE_NUMBERS);
}

export function createSoundboardModule() {
  const numbers = shuffledNumbers();
  const colors = Array.from({ length: 9 }, () => pick(COLORS));
  const beeper = Math.floor(Math.random() * 9);
  return {
    numbers,
    colors,
    beeper,
    found: false,
    target: SOUNDBOARD_RULES[colors[beeper]][soundGroup(numbers[beeper])].map((position) => position - 1),
    pressed: [] as number[],
    solved: false,
  };
}

export function levelDefinition(level: number) {
  return LEVELS.find((definition) => definition.level === level) ?? LEVELS.find((definition) => definition.level === 1)!;
}

export function nextLevelAfterClear(level: number) {
  return level >= LAST_CAMPAIGN_LEVEL ? INFINITE_LEVEL : level + 1;
}

export function resolveLevelModules(definition: LevelDefinition) {
  const chosen = [...definition.modules];
  for (const { pool, count } of definition.random ?? []) {
    chosen.push(...shuffled(pool.filter((module) => !chosen.includes(module))).slice(0, count));
  }
  return chosen;
}

export function nextFeedSeq(state: GameState) {
  state.feedSeq = (state.feedSeq ?? 0) + 1;
  return state.feedSeq;
}

export function logAction(state: GameState, text: string, tone?: "error") {
  state.actionLog.push(tone ? { text, seq: nextFeedSeq(state), tone } : { text, seq: nextFeedSeq(state) });
}

// Starts a fresh case feed with a single notice.
export function resetLog(state: GameState, text: string) {
  state.actionLog = [];
  logAction(state, text);
}

const LEGACY_ERROR = /wrong|rejected|incorrect|strike|timed out|time expired/i;

// Rooms saved before the feed had sequence numbers stored plain strings.
export function normalizeFeed(state: GameState) {
  const log = (state.actionLog ?? []) as Array<ActionLogEntry | string>;
  state.actionLog = log.map((entry) => (typeof entry === "string" ? (LEGACY_ERROR.test(entry) ? { text: entry, seq: 0, tone: "error" as const } : { text: entry, seq: 0 }) : entry));
  state.feedSeq = Math.max(state.feedSeq ?? 0, ...state.actionLog.map((entry) => entry.seq), ...(state.messages ?? []).map((message) => message.seq ?? 0));
  state.lastSignalAt ??= null;
  state.lastActionAt ??= null;
  state.modules.symbol ??= createSymbolModule();
  state.modules.soundboard ??= createSoundboardModule();
  if ((state.phase as string) === "tutorial") state.phase = "waiting";
  return state;
}

export function createGameState(level = 1, phase: RoundPhase = "waiting", lastResult: RoundResult = "new", chatEnabled = false, messages: ChatMessage[] = [], tutorialEnabled = false): GameState {
  const definition = levelDefinition(level);
  const keptMessages = [...messages].slice(-40);
  const startSeq = Math.max(0, ...keptMessages.map((message) => message.seq ?? 0)) + 1;
  const practice = definition.level === 0;
  return {
    serial: practice ? "PRACTICE" : `SN-${Math.floor(10000 + Math.random() * 90000)}`,
    level: definition.level,
    phase,
    lastResult,
    startAt: null,
    durationMs: definition.durationMs,
    mistakes: 0,
    maxMistakes: 3,
    actionLog: [{ text: phase === "waiting" ? `Level ${definition.level} staged. Waiting for all three monkeys.` : `Level ${definition.level} armed.`, seq: startSeq }],
    feedSeq: startSeq,
    chatEnabled,
    tutorialEnabled,
    lastSignalAt: null,
    lastActionAt: null,
    messages: keptMessages,
    activeModuleKeys: resolveLevelModules(definition),
    modules: {
      cable: practice ? { ...PRACTICE_CABLE, colors: [...PRACTICE_CABLE.colors], cut: null, solved: false } : createCableModule(),
      slider: createSliderModule(),
      direction: createDirectionModule(),
      calculator: createCalculatorModule(),
      piano: createPianoModule(),
      symbol: createSymbolModule(),
      soundboard: createSoundboardModule(),
    },
  };
}

export function activeModules(state: GameState) {
  const valid = Array.isArray(state.activeModuleKeys)
    ? state.activeModuleKeys.filter((module): module is ModuleKey => ALL_MODULES.includes(module))
    : [];
  return valid.length > 0 ? valid : resolveLevelModules(levelDefinition(state.level));
}

export function completedModules(state: GameState) {
  return activeModules(state).filter((module) => state.modules[module].solved).length;
}

export function publicStateForRole(state: GameState, role: Role, playerId = "") {
  const definition = levelDefinition(state.level);
  const enabledModules = activeModules(state);
  const visibleMessages = state.chatEnabled
    ? (role === "observer" ? state.messages.filter((message) => message.senderId === playerId) : state.messages)
        .map((message) => ({
          id: message.id,
          senderRole: message.senderRole,
          senderName: message.senderName,
          text: message.text,
          sentAt: message.sentAt,
          seq: message.seq ?? 0,
        }))
    : [];
  const common = {
    serial: role === "observer" ? state.serial : role === "operator" ? "SN-•••••" : null,
    level: state.level,
    levelTitle: definition.title,
    activeModules: enabledModules,
    phase: state.phase,
    lastResult: state.lastResult,
    startAt: state.startAt,
    durationMs: state.durationMs,
    mistakes: state.mistakes,
    maxMistakes: state.maxMistakes,
    // Every role sees the full feed, including the red wrong-answer alerts.
    actionLog: state.actionLog.slice(-8),
    completed: completedModules(state),
    moduleCount: enabledModules.length,
    chatEnabled: state.chatEnabled,
    tutorialEnabled: Boolean(state.tutorialEnabled),
    lastSignalAt: state.lastSignalAt ?? null,
    lastActionAt: state.lastActionAt ?? null,
    messages: visibleMessages,
  };

  if (role === "observer") {
    return {
      ...common,
      view: "observer" as const,
      modules: {
        cable: { count: state.modules.cable.count, colors: state.modules.cable.colors, light: state.modules.cable.light, cut: state.modules.cable.cut, solved: state.modules.cable.solved },
        slider: { lights: state.modules.slider.lights, current: state.modules.slider.current, solved: state.modules.slider.solved },
        direction: { light: state.modules.direction.light, pressed: state.modules.direction.pressed, solved: state.modules.direction.solved },
        calculator: {
          expression: `${state.modules.calculator.left} ${state.modules.calculator.operator} ${state.modules.calculator.right}`,
          entered: state.modules.calculator.entered,
          stage: state.modules.calculator.stage,
          light: state.modules.calculator.stage === "confirm" ? state.modules.calculator.light : null,
          pressed: state.modules.calculator.pressed,
          solved: state.modules.calculator.solved,
        },
        piano: {
          modeLight: state.modules.piano.modeLight,
          melody: state.modules.piano.melody,
          pressedCount: state.modules.piano.pressed.length,
          solved: state.modules.piano.solved,
        },
        symbol: {
          seed: state.modules.symbol.seed,
          pointer: state.modules.symbol.pointer,
          buttons: state.modules.symbol.buttons,
          pressed: state.modules.symbol.pressed,
          solved: state.modules.symbol.solved,
        },
        soundboard: {
          colors: state.modules.soundboard.colors,
          pressed: state.modules.soundboard.pressed,
          solved: state.modules.soundboard.solved,
        },
      },
    };
  }

  if (role === "specialist") {
    return {
      ...common,
      view: "specialist" as const,
      manual: MANUAL,
      modules: Object.fromEntries(enabledModules.map((module) => [module, { solved: state.modules[module].solved }])),
    };
  }

  return {
    ...common,
    view: "operator" as const,
    modules: {
      cable: { count: state.modules.cable.count, cut: state.modules.cable.cut, solved: state.modules.cable.solved },
      slider: { braille: state.modules.slider.braille, current: state.modules.slider.current, solved: state.modules.slider.solved },
      direction: { braille: state.modules.direction.braille, pressed: state.modules.direction.pressed, solved: state.modules.direction.solved },
      calculator: { enteredLength: state.modules.calculator.entered.length, stage: state.modules.calculator.stage, pressed: state.modules.calculator.pressed, solved: state.modules.calculator.solved },
      piano: { pressedCount: state.modules.piano.pressed.length, solved: state.modules.piano.solved },
      // The beeps are the hidden clues, and only BLIND sees them.
      symbol: { pointer: state.modules.symbol.pointer, buttonCount: state.modules.symbol.buttons.length, pressed: state.modules.symbol.pressed, solved: state.modules.symbol.solved, beep: !state.modules.symbol.solved && SYMBOLS[state.modules.symbol.pointer] === state.modules.symbol.target },
      soundboard: { braille: state.modules.soundboard.numbers, beep: state.modules.soundboard.found && !state.modules.soundboard.solved ? state.modules.soundboard.beeper : null, pressed: state.modules.soundboard.pressed, solved: state.modules.soundboard.solved },
    },
  };
}

function strike(state: GameState, note: string) {
  if (state.level === 0) {
    logAction(state, `Practice: ${note} No strike in the practice round. Try again.`, "error");
    return;
  }
  state.mistakes += 1;
  logAction(state, `${note} Strike ${state.mistakes}/${state.maxMistakes}.`, "error");
}

export type ModuleAction = "cut-cable" | "toggle-slider" | "check-slider" | "press-direction" | "calculator-key" | "calculator-clear" | "calculator-enter" | "piano-key" | "symbol-rotate" | "symbol-press" | "soundboard-press";

export function applyModuleAction(state: GameState, action: ModuleAction, value?: number | string) {
  const enabled = new Set(activeModules(state));

  if (action === "cut-cable" && enabled.has("cable")) {
    const cable = state.modules.cable;
    if (!cable.solved && Number.isInteger(value)) {
      const index = Number(value);
      if (cable.colors[index] === cable.targetColor) {
        cable.cut = index;
        cable.solved = true;
      } else strike(state, "Wrong cable cut.");
    }
  }

  if (action === "toggle-slider" && enabled.has("slider")) {
    const index = Number(value);
    if (!state.modules.slider.solved && Number.isInteger(index) && index >= 0 && index < 4) {
      state.modules.slider.current[index] = !state.modules.slider.current[index];
    }
  }

  if (action === "check-slider" && enabled.has("slider") && !state.modules.slider.solved) {
    const correct = state.modules.slider.current.every((position, index) => position === state.modules.slider.target[index]);
    if (correct) {
      state.modules.slider.solved = true;
    } else strike(state, "Color slider pattern rejected.");
  }

  if (action === "press-direction" && enabled.has("direction")) {
    const direction = String(value) as Direction;
    const directionModule = state.modules.direction;
    if (!directionModule.solved && ["UP", "DOWN", "LEFT", "RIGHT"].includes(direction)) {
      directionModule.pressed = direction;
      if (direction === directionModule.target) {
        directionModule.solved = true;
      } else {
        strike(state, "Wrong direction. Direction module reset.");
        state.modules.direction = createDirectionModule();
      }
    }
  }

  const calculator = state.modules.calculator;
  if (enabled.has("calculator") && !calculator.solved) {
    if (action === "calculator-key" && Number.isInteger(value)) {
      const digit = Number(value);
      if (digit >= 0 && digit <= 9) {
        if (calculator.stage === "entry") {
          if (calculator.entered.length < 2) calculator.entered += String(digit);
        } else if (digit === calculator.targetDigit) {
          calculator.pressed = digit;
          calculator.solved = true;
        } else strike(state, "Wrong calculator confirmation key.");
      }
    }
    if (action === "calculator-clear" && calculator.stage === "entry") calculator.entered = "";
    if (action === "calculator-enter" && calculator.stage === "entry") {
      if (Number(calculator.entered) === calculator.answer) {
        calculator.stage = "confirm";
      } else {
        strike(state, "Incorrect equation result.");
        calculator.entered = "";
      }
    }
  }

  if (action === "piano-key" && enabled.has("piano")) {
    const piano = state.modules.piano;
    const key = Number(value);
    if (!piano.solved && Number.isInteger(key) && key >= 1 && key <= 8) {
      const expected = piano.target[piano.pressed.length];
      if (key === expected) {
        piano.pressed.push(key);
        if (piano.pressed.length === piano.target.length) piano.solved = true;
      } else {
        strike(state, "Wrong piano key. Melody reset.");
        piano.pressed = [];
      }
    }
  }

  if (action === "symbol-rotate" && enabled.has("symbol")) {
    const symbol = state.modules.symbol;
    if (!symbol.solved) {
      symbol.pointer = (symbol.pointer + 1) % SYMBOLS.length;
    }
  }

  if (action === "symbol-press" && enabled.has("symbol")) {
    const symbol = state.modules.symbol;
    const index = Number(value);
    if (!symbol.solved && Number.isInteger(index) && index >= 0 && index < symbol.buttons.length) {
      symbol.pressed = index;
      if (SYMBOLS[symbol.pointer] !== symbol.target) strike(state, "Symbol button pressed with no beep. Keep turning the dial.");
      else if (symbol.buttons[index] === symbol.targetColor) {
        symbol.solved = true;
      } else strike(state, "Wrong symbol button.");
    }
  }

  if (action === "soundboard-press" && enabled.has("soundboard")) {
    const board = state.modules.soundboard;
    const index = Number(value);
    if (!board.solved && Number.isInteger(index) && index >= 0 && index < 9) {
      // Searching: presses are free until the beeping button is found.
      if (!board.found) {
        if (index === board.beeper) board.found = true;
      } else if (board.target.includes(index)) {
        if (!board.pressed.includes(index)) board.pressed.push(index);
        if (board.pressed.length === board.target.length) board.solved = true;
      } else {
        strike(state, "Wrong soundboard button. Pressed buttons reset.");
        board.pressed = [];
      }
    }
  }

  // The feed only reports strikes; moves and accepted answers stay quiet.
  state.actionLog = state.actionLog.slice(-14);
}
