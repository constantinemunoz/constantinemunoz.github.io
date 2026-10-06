// Clickability check for BLIND's bomb. For every control, at many screen sizes,
// with and without the "Your move" tip, on every three- and four-module level:
// a click at the control's center must reach it, it must not overlap another
// control or stick out of its module, and it must be at least MIN pixels.
//
// Usage: serve a build (pnpm run build, then serve ./out on port 8080), install
// Playwright once (npm i -g playwright), then:
//   NODE_PATH=$(npm root -g) node scripts/check-bomb-controls.cjs
// Options: BASE=http://host/snip-no-evil/ SIZES=1366x768,390x844 LEVELS=7,15 REPEATS=2 MIN=14
// Set CHROMIUM=/path/to/chromium if Playwright's bundled browser is not installed.
// Playwright is installed globally (see above), so it is loaded with require and NODE_PATH.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8080/snip-no-evil/";
const SIZES = (process.env.SIZES || "2560x1440,1920x1080,1680x1050,1536x864,1440x900,1366x768,1280x800,1280x720,1024x768,1024x600,900x800,820x1180,768x1024,600x900,430x932,414x896,390x844,375x667,360x640").split(",").map((v) => v.split("x").map(Number));
const LEVELS = (process.env.LEVELS || "7,12,13,14,15,∞").split(",");
const REPEATS = Number(process.env.REPEATS || 2);
const MIN = Number(process.env.MIN || 14);
const probe = (min) => {
  const out = [];
  const bomb = document.querySelector(".game-workspace .bomb-suitcase");
  if (!bomb) return ["no bomb"];
  const controls = [...bomb.querySelectorAll(".case-bay button")];
  controls.forEach((control) => {
    const name = control.dataset.anchor || control.className;
    control.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = control.getBoundingClientRect();
    if (r.width < min || r.height < min) out.push(`${name} only ${Math.round(r.width)}x${Math.round(r.height)}px`);
    for (const other of controls) {
      if (other === control || other.contains(control) || control.contains(other)) continue;
      const q = other.getBoundingClientRect();
      const ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      if (ox > 2 && oy > 2) out.push(`${name} overlaps ${other.dataset.anchor || other.className} by ${Math.round(ox)}x${Math.round(oy)}`);
    }
    const bay = control.closest(".case-bay").getBoundingClientRect();
    if (r.bottom > bay.bottom + 1 || r.right > bay.right + 1 || r.top < bay.top - 1 || r.left < bay.left - 1) out.push(`${name} sticks out of its module`);
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) { out.push(`${name} cannot be scrolled into view`); return; }
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === control || control.contains(hit))) out.push(`${name} is covered by ${hit ? (hit.className?.baseVal ?? hit.className) || hit.tagName : "nothing"}`);
  });
  return out;
};
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
  const found = new Map();
  const scrolled = new Set();
  for (const [w, h] of SIZES) {
    for (const tip of [true, false]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(BASE, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
      await page.getByRole("button", { name: /Try it alone/ }).click(); await page.waitForTimeout(250);
      await page.evaluate(() => [...document.querySelectorAll(".developer-role-switcher button")].find((b) => b.textContent.trim().endsWith("BLIND")).click());
      if (!tip) await page.addStyleTag({ content: ".coach-strip{display:none!important}" });
      for (const level of LEVELS) {
        await page.evaluate((l) => [...document.querySelectorAll(".developer-level-switcher button")].find((b) => b.textContent.trim() === l).click(), level);
        for (let rep = 0; rep < REPEATS; rep += 1) {
          if (rep) { await page.getByRole("button", { name: /Reset/ }).click(); }
          await page.waitForTimeout(250);
          const modules = await page.evaluate(() => [...document.querySelectorAll(".game-workspace .case-module-grid > .case-bay")].map((b) => b.getAttribute("aria-label").replace(" module", "")).join("+"));
          // Check in two scroll positions in case the workspace scrolls on short screens.
          const issues = new Set(await page.evaluate(probe, MIN));
          const mode = await page.evaluate(() => document.querySelector(".game-workspace .bomb-suitcase")?.dataset.overflow || "fit");
          if (mode === "scroll") scrolled.add(`${w}x${h}${tip ? " tip" : ""} L${level}`);
          for (const issue of issues) {
            const key = issue.replace(/\d+x\d+/g, "#");
            if (!found.has(key)) found.set(key, []);
            found.get(key).push(`${w}x${h}${tip ? " tip" : ""} L${level} [${modules}] ${issue}`);
          }
        }
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(`scroll mode used on ${scrolled.size} screens: ${[...scrolled].slice(0, 8).join(", ")}`);
  if (!found.size) console.log("every BLIND control is reachable, unobstructed and at least " + MIN + "px at every size");
  for (const [key, list] of found) console.log(`${list.length}× ${key}\n   e.g. ${list.slice(0, 3).join("\n        ")}`);
})();
