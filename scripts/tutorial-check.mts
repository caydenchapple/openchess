/**
 * Tutorial check: plays a game's tutorial like a new player on desktop, phone landscape and phone portrait, and reports what a bot can judge.
 * It follows the coach through the hook (window.__tutorial, see assets/tutorial-kit/hook.js), does what each step asks (tap, drag, hold, swipe,
 * press a key), waits for the step to finish, and on every step measures:
 *   - the bubble covers the target or the drop spot, or sticks out of the screen (after its animation has ended);
 *   - the coach layer takes the tap it asks for (it must let every click through, except on its own buttons);
 *   - the target is missing, off screen, or smaller than a thumb (24 px is WCAG 2.2's floor, 44 px the aim on a phone);
 *   - the text is under 16 px, longer than 12 words (warning) or 20 (error), low in contrast, or a raw placeholder / translation key;
 *   - a step that does not finish when the player does what it says (a soft lock), and how long each step took;
 * and, in fresh browser profiles:
 *   - Skip exists, is thumb-sized, works, and is remembered after a reload;
 *   - a finished tutorial does not come back after a reload, and a half-done one resumes after its first step instead of starting over;
 *   - a hidden tab pauses the tutorial; reduced-motion players get no looping animation;
 *   - turning the phone mid-step, or a translation three times as long, keeps the bubble off the target; motion runs in bursts under 5 s;
 *   - console errors.
 * Not judged: whether the words are clear or the lesson works. People do that (references/test-and-measure.md).
 *
 * Setup (once per project): copy this file to scripts/ and wire the hook (assets/tutorial-kit/hook.js); then
 *   npm i -D playwright tsx && npx playwright install chromium
 * Run against a production build or a dev server:
 *   npx tsx scripts/tutorial-check.mts http://localhost:4173/
 *
 * Options:
 *   --step <spec>     how a new player gets past the title screen to the tutorial, in order (repeat it): role:<regex> | text:<regex> |
 *                     css:<selector> | at:<x>,<y> (fractions of the viewport). Default: none, because a "Start" button may be a tutorial target.
 *   --param <name>    the query parameter that turns the hook on (default "tutorial"; the playtest uses "playtest")
 *   --devices <list>  desktop,phone-landscape,phone-portrait (default all three)
 *   --stray <n>       random taps before each step, to prove stray taps cannot break the tutorial (default 0; risky in games where any tap spends money)
 *   --bot <file>      a module whose default export maps step ids to async (page, view) => void, for steps the checker cannot do by itself
 *                     (gesture "play" or "look": walk to the nest, wait for the wave)
 *   --step-timeout S  seconds a step may take after the player did what it says (default 12)
 *   --layer, --bubble, --text, --skip, --card   CSS selectors if the game has its own coach instead of the kit's (.tcoach .tcoach-bubble .tcoach-text .tcoach-skip .tcontrols)
 *   --init <file.js>  a script injected into every page before it loads: for a game that has a coach but no hook, a shim that builds
 *                     window.__tutorial.view() from the coach's own DOM (see references/test-and-measure.md)
 *   --out <dir>       screenshots (one per step per device) and tutorial-report.json (default ./tutorial-check)
 *   --allow-none      a game with no tutorial on purpose: exit 0 when there is no hook
 *   --quick           the walk only, no profile scenarios
 *
 * Exit codes: 0 no errors (warnings allowed), 1 errors, 2 usage error, or no hook found (without --allow-none).
 * Severities: error = a player is blocked, misled or loses the lesson; warn = worth fixing, may be a judgment call.
 * The thresholds (12 and 20 words, 16 px, 44 px) are this skill's house rules, written with their evidence in references/test-and-measure.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type Severity = "error" | "warn";
export interface Finding { id: string; severity: Severity; device: string; step?: string; message: string; fix: string; shot?: string }
export interface Options {
  url: string; steps: string[]; param: string; devices: string[]; stray: number; bot?: string; stepTimeoutS: number; hookWaitS: number;
  layer: string; bubble: string; text: string; skip: string; card: string; out: string; allowNone: boolean; quick: boolean; seed: number; init?: string;
}
interface Box { x: number; y: number; w: number; h: number }
interface View {
  active: boolean; visible: boolean; suspended?: boolean; finished: boolean; skipped: string | null; replaying?: boolean; id: string | null; index: number | null; total: number;
  text: string; gesture: string | null; key: string | null; swipe: { dx: number; dy: number } | null; hint: number; target: Box | null; spot: Box | null; done?: string[];
}

const DEVICES: Record<string, { w: number; h: number; touch: boolean }> = {
  desktop: { w: 1440, h: 900, touch: false },
  "phone-landscape": { w: 844, h: 390, touch: true },
  "phone-portrait": { w: 390, h: 844, touch: true },
};
const DEFAULTS = { layer: ".tcoach", bubble: ".tcoach-bubble", text: ".tcoach-text", skip: ".tcoach-skip", card: ".tcontrols" };

const FIX: Record<string, string> = {
  "no-hook": "Call installHook(tutorial) (assets/tutorial-kit/hook.js) and open the page with ?tutorial, or pass --param playtest if the build turns the hook on that way. A game with no tutorial on purpose: --allow-none.",
  "never-shown": "A fresh profile never saw a step. If the game has a title screen, pass --step role:play (or text:/css:/at:) so the check gets past it. Otherwise check that tutorial.start() runs after the game state is ready, that skipIfPlayed is not true for new players, and that the first step's `after` is short.",
  "soft-lock": "The player did what the step says and it did not finish. Check the step's done.when / done.event, that the target takes this input (touch as well as mouse), and that nothing covers it. Add giveUpAfter for steps whose precondition can be destroyed.",
  "covers-target": "Shorten the text, or give the bubble more room (keepClear, prefer: 'edges' on phones). The bubble must never cover what it points at.",
  "covers-spot": "The bubble sits on the drop spot. Shorten the text or move the spot; the placement code keeps the bubble off both when there is room.",
  "bubble-offscreen": "The bubble sticks out of the screen. Keep a margin of at least 8 px and a width of at most the viewport minus 16 px.",
  "blocks-input": "The coach layer took a tap meant for the game. Set pointer-events: none on the layer and pointer-events: auto only on its buttons.",
  "text-small": "Coach text must be at least 16 px (a phone is read at arm's length). Set font-size: max(16px, 1rem).",
  "text-long": "One short line per step: 12 words or fewer. Move the rest into the how-to-play screen or into the lesson itself (show, don't tell).",
  "target-missing": "The step points at nothing. The target function returned null or an element that is not on screen at this step.",
  "target-offscreen": "The target is outside the screen on this device. Scroll it into view, move it, or point at an edge arrow instead.",
  "target-small": "The target is smaller than a thumb. Make it at least 44 px (WCAG 2.2 allows 24 px at the very least).",
  "skip-missing": "Every coach needs a visible Skip. Players who already know the game must be able to leave in one tap.",
  "skip-small": "The Skip button is under 44 px on a touch screen. Give it min-height and min-width of 44 px.",
  "skip-no-effect": "Skip did not stop the tutorial. Call tutorial.skip() from the button and hide the coach.",
  "skip-not-remembered": "A skipped tutorial came back after a reload. Save tutorial progress (the skipped flag) in the game's save.",
  "restarts-after-finish": "A finished tutorial came back after a reload. Persist progress.finished and do not clear it on update.",
  "restarts-mid": "A reload mid-tutorial started it from step 1 again. Persist the done steps so it resumes where the player was.",
  "no-pause-hidden": "The tutorial did not pause when the tab was hidden. Call tutorial.suspend('hidden') on visibilitychange (createCoach does it by default).",
  "looping-motion": "Looping animation under prefers-reduced-motion. Stop the ring pulse and the hand loop and show a still hand plus a dashed line.",
  "contrast": "Coach text needs 4.5:1 contrast (WCAG 1.4.3). Darken the text or lighten the bubble.",
  "long-tutorial": "More than 6 steps. Teach the rest where it first matters (a tip on first encounter) instead of in a row.",
  "slow-start": "The first step took long to appear. A new player should have something to do within a few seconds of reaching the game.",
  "console-error": "A console error appeared while the tutorial ran. Open the browser console on this page.",
  "card-covers-target": "The controls card sits on top of the control the step points at. Put it at the top (createControlsCard position: 'top') or let it leave sooner.",
  "raw-text": "The coach shows an unreplaced placeholder or a translation key. Resolve {tokens} with the input tracker (prompts.js) and check the string table.",
  "long-motion": "A coach animation runs longer than 5 s or loops forever (WCAG 2.2.2). Play it in bursts under 5 s and start it again on each new step and hint level (coach.js does).",
  "expands-badly": "With the text three times longer (translations often are) the bubble covers the target or leaves the screen. Keep the layout code that places the bubble around what it points at (placeBubble) and keep the text short.",
};

export function parseArgs(argv: string[]): Options {
  const o: Options = { url: "", steps: [], param: "tutorial", devices: Object.keys(DEVICES), stray: 0, stepTimeoutS: 12, hookWaitS: 20, ...DEFAULTS, out: "tutorial-check", allowNone: false, quick: false, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--step") o.steps.push(argv[++i]);
    else if (a === "--param") o.param = argv[++i];
    else if (a === "--devices") o.devices = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--stray") o.stray = Number(argv[++i]);
    else if (a === "--bot") o.bot = argv[++i];
    else if (a === "--step-timeout") o.stepTimeoutS = Number(argv[++i]);
    else if (a === "--hook-wait") o.hookWaitS = Number(argv[++i]);
    else if (a === "--layer") o.layer = argv[++i];
    else if (a === "--bubble") o.bubble = argv[++i];
    else if (a === "--text") o.text = argv[++i];
    else if (a === "--skip") o.skip = argv[++i];
    else if (a === "--card") o.card = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--init") o.init = argv[++i];
    else if (a === "--seed") o.seed = Number(argv[++i]);
    else if (a === "--allow-none") o.allowNone = true;
    else if (a === "--quick") o.quick = true;
    else if (!a.startsWith("--")) o.url = a;
    else throw new Error(`unknown option ${a}`);
  }
  if (!o.url) throw new Error("usage: npx tsx tutorial-check.mts <url> [--step role:play] [--devices desktop,phone-portrait] [--stray 1] [--bot file.mts] [--out dir]");
  for (const d of o.devices) if (!DEVICES[d]) throw new Error(`unknown device ${d} (use ${Object.keys(DEVICES).join(", ")})`);
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function luminance([r, g, b]: number[]) { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
export function contrastRatio(fg: number[], bg: number[]) { const a = luminance(fg), b = luminance(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }

export async function check(options: Options, onLine: (s: string) => void = console.log) {
  const findings: Finding[] = [];
  const funnel: Record<string, unknown[]> = {};
  const stepLog: Record<string, { id: string; botMs: number; text: string; gesture: string | null }[]> = {};
  const noHook: string[] = [];
  mkdirSync(options.out, { recursive: true });
  const bot = options.bot ? ((await import(pathToFileURL(resolve(options.bot)).href)).default as Record<string, (page: Page, v: View) => Promise<void>>) : {};
  const browser = await chromium.launch({ channel: "chromium", args: ["--ignore-gpu-blocklist"] }).catch(() => chromium.launch());

  const url = (() => { const u = new URL(options.url); if (!u.searchParams.has(options.param)) u.searchParams.set(options.param, "1"); return u.toString(); })();

  for (const device of options.devices) {
    const d = DEVICES[device];
    const add = (f: Omit<Finding, "device" | "fix"> & { fix?: string }) => {
      const full: Finding = { device, fix: FIX[f.id] ?? "", ...f };
      // One finding per id, step and device is enough.
      if (!findings.some((x) => x.id === full.id && x.step === full.step && x.device === device)) findings.push(full);
    };

    async function fresh(opts: { reducedMotion?: boolean } = {}) {
      const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, hasTouch: d.touch, isMobile: d.touch, reducedMotion: opts.reducedMotion ? "reduce" : "no-preference" });
      await ctx.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
      if (options.init) await ctx.addInitScript({ path: resolve(options.init) });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/.test(m.location().url ?? "")) errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
      await page.goto(url);
      await reach(page);
      return { ctx, page, errors };
    }
    async function reach(page: Page) {
      for (const spec of options.steps) await clickSpec(page, spec, 10000);
    }
    const view = (page: Page) => page.evaluate(() => (window as any).__tutorial?.view?.() ?? null) as Promise<View | null>;
    async function hook(page: Page): Promise<boolean> {
      const until = Date.now() + options.hookWaitS * 1000;
      while (Date.now() < until) { if (await page.evaluate(() => !!(window as any).__tutorial).catch(() => false)) return true; await sleep(150); }
      return false;
    }
    async function waitVisible(page: Page, ms: number): Promise<View | null> {
      const until = Date.now() + ms;
      while (Date.now() < until) { const v = await view(page); if (v?.visible && v.id) return v; if (v && (v.finished || v.skipped) && !v.active) return v; await sleep(80); }
      return view(page);
    }

    // ---- A: the walk ----
    const walk = await fresh();
    const rand = rng(options.seed + device.length);
    if (!(await hook(walk.page))) { noHook.push(device); await walk.ctx.close(); continue; }
    const t0 = Date.now();
    let v = await waitVisible(walk.page, options.hookWaitS * 1000);
    if (!v || !v.visible || !v.id) {
      add({ id: "never-shown", severity: "error", message: v?.finished || v?.skipped ? `a brand-new profile starts with the tutorial already ${v.finished ? "finished" : "skipped"} (${v.skipped ?? "finished"})` : "no tutorial step appeared for a brand-new player" });
      await walk.ctx.close(); continue;
    }
    if (Date.now() - t0 > 5000) add({ id: "slow-start", severity: "warn", message: `the first step took ${((Date.now() - t0) / 1000).toFixed(1)} s to appear` });
    stepLog[device] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (v && v.active && v.id && guard++ < 40) {
      const id = v.id;
      if (!seen.has(id)) {
        seen.add(id);
        await measureStep(walk.page, v, "");
        await walk.page.screenshot({ path: join(options.out, `${device}-${String(seen.size).padStart(2, "0")}-${id.replace(/[^\w-]/g, "_")}.png`) }).catch(() => {});
        if (v.total > 6 && seen.size === 1) add({ id: "long-tutorial", severity: "warn", message: `${v.total} steps in a row` });
      }
      for (let i = 0; i < options.stray; i++) await strayTap(walk.page, v, rand);
      const t1 = Date.now();
      const did = bot[id] ? (await bot[id](walk.page, v), true) : await perform(walk.page, v, d.touch);
      const next = await waitChange(walk.page, id, did ? options.stepTimeoutS * 1000 : Math.min(options.stepTimeoutS * 1000, 4000));
      stepLog[device].push({ id, botMs: Date.now() - t1, text: v.text, gesture: v.gesture });
      if (next && next.id === id && next.active) {
        add({ id: "soft-lock", severity: "error", step: id, message: did ? `step "${id}" (${v.gesture}) did not finish ${options.stepTimeoutS} s after the player did what it says` : `step "${id}" has gesture "${v.gesture}", which the checker cannot perform; pass --bot with a handler for it (it was not finished by itself in ${options.stepTimeoutS} s)`, shot: `${device}-${id}-stuck.png` });
        await walk.page.screenshot({ path: join(options.out, `${device}-${id}-stuck.png`) }).catch(() => {});
        break;
      }
      v = await waitVisible(walk.page, 2500);
      if (v && !v.visible && v.active) await sleep(300);
    }
    const end = await view(walk.page);
    const events = await walk.page.evaluate(() => (window as any).__tutorial?.events?.() ?? []).catch(() => []);
    funnel[device] = events;
    for (const e of walk.errors.slice(0, 3)) add({ id: "console-error", severity: "error", message: e.slice(0, 200) });
    if (end?.finished) {
      await walk.page.reload(); await reach(walk.page); await hook(walk.page); await sleep(900);
      const again = await view(walk.page);
      if (again && (again.active || again.visible || !again.finished)) add({ id: "restarts-after-finish", severity: "error", message: `after finishing and reloading, the tutorial is ${again.visible ? "showing" : "active"} again` });
    }
    await walk.ctx.close();
    if (options.quick) continue;

    // ---- B: a reload mid-tutorial resumes ----
    {
      const s = await fresh(); await hook(s.page);
      const first = await waitVisible(s.page, 8000);
      if (first?.visible && first.id && first.total > 1) {
        const pre = first.id;
        const did = bot[pre] ? (await bot[pre](s.page, first), true) : await perform(s.page, first, d.touch);
        const nxt = did ? await waitChange(s.page, pre, options.stepTimeoutS * 1000) : null;
        if (nxt && nxt.id && nxt.id !== pre && !nxt.finished) {
          await s.page.reload(); await reach(s.page); await hook(s.page);
          const back = await waitVisible(s.page, 6000);
          // A coach that reports no `done` list is a pure function of the game's state (Cluck TD's is): after a reload that also wipes the run, starting over is right.
          if (back?.id === pre) add({ id: "restarts-mid", severity: Array.isArray(back.done) ? "error" : "warn", step: pre, message: `after completing "${pre}" and reloading, the tutorial offered "${pre}" again${Array.isArray(back.done) ? "" : " (fine if the game itself also lost that progress on reload; this coach reports no saved steps)"}` });
        }
      }
      await s.ctx.close();
    }

    // ---- D: Skip works, is thumb-sized and is remembered ----
    if (device === "desktop" || d.touch) {
      const s = await fresh(); await hook(s.page);
      const first = await waitVisible(s.page, 8000);
      if (first?.visible) {
        const info = await s.page.evaluate((sel) => { const b = document.querySelector<HTMLElement>(sel); if (!b) return null; const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: b.offsetWidth, h: b.offsetHeight, shown: r.width > 0 && cs.visibility !== "hidden" && cs.display !== "none" }; }, options.skip);
        if (!info || !info.shown) add({ id: "skip-missing", severity: "error", step: first.id ?? undefined, message: "no visible Skip button while the coach is up" });
        else {
          if (d.touch && (info.w < 44 || info.h < 44)) add({ id: "skip-small", severity: info.w < 40 || info.h < 40 ? "error" : "warn", step: first.id ?? undefined, message: `the Skip button is ${info.w}x${info.h} px` });
          await s.page.locator(options.skip).first().click({ timeout: 4000 }).catch(() => {});
          await sleep(300);
          const after = await view(s.page);
          if (after && (after.active || after.visible)) add({ id: "skip-no-effect", severity: "error", message: "after pressing Skip the tutorial is still active" });
          else {
            await s.page.reload(); await reach(s.page); await hook(s.page); await sleep(900);
            const again = await view(s.page);
            if (again && (again.active || again.visible)) add({ id: "skip-not-remembered", severity: "error", message: "after skipping and reloading, the tutorial came back" });
          }
        }
      }
      await s.ctx.close();
    }

    // ---- E/F/G: reduced motion, hidden tab, turning the phone (once each) ----
    if (device === "desktop") {
      const m = await fresh(); await hook(m.page);
      if ((await waitVisible(m.page, 8000))?.visible) {
        await sleep(300);
        const long = await m.page.evaluate((sel) => document.getAnimations().filter((a) => { const t = (a.effect as any)?.target as Element | null; if (!t || !t.closest(sel)) return false; const c = (a.effect as any).getComputedTiming(); return c.iterations === Infinity || c.endTime > 5000; }).length, options.layer);
        if (long > 0) add({ id: "long-motion", severity: "warn", message: `${long} coach animation(s) run longer than 5 s or loop forever` });
      }
      await m.ctx.close();
      const r = await fresh({ reducedMotion: true }); await hook(r.page);
      if ((await waitVisible(r.page, 8000))?.visible) {
        const looping = await r.page.evaluate((sel) => document.getAnimations().filter((a) => { const t = (a.effect as any)?.target as Element | null; return t && t.closest(sel) && (a.effect as any).getComputedTiming().iterations === Infinity; }).length, options.layer);
        if (looping > 0) add({ id: "looping-motion", severity: "warn", message: `${looping} looping animation(s) in the coach with prefers-reduced-motion: reduce` });
      }
      await r.ctx.close();
      const h = await fresh(); await hook(h.page);
      const hv = await waitVisible(h.page, 8000);
      if (hv?.visible && hv.suspended !== undefined) {
        await h.page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
        await sleep(200);
        const hidden = await view(h.page);
        if (!hidden?.suspended) add({ id: "no-pause-hidden", severity: "warn", message: "view().suspended stayed false while the tab was hidden" });
      }
      await h.ctx.close();
    }
    if (d.touch) {
      const t = await fresh(); await hook(t.page);
      const tv = await waitVisible(t.page, 8000);
      if (tv?.visible && tv.id) {
        await t.page.setViewportSize({ width: d.h, height: d.w });
        await sleep(500);
        const rv = await view(t.page);
        if (rv?.visible && rv.id) await measureStep(t.page, rv, " after turning the phone", `${device}-rotated`);
        await t.page.setViewportSize({ width: d.w, height: d.h });
        await sleep(300);
        await t.page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.textContent = Array(3).fill(el.textContent).join(" "); }, options.text);
        await sleep(400);
        const ev = await view(t.page);
        if (ev?.visible && ev.id) await measureStep(t.page, ev, " with the text three times longer", undefined, true);
      }
      await t.ctx.close();
    }

    // ---- the per-step measurements ----
    async function measureStep(page: Page, v: View, when: string, tag?: string, expanded = false) {
      const m = await page.evaluate(async (sel) => {
        const q = (s: string) => document.querySelector<HTMLElement>(s);
        const bubble = q(sel.bubble), text = q(sel.text), layer = q(sel.layer), cardEl = q(sel.card);
        if (!bubble) return null;
        await Promise.race([Promise.all(bubble.getAnimations().map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 700))]);
        const r = bubble.getBoundingClientRect();
        const cs = text ? getComputedStyle(text) : null, bs = getComputedStyle(bubble);
        const probes = [[0.5, 0.5], [0.08, 0.5], [0.92, 0.5], [0.5, 0.08], [0.5, 0.92]].map(([fx, fy]) => {
          const el = document.elementFromPoint(innerWidth * fx, innerHeight * fy);
          const inBubble = el ? !!el.closest(sel.bubble) : false;
          return { inLayer: !!el && !!layer && layer.contains(el) && !inBubble, tag: el?.tagName ?? "" };
        });
        return {
          card: cardEl && !cardEl.hidden && cardEl.getClientRects().length > 0 ? (() => { const c = cardEl.getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; })() : null,
          bubble: { x: r.left, y: r.top, w: r.width, h: r.height }, font: cs ? parseFloat(cs.fontSize) : 0, color: cs?.color ?? "", bg: bs.backgroundColor,
          covered: !!layer && "covered" in layer.dataset, arrow: !!layer && "arrow" in layer.dataset, probes, vw: innerWidth, vh: innerHeight,
          layerPointer: layer ? getComputedStyle(layer).pointerEvents : "", text: text?.textContent ?? "",
        };
      }, { bubble: options.bubble, text: options.text, layer: options.layer, card: options.card });
      if (!m) { add({ id: "target-missing", severity: "warn", step: v.id ?? undefined, message: `no coach bubble found with ${options.bubble}; pass --bubble/--text/--layer/--skip for a custom coach` }); return; }
      const step = v.id ?? undefined, shot = tag ? `${tag}.png` : undefined;
      if (tag) await page.screenshot({ path: join(options.out, `${tag}.png`) }).catch(() => {});
      const need = v.gesture === "tap" || v.gesture === "drag" || v.gesture === "hold";
      const vp: Box = { x: 0, y: 0, w: m.vw, h: m.vh };
      if (need && !v.target) add({ id: "target-missing", severity: "error", step, message: `step "${v.id}" (${v.gesture})${when} points at nothing`, shot });
      // An edge arrow is a fair way to point at something out of view ("walk that way"), but not at something the player is asked to tap or drag.
      if (v.target && (!m.arrow || need) && overlap(v.target, vp) < Math.max(v.target.w * v.target.h, 1) * 0.9) add({ id: "target-offscreen", severity: "error", step, message: `the target of "${v.id}"${when} is outside the ${m.vw}x${m.vh} screen${m.arrow ? ", so it cannot be tapped (the arrow only says which way to go)" : ""} (${Math.round(v.target.x)},${Math.round(v.target.y)} ${Math.round(v.target.w)}x${Math.round(v.target.h)})`, shot });
      if (v.target && v.target.w > 0 && Math.min(v.target.w, v.target.h) < (d.touch ? 44 : 24)) add({ id: "target-small", severity: Math.min(v.target.w, v.target.h) < 24 ? "error" : "warn", step, message: `the target of "${v.id}"${when} is ${Math.round(v.target.w)}x${Math.round(v.target.h)} px`, shot });
      if (v.target && overlap(m.bubble, v.target) > 0) add({ id: expanded ? "expands-badly" : "covers-target", severity: "error", step, message: `the bubble covers the target of "${v.id}"${when} (${Math.round(overlap(m.bubble, v.target))} px² of it)`, shot });
      if (m.card && v.target && !expanded && overlap(m.card, v.target) > 0) add({ id: "card-covers-target", severity: "warn", step, message: `the controls card sits on the target of "${v.id}"${when}`, shot });
      if (v.spot && overlap(m.bubble, { x: v.spot.x - 30, y: v.spot.y - 30, w: 60, h: 60 }) > 0) add({ id: expanded ? "expands-badly" : "covers-spot", severity: "error", step, message: `the bubble covers the drop spot of "${v.id}"${when}`, shot });
      if (m.bubble.x < -0.5 || m.bubble.y < -0.5 || m.bubble.x + m.bubble.w > m.vw + 0.5 || m.bubble.y + m.bubble.h > m.vh + 0.5) add({ id: expanded ? "expands-badly" : "bubble-offscreen", severity: "error", step, message: `the bubble of "${v.id}"${when} sticks out of the screen`, shot });
      if (m.covered && !v.target) { /* nothing to report */ } else if (m.covered) add({ id: "covers-target", severity: "error", step, message: `the placement code reports the bubble cannot avoid the target of "${v.id}"${when}`, shot });
      if (m.probes.some((p) => p.inLayer) || (v.target && (await blocked(page, v.target)))) add({ id: "blocks-input", severity: "error", step, message: `the coach layer sits on top of the game${when}: a tap meant for it would hit the layer`, shot });
      if (m.font && m.font < 16) add({ id: "text-small", severity: m.font < 14 ? "error" : "warn", step, message: `coach text is ${m.font}px${when}`, shot });
      const wc = words(m.text || v.text);
      if (!expanded && /\{[^}]*\}|\$\{|%[sd]|\bundefined\b|\bNaN\b|\[object|^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test((m.text || "").trim())) add({ id: "raw-text", severity: "error", step, message: `the text of "${v.id}" shows a raw placeholder or key: "${(m.text || "").slice(0, 60)}"`, shot });
      if (expanded) { /* the text was made longer on purpose */ } else if (wc > 20) add({ id: "text-long", severity: "error", step, message: `"${v.id}" has ${wc} words`, shot });
      else if (wc > 12) add({ id: "text-long", severity: "warn", step, message: `"${v.id}" has ${wc} words`, shot });
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const fg = rgb(m.color), bg = rgb(m.bg);
      if (fg.length >= 3 && bg.length >= 3 && (bg.length < 4 || bg[3] > 0.95)) {
        const ratio = contrastRatio(fg, bg);
        if (ratio < 4.5) add({ id: "contrast", severity: ratio < 3 ? "error" : "warn", step, message: `coach text contrast is ${ratio.toFixed(1)}:1${when}`, shot });
      }
    }
    async function blocked(page: Page, t: Box) {
      return page.evaluate(({ x, y, layer, bubble }) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest(layer) && !el.closest(bubble); }, { x: center(t).x, y: center(t).y, layer: options.layer, bubble: options.bubble });
    }
    async function waitChange(page: Page, id: string, ms: number): Promise<View | null> {
      const until = Date.now() + ms;
      let last: View | null = null;
      while (Date.now() < until) { last = await view(page); if (!last || last.id !== id || last.finished || last.skipped) return last; await sleep(100); }
      return last;
    }
    async function strayTap(page: Page, v: View, next: () => number) {
      for (let tries = 0; tries < 6; tries++) {
        const x = 10 + next() * (d.w - 20), y = 10 + next() * (d.h - 20);
        const bb = await page.evaluate((s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; }, options.bubble);
        const here = { x: x - 20, y: y - 20, w: 40, h: 40 };
        if ((bb && overlap(bb, here)) || (v.target && overlap(v.target, here))) continue;
        if (d.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
        await sleep(150);
        return;
      }
    }
  }

  await browser.close();
  const hookMissing = noHook.length === options.devices.length;
  if (noHook.length) for (const device of noHook) findings.push({ id: "no-hook", severity: options.allowNone ? "warn" : "error", device, message: "window.__tutorial was not found", fix: FIX["no-hook"] });

  const errors = findings.filter((f) => f.severity === "error"), warns = findings.filter((f) => f.severity === "warn");
  const report = { url: options.url, devices: options.devices, verdict: hookMissing ? (options.allowNone ? "none" : "no-hook") : errors.length ? "fail" : "pass", errors: errors.length, warnings: warns.length, findings, steps: stepLog, funnel };
  writeFileSync(join(options.out, "tutorial-report.json"), JSON.stringify(report, null, 2));
  onLine(`Tutorial check: ${options.url}`);
  for (const [device, steps] of Object.entries(stepLog)) onLine(`  ${device}: ${steps.length} step(s) walked: ${steps.map((s) => `${s.id} ${(s.botMs / 1000).toFixed(1)}s`).join(", ")}`);
  for (const f of findings) onLine(`${f.severity === "error" ? "ERROR" : "WARN "} [${f.device}]${f.step ? ` ${f.step}:` : ""} ${f.message}\n       fix: ${f.fix}${f.shot ? `\n       picture: ${join(options.out, f.shot)}` : ""}`);
  onLine(`Summary: ${errors.length} error(s), ${warns.length} warning(s)${hookMissing ? " (no hook found)" : ""}. Report: ${join(options.out, "tutorial-report.json")}`);
  return report;
}

