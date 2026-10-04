import {
  activeModules,
  ALL_MODULES,
  INFINITE_LEVEL,
  LAST_CAMPAIGN_LEVEL,
  MEDIUM_MODULES,
  SOUNDBOARD_RULES,
  soundGroup,
  applyModuleAction,
  CALCULATOR_RULES,
  CABLE_RULES,
  EASY_MODULES,
  completedModules,
  createGameState,
  DIRECTION_RULES,
  LEVELS,
  manualModules,
  levelDefinition,
  nextLevelAfterClear,
  PIANO_RULES,
  PRACTICE_CABLE,
  publicStateForRole,
  SLIDER_NUMBER_GROUPS,
  SLIDER_RULES,
  SLIDER_TARGET_PATTERNS,
  SYMBOL_RULES,
  SYMBOLS,
} from "../lib/game.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function solveCable(state) {
  const cable = state.modules.cable;
  const expectedColor = CABLE_RULES[cable.count][cable.light];
  assert(cable.targetColor === expectedColor, "Cable target disagrees with the manual");
  const targetIndex = cable.colors.indexOf(expectedColor);
  assert(targetIndex >= 0, "Cable target is missing from the suitcase");
  applyModuleAction(state, "cut-cable", targetIndex);
  assert(cable.solved && cable.cut === targetIndex, "Correct cable was rejected");
}

function sliderExpected(slider) {
  const rule = SLIDER_RULES[slider.ruleIndex];
  const redNumber = slider.braille[rule.lights.indexOf("RED")];
  return rule.tests.map((test, index) => {
    const number = slider.braille[index];
    if (test === "ODD") return number % 2 === 1;
    if (test === "SET_A") return SLIDER_NUMBER_GROUPS.SET_A.up.includes(number);
    if (test === "GT_5") return SLIDER_NUMBER_GROUPS.GT_5.up.includes(number);
    return number > redNumber;
  });
}

const sliderPatternsSeen = new Set();

function solveSlider(state) {
  const slider = state.modules.slider;
  const expected = sliderExpected(slider);
  assert(expected.every((up, index) => up === slider.target[index]), "Slider target disagrees with the manual");
  const pattern = expected.map((up) => up ? "U" : "D").join("");
  sliderPatternsSeen.add(pattern);
  assert(SLIDER_TARGET_PATTERNS.includes(pattern), `Slider generated a repetitive pattern: ${pattern}`);
  expected.forEach((up, index) => { if (up) applyModuleAction(state, "toggle-slider", index); });
  applyModuleAction(state, "check-slider");
  assert(slider.solved && state.mistakes === 0, "Correct slider pattern was rejected");
}

function solveDirection(state) {
  const direction = state.modules.direction;
  const expected = DIRECTION_RULES[direction.braille][direction.light];
  assert(direction.target === expected, "Direction target disagrees with the manual");
  applyModuleAction(state, "press-direction", expected);
  assert(direction.solved && direction.pressed === expected, "Correct direction was rejected");
}

function solveCalculator(state) {
  const calculator = state.modules.calculator;
  const expectedAnswer = calculator.operator === "+" ? calculator.left + calculator.right : calculator.left - calculator.right;
  assert(calculator.answer === expectedAnswer, "Calculator arithmetic is wrong");
  for (const digit of String(expectedAnswer)) applyModuleAction(state, "calculator-key", Number(digit));
  applyModuleAction(state, "calculator-enter");
  assert(calculator.stage === "confirm" && state.mistakes === 0, "Correct calculator answer was rejected");
  const parity = expectedAnswer % 2 === 0 ? "EVEN" : "ODD";
  const expectedDigit = CALCULATOR_RULES[parity][calculator.light];
  assert(calculator.targetDigit === expectedDigit, "Calculator confirmation disagrees with the manual");
  applyModuleAction(state, "calculator-key", expectedDigit);
  assert(calculator.solved && calculator.pressed === expectedDigit, "Correct calculator confirmation was rejected");
}

function solvePiano(state) {
  const piano = state.modules.piano;
  const expected = piano.melody.map((color) => PIANO_RULES[piano.modeLight][color]);
  assert(expected.join(",") === piano.target.join(","), "Piano melody disagrees with the manual");
  expected.forEach((key) => applyModuleAction(state, "piano-key", key));
  assert(piano.solved && piano.pressed.join(",") === expected.join(","), "Correct piano melody was rejected");
}

