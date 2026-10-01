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
export type ModuleKey = "cable" | "slider" | "direction" | "calculator" | "piano";
export type RoundPhase = "waiting" | "playing" | "tutorial";
export type RoundResult = "new" | "cleared" | "timeout" | "strikes";
export type TutorialAction = "begin" | "inspect-blind" | "observe-light" | "deaf-message" | "manual-rule" | "mute-signal" | "practice-error" | "solve-cable";
export type TutorialFeedEntry = {
  id: string;
  kind: "system" | "message" | "signal" | "error" | "solved";
  role?: Role;
  text: string;
};
export type TutorialState = {
  step: number;
  practiceMistakes: number;
  completedAt: number | null;
  feed: TutorialFeedEntry[];
};
export type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: Role;
  senderName: string;
  text: string;
  sentAt: number;
};

export type LevelDefinition = {
  level: number;
  title: string;
  modules: ModuleKey[];
  durationMs: number;
  randomPool?: ModuleKey[];
  randomCount?: number;
};

export const CORE_MODULES: ModuleKey[] = ["cable", "slider", "direction", "calculator"];
export const ALL_MODULES: ModuleKey[] = [...CORE_MODULES, "piano"];

export const LEVELS: LevelDefinition[] = [
  { level: 1, title: "FIRST CUT", modules: ["cable"], durationMs: 150_000 },
  { level: 2, title: "COLOR ORDER", modules: ["slider"], durationMs: 150_000 },
  { level: 3, title: "CROSSED CIRCUITS", modules: ["cable", "slider"], durationMs: 150_000 },
  { level: 4, title: "TURN SIGNAL", modules: ["slider", "direction"], durationMs: 180_000 },
  { level: 5, title: "DO THE MATH", modules: ["slider", "calculator"], durationMs: 180_000 },
  { level: 6, title: "TRIPLE THREAT", modules: ["calculator", "cable", "slider"], durationMs: 210_000 },
  { level: 7, title: "FULL SUITCASE", modules: ["cable", "slider", "direction", "calculator"], durationMs: 240_000 },
  { level: 8, title: "REMIX CASE", modules: [], randomPool: CORE_MODULES, randomCount: 4, durationMs: 210_000 },
  { level: 9, title: "KEY CHANGE", modules: ["piano"], randomPool: CORE_MODULES, randomCount: 1, durationMs: 210_000 },
  { level: 10, title: "GRAND FINALE", modules: ["piano"], randomPool: CORE_MODULES, randomCount: 2, durationMs: 240_000 },
  { level: 11, title: "INFINITE MODE", modules: [], randomPool: ALL_MODULES, randomCount: 4, durationMs: 240_000 },
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

export const MANUAL = {
  cable: CABLE_RULES,
  direction: DIRECTION_RULES,
  slider: SLIDER_RULES,
  calculator: CALCULATOR_RULES,
  piano: PIANO_RULES,
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
  actionLog: string[];
  chatEnabled: boolean;
  tutorialEnabled: boolean;
  tutorial: TutorialState | null;
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
  };
};

const COLORS: LightColor[] = ["RED", "YELLOW", "GREEN", "BLUE"];
const BRAILLE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

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

export function levelDefinition(level: number) {
  return LEVELS.find((definition) => definition.level === level) ?? LEVELS[0];
}

export function nextLevelAfterClear(level: number) {
  return level >= 10 ? 11 : level + 1;
}

export function resolveLevelModules(definition: LevelDefinition) {
  const fixed = [...definition.modules];
  const candidates = (definition.randomPool ?? []).filter((module) => !fixed.includes(module));
  return [...fixed, ...shuffled(candidates).slice(0, definition.randomCount ?? 0)];
}

export function createGameState(level = 1, phase: RoundPhase = "waiting", lastResult: RoundResult = "new", chatEnabled = false, messages: ChatMessage[] = [], tutorialEnabled = false): GameState {
  const definition = levelDefinition(level);
  return {
    serial: `BN-${Math.floor(10000 + Math.random() * 90000)}`,
    level: definition.level,
    phase,
    lastResult,
    startAt: null,
    durationMs: definition.durationMs,
    mistakes: 0,
    maxMistakes: 3,
    actionLog: [phase === "waiting" ? `Level ${definition.level} staged. Waiting for all three monkeys.` : `Level ${definition.level} armed.`],
    chatEnabled,
    tutorialEnabled,
    tutorial: null,
    messages: [...messages].slice(-40),
    activeModuleKeys: resolveLevelModules(definition),
    modules: {
      cable: createCableModule(),
      slider: createSliderModule(),
      direction: createDirectionModule(),
      calculator: createCalculatorModule(),
      piano: createPianoModule(),
    },
  };
}