async function clickSpec(page: Page, spec: string, timeout: number) {
  const i = spec.indexOf(":"), kind = spec.slice(0, i), arg = spec.slice(i + 1);
  if (kind === "role") await page.getByRole("button", { name: new RegExp(arg, "i") }).first().click({ timeout });
  else if (kind === "text") await page.getByText(new RegExp(arg, "i")).first().click({ timeout });
  else if (kind === "css") await page.locator(arg).first().click({ timeout });
  else if (kind === "at") { const [fx, fy] = arg.split(",").map(Number), vp = page.viewportSize()!; await page.mouse.click(vp.width * fx, vp.height * fy); }
  else throw new Error(`unknown --step form "${spec}"`);
  await sleep(300);
}

/** Do what the step says. Returns false for gestures the checker cannot perform on its own. */
async function perform(page: Page, v: View, touch: boolean): Promise<boolean> {
  const c = v.target ? center(v.target) : null;
  const press = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 }); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  };
  switch (v.gesture) {
    case "tap": if (!c) return false; if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); return true;
    case "drag": if (!c || !v.spot) return false; await press(c, center(v.spot)); return true;
    case "hold": if (!c) return false; await page.mouse.move(c.x, c.y); await page.mouse.down(); await sleep(1300); await page.mouse.up(); return true;
    case "swipe": { const vp = page.viewportSize()!; const from = c ?? { x: vp.width / 2, y: vp.height / 2 }; await press(from, { x: from.x + (v.swipe?.dx ?? 160), y: from.y + (v.swipe?.dy ?? 0) }); return true; }
    case "key": await page.keyboard.press(v.key ?? "Space"); return true;
    default: return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let options: Options;
  try { options = parseArgs(process.argv.slice(2)); } catch (e) { console.error((e as Error).message); process.exit(2); }
  check(options).then((r) => process.exit(r.verdict === "pass" || r.verdict === "none" ? 0 : r.verdict === "no-hook" ? 2 : 1)).catch((e) => { console.error(e); process.exit(2); });
}