function solveSymbol(state) {
  const symbol = state.modules.symbol;
  const expectedColor = SYMBOL_RULES[symbol.seed][symbol.target];
  assert(expectedColor === symbol.targetColor, "Symbol target color disagrees with the manual");
  assert(symbol.buttons.length === 3 && new Set(symbol.buttons).size === 3 && symbol.buttons.includes(expectedColor), "Symbol buttons must be three different colors including the answer");
  // Turn the dial until BLIND's beep shows, then press the matching button.
  let turns = 0;
  while (!publicStateForRole(state, "operator", "blind-id").modules.symbol.beep) {
    applyModuleAction(state, "symbol-rotate");
    turns += 1;
    assert(turns <= SYMBOLS.length, "The symbol dial never beeped");
  }
  assert(SYMBOLS[symbol.pointer] === symbol.target, "The beep fired on the wrong symbol");
  applyModuleAction(state, "symbol-press", symbol.buttons.indexOf(expectedColor));
  assert(symbol.solved, "Correct symbol button was rejected");
}

function solveSoundboard(state) {
  const board = state.modules.soundboard;
  assert(new Set(board.numbers).size === 9 && board.colors.length === 9, "The soundboard needs nine numbered buttons");
  // Search: press buttons in order until BLIND's view reports the beep.
  for (let index = 0; index < 9; index += 1) {
    applyModuleAction(state, "soundboard-press", index);
    if (publicStateForRole(state, "operator", "blind-id").modules.soundboard.beep !== null) break;
  }
  const beep = publicStateForRole(state, "operator", "blind-id").modules.soundboard.beep;
  assert(beep === board.beeper && state.mistakes === 0, "Searching for the beep must never strike");
  // Answer: the beeping button's color and number group pick the positions.
  const positions = SOUNDBOARD_RULES[board.colors[beep]][soundGroup(board.numbers[beep])];
  assert(positions.map((position) => position - 1).join(",") === board.target.join(","), "Soundboard target disagrees with the manual");
  for (const position of [...positions].reverse()) applyModuleAction(state, "soundboard-press", position - 1);
  assert(board.solved && state.mistakes === 0, "The marked positions in any order must solve the soundboard");
}

const solvers = { cable: solveCable, slider: solveSlider, direction: solveDirection, calculator: solveCalculator, piano: solvePiano, symbol: solveSymbol, soundboard: solveSoundboard };
const everyNumber = [1, 2, 3, 4, 5, 6, 7, 8, 9];
for (const group of Object.values(SLIDER_NUMBER_GROUPS)) {
  const combined = [...group.up, ...group.down];
  assert(new Set(combined).size === 9 && everyNumber.every((number) => combined.includes(number)), "A slider number group is incomplete");
}

for (const definition of LEVELS) {
  for (let run = 0; run < 2_000; run += 1) {
    const state = createGameState(definition.level, "playing");
    const enabled = activeModules(state);
    assert(new Set(enabled).size === enabled.length, `Level ${definition.level} contains a duplicate module`);
    if (definition.level <= 7) assert(enabled.join(",") === definition.modules.join(","), `Level ${definition.level} module list is wrong`);
    if (definition.level === 8) assert(enabled.length === 2 && enabled.includes("symbol") && enabled.filter((module) => EASY_MODULES.includes(module)).length === 1, "Level 8 must be the symbol dial plus one easy module");
    if (definition.level === 9) assert(enabled.length === 2 && enabled.includes("piano") && enabled.filter((module) => EASY_MODULES.includes(module)).length === 1, "Level 9 must be the piano plus one easy module");
    if (definition.level === 10) assert(enabled.join(",") === "symbol,piano", "Level 10 must be the symbol dial and the piano");
    const easyCount = enabled.filter((module) => EASY_MODULES.includes(module)).length;
    const mediumCount = enabled.filter((module) => MEDIUM_MODULES.includes(module)).length;
    if (definition.level === 11) assert(enabled.join(",") === "soundboard,symbol", "Level 11 must be the soundboard and the symbol dial");
    if (definition.level === 12) assert(enabled.length === 3 && enabled.includes("soundboard") && easyCount === 1 && mediumCount === 2, "Level 12 must be the soundboard, one easy and one more medium");
    if (definition.level === 13) assert(enabled.length === 3 && mediumCount === 2 && easyCount === 1, "Level 13 must be two medium and one easy");
    if (definition.level === 14) assert(enabled.length === 3 && mediumCount === 3, "Level 14 must be three medium");
    if (definition.level === 15) assert(enabled.length === 4 && mediumCount === 2 && easyCount === 2, "Level 15 must be two medium and two easy");
    if (definition.level === INFINITE_LEVEL) assert(enabled.length === 4 && enabled.every((module) => ALL_MODULES.includes(module)), "Infinite mode must contain four different modules");
    for (const moduleKey of enabled) solvers[moduleKey](state);
    assert(completedModules(state) === enabled.length, `Level ${definition.level} did not complete`);
  }
}
assert(sliderPatternsSeen.size === SLIDER_TARGET_PATTERNS.length, "Slider generator did not produce the full balanced pattern set");
assert(LEVELS.find(({ level }) => level === 8).durationMs === 210_000, "Level 8 timer must be 3:30");
assert(LEVELS.find(({ level }) => level === 9).durationMs === 210_000, "Level 9 timer must be 3:30");
assert(LEVELS.find(({ level }) => level === 10).durationMs === 240_000, "Level 10 timer must be 4:00");
for (const level of [11, 12, 13, 14, 15, INFINITE_LEVEL]) assert(LEVELS.find((definition) => definition.level === level).durationMs === 240_000, `Level ${level} timer must be 4:00`);
assert(LAST_CAMPAIGN_LEVEL === 15 && nextLevelAfterClear(14) === 15 && nextLevelAfterClear(15) === INFINITE_LEVEL && nextLevelAfterClear(INFINITE_LEVEL) === INFINITE_LEVEL, "The campaign runs to Level 15, then infinite mode repeats");
assert(MEDIUM_MODULES.join(",") === "piano,symbol,soundboard" && ALL_MODULES.length === 7, "Three medium modules; seven in total");