export function createTutorialGameState(chatEnabled = false): GameState {
  const state = createGameState(1, "tutorial", "new", chatEnabled, [], true);
  state.serial = "TRAINING";
  state.startAt = Date.now();
  state.durationMs = 150_000;
  state.activeModuleKeys = ["cable"];
  state.modules.cable = {
    count: 3,
    colors: ["BLUE", "RED", "GREEN"],
    light: "RED",
    targetColor: "BLUE",
    cut: null,
    solved: false,
  };
  state.actionLog = ["Training suitcase opened. Follow the shared information chain."];
  state.tutorial = {
    step: 0,
    practiceMistakes: 0,
    completedAt: null,
    feed: [{ id: crypto.randomUUID(), kind: "system", text: "Tutorial-only shared view connected." }],
  };
  return state;
}

function tutorialEntry(kind: TutorialFeedEntry["kind"], text: string, role?: Role): TutorialFeedEntry {
  return { id: crypto.randomUUID(), kind, text, role };
}

export function applyTutorialAction(state: GameState, role: Role, action: TutorialAction, value?: number | string) {
  const tutorial = state.tutorial;
  if (state.phase !== "tutorial" || !tutorial) return { ok: false, error: "The tutorial is not active." };
  if (tutorial.completedAt) return { ok: false, error: "The tutorial is already complete." };

  const expected: Array<{ action: TutorialAction; role?: Role }> = [
    { action: "begin" },
    { action: "inspect-blind", role: "operator" },
    { action: "observe-light", role: "observer" },
    { action: "deaf-message", role: "observer" },
    { action: "manual-rule", role: "specialist" },
    { action: "mute-signal", role: "specialist" },
    { action: "practice-error", role: "operator" },
    { action: "solve-cable", role: "operator" },
  ];
  const next = expected[tutorial.step];
  if (!next || next.action !== action) return { ok: false, error: "Complete the highlighted tutorial action first." };
  if (next.role && role !== next.role) return { ok: false, error: `${ROLE_META[next.role].short} must perform this step.` };

  if (action === "begin") tutorial.feed.push(tutorialEntry("system", "Practice cable armed. The clock is shared by all three roles."));
  if (action === "inspect-blind") tutorial.feed.push(tutorialEntry("system", "BLIND can feel three cable positions, but their colors and light stay hidden.", "operator"));
  if (action === "observe-light") tutorial.feed.push(tutorialEntry("system", "DEAF sees a RED light and BLUE · RED · GREEN cables.", "observer"));
  if (action === "deaf-message") tutorial.feed.push(tutorialEntry("message", "RED LIGHT · 3 CABLES", "observer"));
  if (action === "manual-rule") tutorial.feed.push(tutorialEntry("system", "MUTE matched the three-cable + red-light rule to the BLUE cable.", "specialist"));
  if (action === "mute-signal" && String(value) === "1") tutorial.feed.push(tutorialEntry("signal", "1", "specialist"));
  if (action === "mute-signal" && String(value) !== "1") return { ok: false, error: "Send the highlighted cable position." };
  if (action === "practice-error") {
    if (Number(value) !== 1) return { ok: false, error: "Try the highlighted practice-error cable." };
    tutorial.practiceMistakes = 1;
    tutorial.feed.push(tutorialEntry("error", "Practice error: wrong cable. In a normal round, BLIND receives the strike.", "operator"));
  }
  if (action === "solve-cable") {
    if (Number(value) !== 0) return { ok: false, error: "Use the answer MUTE sent." };
    state.modules.cable.cut = 0;
    state.modules.cable.solved = true;
    tutorial.completedAt = Date.now();
    tutorial.feed.push(tutorialEntry("solved", "Module solved. Information chain complete.", "operator"));
  }

  tutorial.step += 1;
  tutorial.feed = tutorial.feed.slice(-12);
  return { ok: true };
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

function isBlindOnlyCaseError(entry: string) {
  return /wrong|rejected|incorrect|strike|timed out|time expired/i.test(entry);
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
        }))
    : [];
  const common = {
    serial: role === "observer" ? state.serial : role === "operator" ? "BN-•••••" : null,
    level: state.level,
    levelTitle: definition.title,
    activeModules: enabledModules,
    phase: state.phase,
    lastResult: state.lastResult,
    startAt: state.startAt,
    durationMs: state.durationMs,
    mistakes: state.mistakes,
    maxMistakes: state.maxMistakes,
    actionLog: (role === "operator" ? state.actionLog : state.actionLog.filter((entry) => !isBlindOnlyCaseError(entry))).slice(-8),
    completed: completedModules(state),
    moduleCount: enabledModules.length,
    chatEnabled: state.chatEnabled,
    tutorialEnabled: Boolean(state.tutorialEnabled),
    tutorial: state.tutorial
      ? {
          ...state.tutorial,
          cable: {
            count: state.modules.cable.count,
            colors: state.modules.cable.colors,
            light: state.modules.cable.light,
            cut: state.modules.cable.cut,
            solved: state.modules.cable.solved,
          },
        }
      : null,
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
    },
  };
}

