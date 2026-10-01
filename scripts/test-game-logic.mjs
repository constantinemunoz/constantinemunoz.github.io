import {
  activeModules,
  ALL_MODULES,
  applyModuleAction,
  CALCULATOR_RULES,
  CABLE_RULES,
  CORE_MODULES,
  completedModules,
  createGameState,
  DIRECTION_RULES,
  LEVELS,
  levelDefinition,
  nextLevelAfterClear,
  PIANO_RULES,
  PRACTICE_CABLE,
  publicStateForRole,
  SLIDER_NUMBER_GROUPS,
  SLIDER_RULES,
  SLIDER_TARGET_PATTERNS,
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

const solvers = { cable: solveCable, slider: solveSlider, direction: solveDirection, calculator: solveCalculator, piano: solvePiano };
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
    if (definition.level === 8) assert(enabled.length === 4 && enabled.every((module) => CORE_MODULES.includes(module)), "Level 8 must contain four original modules");
    if (definition.level === 9) assert(enabled.length === 2 && enabled.includes("piano") && enabled.filter((module) => CORE_MODULES.includes(module)).length === 1, "Level 9 composition is wrong");
    if (definition.level === 10) assert(enabled.length === 3 && enabled.includes("piano") && enabled.filter((module) => CORE_MODULES.includes(module)).length === 2, "Level 10 composition is wrong");
    if (definition.level === 11) assert(enabled.length === 4 && enabled.every((module) => ALL_MODULES.includes(module)), "Infinite mode must contain four different modules");
    for (const moduleKey of enabled) solvers[moduleKey](state);
    assert(completedModules(state) === enabled.length, `Level ${definition.level} did not complete`);
  }
}
assert(sliderPatternsSeen.size === SLIDER_TARGET_PATTERNS.length, "Slider generator did not produce the full balanced pattern set");
assert(LEVELS.find(({ level }) => level === 8).durationMs === 210_000, "Level 8 timer must be 3:30");
assert(LEVELS.find(({ level }) => level === 9).durationMs === 210_000, "Level 9 timer must be 3:30");
assert(LEVELS.find(({ level }) => level === 10).durationMs === 240_000, "Level 10 timer must be 4:00");
assert(LEVELS.find(({ level }) => level === 11).durationMs === 240_000, "Infinite timer must be 4:00");

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
assert(createGameState(1, "playing").serial.startsWith("BN-") && createGameState(1, "playing").durationMs === 150_000, "Level 1 is unchanged");

console.log("Passed 22,000 randomized rounds across all five modules, the practice round, ten campaign levels, and infinite mode.");