for (const [count, rules] of Object.entries(CABLE_RULES)) {
  for (const [light, target] of Object.entries(rules)) assert(target && light, `Missing ${count}-cable rule`);
}
for (const [braille, rules] of Object.entries(DIRECTION_RULES)) {
  for (const light of ["RED", "YELLOW", "GREEN", "BLUE"]) assert(rules[light], `Missing direction rule for ${braille}/${light}`);
}
for (const mode of ["RED", "YELLOW", "GREEN", "BLUE"]) {
  const pianoKeys = Object.values(PIANO_RULES[mode]);
  assert(pianoKeys.length === 4 && pianoKeys.every((key) => key >= 1 && key <= 8), `Missing piano rule for ${mode}`);
}

const pianoFailureState = createGameState(9, "playing");
const piano = pianoFailureState.modules.piano;
const wrongKey = piano.target[0] === 1 ? 2 : 1;
applyModuleAction(pianoFailureState, "piano-key", wrongKey);
assert(pianoFailureState.mistakes === 1 && piano.pressed.length === 0 && !piano.solved, "Wrong piano key did not strike and reset the melody");

const visibilityState = createGameState(1, "playing", "new", true, [
  { id: "blind-message", senderId: "blind-id", senderRole: "operator", senderName: "Blind", text: "three cables", sentAt: 1 },
  { id: "deaf-message", senderId: "deaf-id", senderRole: "observer", senderName: "Deaf", text: "red light", sentAt: 2 },
]);
visibilityState.actionLog = [{ text: "Cable severed. Circuit stable.", seq: 3 }, { text: "Wrong cable cut. Strike 1/3.", seq: 4, tone: "error" }];
const blindView = publicStateForRole(visibilityState, "operator", "blind-id");
const deafView = publicStateForRole(visibilityState, "observer", "deaf-id");
const muteView = publicStateForRole(visibilityState, "specialist", "mute-id");
assert(blindView.actionLog.length === 2, "BLIND must receive the full case feed");
assert(deafView.actionLog.length === 2 && muteView.actionLog.length === 2 && deafView.actionLog[1].tone === "error", "Every role must receive the wrong-answer alerts");
assert(deafView.messages.length === 1 && deafView.messages[0].senderId === undefined && deafView.messages[0].text === "red light", "DEAF chat visibility is wrong");
assert(blindView.messages.length === 2 && muteView.messages.length === 2, "BLIND and MUTE should receive the full text chat");

const feedState = createGameState(1, "playing");
const wrongIndex = feedState.modules.cable.colors.findIndex((color) => color !== feedState.modules.cable.targetColor);
applyModuleAction(feedState, "cut-cable", wrongIndex);
const strikeEntry = feedState.actionLog.at(-1);
assert(strikeEntry.tone === "error" && /Strike 1\/3/.test(strikeEntry.text), "Wrong answers are marked as errors");
assert(feedState.actionLog.every((entry, index, log) => index === 0 || entry.seq > log[index - 1].seq), "Case feed entries are numbered in order");