function strike(state: GameState, note: string) {
  state.mistakes += 1;
  state.actionLog.push(`${note} Strike ${state.mistakes}/${state.maxMistakes}.`);
}

export type ModuleAction = "cut-cable" | "toggle-slider" | "check-slider" | "press-direction" | "calculator-key" | "calculator-clear" | "calculator-enter" | "piano-key";

export function applyModuleAction(state: GameState, action: ModuleAction, value?: number | string) {
  const enabled = new Set(activeModules(state));

  if (action === "cut-cable" && enabled.has("cable")) {
    const cable = state.modules.cable;
    if (!cable.solved && Number.isInteger(value)) {
      const index = Number(value);
      if (cable.colors[index] === cable.targetColor) {
        cable.cut = index;
        cable.solved = true;
        state.actionLog.push("Cable severed. Circuit stable.");
      } else strike(state, "Wrong cable cut.");
    }
  }

  if (action === "toggle-slider" && enabled.has("slider")) {
    const index = Number(value);
    if (!state.modules.slider.solved && Number.isInteger(index) && index >= 0 && index < 4) {
      state.modules.slider.current[index] = !state.modules.slider.current[index];
      state.actionLog.push(`Slider position ${index + 1} moved.`);
    }
  }

  if (action === "check-slider" && enabled.has("slider") && !state.modules.slider.solved) {
    const correct = state.modules.slider.current.every((position, index) => position === state.modules.slider.target[index]);
    if (correct) {
      state.modules.slider.solved = true;
      state.actionLog.push("Color slider pattern accepted.");
    } else strike(state, "Color slider pattern rejected.");
  }

  if (action === "press-direction" && enabled.has("direction")) {
    const direction = String(value) as Direction;
    const directionModule = state.modules.direction;
    if (!directionModule.solved && ["UP", "DOWN", "LEFT", "RIGHT"].includes(direction)) {
      directionModule.pressed = direction;
      if (direction === directionModule.target) {
        directionModule.solved = true;
        state.actionLog.push("Direction accepted.");
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
          state.actionLog.push("Calculator confirmation accepted.");
        } else strike(state, "Wrong calculator confirmation key.");
      }
    }
    if (action === "calculator-clear" && calculator.stage === "entry") calculator.entered = "";
    if (action === "calculator-enter" && calculator.stage === "entry") {
      if (Number(calculator.entered) === calculator.answer) {
        calculator.stage = "confirm";
        state.actionLog.push("Equation accepted. Read the new light and confirm one final key.");
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
        if (piano.pressed.length === piano.target.length) {
          piano.solved = true;
          state.actionLog.push("Piano melody accepted.");
        } else {
          state.actionLog.push(`Piano note ${piano.pressed.length}/${piano.target.length} accepted.`);
        }
      } else {
        strike(state, "Wrong piano key. Melody reset.");
        piano.pressed = [];
      }
    }
  }

  state.actionLog = state.actionLog.slice(-14);
}
