// Wires the modules together: state, simulation loop, view, input, HUD, the "What's new" note and saving.
// This is the only file that knows about every module; the modules themselves only know their own layer
// (enforced by tests/architecture.test.ts).
import { CAMP } from './world/camp';
import { createState, type GameState } from './core/state';
import { EventBus } from './core/events';
import { createRng } from './core/rng';
import { FixedLoop, STEP } from './core/loop';
import { load, save, serialize, deserialize, browserStorage } from './core/save';
import { step } from './sim';
import { applyCommands, type Command } from './systems/commands';
import { View } from './render/view';
import { Hud } from './ui/hud';
import { bindInput } from './ui/input';
import { News } from './ui/news';
import { Intro } from './ui/intro';
import { BackpackList } from './ui/backpack';

// An artifact viewer can swap in a new version of the page while it is open and hand the game's snapshot
// to the new version, so play carries on. Everywhere else `hot` is absent, hence the optional chaining.
interface HotData { save?: string }
interface Hot { snapshot?: (take: () => HotData) => void; ready?: (start: (data: HotData) => void) => void; data?: HotData }
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: HotData): void {
  const stage = document.getElementById('stage')!;
  const layout = CAMP;                // a new game starts at the camp below the falls; the village comes much later
  let restored: GameState | null = null;
  if (data?.save) { try { restored = deserialize(data.save, layout); } catch { restored = null; } }
  const saved = restored ?? load(browserStorage, layout);
  const state = saved ?? createState(layout, (Math.random() * 2 ** 31) | 0);
  try { hot?.snapshot?.(() => ({ save: serialize(state) })); } catch { /* not an artifact viewer */ }

  const events = new EventBus();
  const rng = createRng(state.seed ^ Math.floor(state.time));
  const queue: Command[] = [];
  const ctx = { layout, rng, events };

  let view: View;
  try { view = new View(stage, layout); }
  catch {
    stage.insertAdjacentHTML('beforeend', '<div class="msg">This browser can\'t show 3D (WebGL is off or unsupported).</div>');
    return;
  }
  const hud = new Hud(view, events, layout, queue);                 // the goal card's Build button sends a command
  events.on(e => { if (e.type === 'strike') view.strike(e.nodeId); });     // chips fly where the tool lands
  bindInput(view, layout, queue, label => hud.hover(label));
  const pack = new BackpackList(queue);                             // what's in the backpack, to drop things
  new News(saved !== null);                                         // a returning player sees what changed since
  new Intro(saved === null);                                        // a new one is told what the game is about
  // For checking a running game from the browser console: hearthfolk.state, hearthfolk.view
  (window as unknown as { hearthfolk: unknown }).hearthfolk = { state, queue, view };

  const loop = new FixedLoop(dt => { applyCommands(state, layout, queue, events); step(state, dt, ctx); });
  new ResizeObserver(() => view.resize(stage.clientWidth, stage.clientHeight)).observe(stage);
  view.resize(stage.clientWidth, stage.clientHeight);

  // When frames arrive slowly (a background tab, a busy phone), catch the simulation up on the real time that
  // passed rather than letting the game run slow. Away time after closing the game comes in slice 1.
  const CATCH_UP_LIMIT = 2 * 60 * 60;
  function simulate(seconds: number): void {
    if (seconds <= 0.25) { loop.advance(seconds); return; }
    applyCommands(state, layout, queue, events);
    const n = Math.round(Math.min(seconds, CATCH_UP_LIMIT) / STEP);
    for (let i = 0; i < n; i++) step(state, STEP, ctx);
  }

  let last = performance.now(), sinceSave = 0;
  view.ready.then(() => {
    view.renderer.setAnimationLoop(() => {
      const now = performance.now(), real = (now - last) / 1000, dt = Math.min(0.1, real); last = now;
      simulate(real);
      view.draw(state, dt);
      hud.update(state, dt);
      pack.update(state);
      sinceSave += dt; if (sinceSave > 10) { sinceSave = 0; save(browserStorage, state); }
    });
  }).catch(err => {
    console.error(err);
    stage.insertAdjacentHTML('beforeend', '<div class="msg">The game\'s models failed to load. Reload the page to try again.</div>');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(browserStorage, state); });
  window.addEventListener('pagehide', () => save(browserStorage, state));
}

if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