const pianoVisibilityState = createGameState(9, "playing");
const pianoBlindView = publicStateForRole(pianoVisibilityState, "operator", "blind-id");
const pianoDeafView = publicStateForRole(pianoVisibilityState, "observer", "deaf-id");
assert(!("melody" in pianoBlindView.modules.piano) && !("modeLight" in pianoBlindView.modules.piano), "Piano colors leaked to BLIND");
assert("melody" in pianoDeafView.modules.piano && !("target" in pianoDeafView.modules.piano), "Piano solution leaked to DEAF or its clues are missing");

// Symbol dial: the beep is BLIND-only, colors and seed stay hidden from BLIND.
assert(EASY_MODULES.join(",") === "cable,slider,direction,calculator", "Easy modules are the four originals");
for (const seed of [1, 2, 3, 4]) {
  const colors = Object.values(SYMBOL_RULES[seed]);
  assert(colors.length === 4 && new Set(colors).size === 4, `Seed ${seed} must map the four symbols to four different colors`);
}
const symbolState = createGameState(8, "playing");
const symbolBlind = publicStateForRole(symbolState, "operator", "blind-id").modules.symbol;
const symbolDeaf = publicStateForRole(symbolState, "observer", "deaf-id").modules.symbol;
const symbolMute = publicStateForRole(symbolState, "specialist", "mute-id").modules.symbol;
assert(!("seed" in symbolBlind) && !("buttons" in symbolBlind) && typeof symbolBlind.beep === "boolean" && symbolBlind.buttonCount === 3 && typeof symbolBlind.pointer === "number", "BLIND must get the beep but no colors or seed");
assert(symbolDeaf.seed >= 1 && symbolDeaf.seed <= 4 && symbolDeaf.buttons.length === 3 && !("beep" in symbolDeaf) && !("target" in symbolDeaf) && !("targetColor" in symbolDeaf), "DEAF must see the seed and buttons but not the beep or the answer");
assert(Object.keys(symbolMute).join(",") === "solved", "MUTE must only know whether the dial is solved");
assert(symbolBlind.beep === (SYMBOLS[symbolState.modules.symbol.pointer] === symbolState.modules.symbol.target), "The beep must mean the pointer is on the hidden symbol");
const symbol = symbolState.modules.symbol;
if (SYMBOLS[symbol.pointer] === symbol.target) applyModuleAction(symbolState, "symbol-rotate");
applyModuleAction(symbolState, "symbol-press", symbol.buttons.indexOf(symbol.targetColor));
assert(symbolState.mistakes === 1 && !symbol.solved, "Pressing a button without a beep must strike");
while (SYMBOLS[symbol.pointer] !== symbol.target) applyModuleAction(symbolState, "symbol-rotate");
applyModuleAction(symbolState, "symbol-press", symbol.buttons.findIndex((color) => color !== symbol.targetColor));
assert(symbolState.mistakes === 2 && !symbol.solved, "Pressing the wrong color must strike");
applyModuleAction(symbolState, "symbol-press", symbol.buttons.indexOf(symbol.targetColor));
assert(symbol.solved && symbolState.mistakes === 2, "The right color at the beep must solve the dial");
applyModuleAction(symbolState, "symbol-rotate");
assert(SYMBOLS[symbol.pointer] === symbol.target && !publicStateForRole(symbolState, "operator", "blind-id").modules.symbol.beep, "A solved dial stops turning and stops beeping");

// Soundboard: BLIND gets numbers and the beep, DEAF gets colors, MUTE gets neither.
for (const color of ["RED", "YELLOW", "GREEN", "BLUE"]) for (const group of ["LOW", "MID", "HIGH"]) {
  const positions = SOUNDBOARD_RULES[color][group];
  assert(positions.length === 3 && new Set(positions).size === 3 && positions.every((position) => position >= 1 && position <= 9), `Soundboard rule ${color} ${group} is malformed`);
}
assert(new Set(Object.values(SOUNDBOARD_RULES).flatMap((rows) => Object.values(rows).map((positions) => positions.join(",")))).size === 12, "Every soundboard rule must be different");
const boardState = createGameState(11, "playing");
const board = boardState.modules.soundboard;
const boardBlind = () => publicStateForRole(boardState, "operator", "blind-id").modules.soundboard;
const boardDeaf = publicStateForRole(boardState, "observer", "deaf-id").modules.soundboard;
assert(!("colors" in boardBlind()) && boardBlind().braille.length === 9 && boardBlind().beep === null, "BLIND gets the Braille numbers and no beep before pressing");
assert(boardDeaf.colors.length === 9 && !("braille" in boardDeaf) && !("beep" in boardDeaf) && !("target" in boardDeaf), "DEAF gets the colors only");
assert(Object.keys(publicStateForRole(boardState, "specialist", "mute-id").modules.soundboard).join(",") === "solved", "MUTE only learns whether the soundboard is solved");
const notBeeper = board.beeper === 0 ? 1 : 0;
applyModuleAction(boardState, "soundboard-press", notBeeper);
assert(boardState.mistakes === 0 && boardBlind().beep === null && boardState.actionLog.length === 1, "A search press is free and silent");
applyModuleAction(boardState, "soundboard-press", board.beeper);
assert(boardBlind().beep === board.beeper, "Pressing the beeping button shows the beep to BLIND");
const wrong = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((index) => !board.target.includes(index));
applyModuleAction(boardState, "soundboard-press", board.target[0]);
applyModuleAction(boardState, "soundboard-press", wrong);
assert(boardState.mistakes === 1 && board.pressed.length === 0 && boardBlind().beep === board.beeper && boardState.actionLog.at(-1).tone === "error", "A wrong position strikes and clears the presses, but the beep stays");
for (const index of board.target) applyModuleAction(boardState, "soundboard-press", index);
assert(board.solved && boardBlind().beep === null, "Pressing every marked position solves the soundboard");

// MUTE's manual unlocks a page once a level up to the current one has used that module.
const pagesAt = (level, active) => manualModules(level, active).join(",");
assert(pagesAt(0) === "cable" && pagesAt(1) === "cable", "Levels 0 and 1 only have the cable page");
assert(pagesAt(2) === "cable,slider" && pagesAt(4) === "cable,slider,direction" && pagesAt(7) === "cable,slider,direction,calculator", "Easy pages arrive with Levels 2, 4 and 5");
assert(pagesAt(8, ["symbol", "direction"]) === "cable,slider,direction,calculator,symbol", "Level 8 adds the symbol dial page");
assert(pagesAt(9) === "cable,slider,direction,calculator,symbol,piano" && pagesAt(10) === pagesAt(9), "Level 9 adds the piano page");
assert(pagesAt(11) === "cable,slider,direction,calculator,symbol,piano,soundboard" && pagesAt(INFINITE_LEVEL) === pagesAt(11), "Level 11 adds the soundboard page; infinite mode has all seven");
assert(pagesAt(1, ["slider"]) === "cable,slider", "A module on the current level always has its page");

// The case feed only shows strikes: correct moves add nothing.
const quiet = createGameState(7, "playing");
const before = quiet.actionLog.length;
applyModuleAction(quiet, "toggle-slider", 0);
applyModuleAction(quiet, "cut-cable", quiet.modules.cable.colors.indexOf(quiet.modules.cable.targetColor));
applyModuleAction(quiet, "calculator-key", 1);
assert(quiet.actionLog.length === before && quiet.modules.cable.solved, "Moves and accepted answers stay out of the case feed");

// Level 0: the practice round. Fixed cable, no timer, no strikes.
const practice = createGameState(0, "playing");
assert(practice.level === 0 && practice.durationMs === 0 && practice.serial === "PRACTICE", "Level 0 is the untimed practice round");
assert(activeModules(practice).join(",") === "cable", "Level 0 stages only the practice cable");
assert(practice.modules.cable.colors.join(",") === PRACTICE_CABLE.colors.join(",") && practice.modules.cable.light === PRACTICE_CABLE.light && practice.modules.cable.targetColor === "BLUE", "Practice cable is fixed so the coaching can name it");
applyModuleAction(practice, "cut-cable", 1);
assert(practice.mistakes === 0 && practice.actionLog.at(-1).tone === "error" && /No strike/.test(practice.actionLog.at(-1).text), "A wrong cut in Level 0 warns but does not strike");
applyModuleAction(practice, "cut-cable", 0);
assert(practice.modules.cable.solved && completedModules(practice) === 1, "The practice cable solves on the blue wire");
assert(nextLevelAfterClear(0) === 1, "Clearing Level 0 leads to Level 1");
assert(levelDefinition(42).level === 1, "Unknown levels fall back to Level 1, not the practice round");
const practiceView = publicStateForRole(practice, "operator", "blind-id");
assert("lastSignalAt" in practiceView && "lastActionAt" in practiceView, "Views carry the relay timestamps");
assert(createGameState(1, "playing").serial.startsWith("SN-") && createGameState(1, "playing").durationMs === 150_000, "Level 1 is unchanged");

console.log(`Passed ${(LEVELS.length * 2_000).toLocaleString("en-US")} randomized rounds across all ${ALL_MODULES.length} modules, the practice round, ${LAST_CAMPAIGN_LEVEL} campaign levels, and infinite mode.`);
