// Wires the modules together: state, simulation loop, away time, view, input, HUD, the "What's new" and "While you were
// away" notes, and saving. This is the only file that knows about every module; the modules themselves only know their
// own layer (enforced by tests/architecture.test.ts).
import { CAMP } from './world/camp';
import { createState, type GameState } from './core/state';
import { EventBus } from './core/events';
import { createRng } from './core/rng';
import { FixedLoop } from './core/loop';
import { load, save, serialize, deserialize, browserStorage } from './core/save';
import { awayOnOpening, catchUp, step } from './sim';
import { applyCommands, type Command } from './systems/commands';
import { FrameClock, openFor, tellAway, type Away, type AwaySummary, type Told } from './systems/away';
import { View } from './render/view';
import { showModels } from './render/showcase';
import { Hud } from './ui/hud';
import { bindInput } from './ui/input';
import { News } from './ui/news';
import { Intro } from './ui/intro';
import { BackpackList } from './ui/backpack';
import { Book } from './ui/book';
import { AwayNote } from './ui/away';
import { CombatHud } from './ui/combat';
import { RatsHud } from './ui/rats';
import { goblinNotices } from './ui/goblins';
import { showArmour } from './ui/armour';
import { AWAY } from './data/away';

// An artifact viewer can swap in a new version of the page while it is open and hand the game's snapshot
// to the new version, so play carries on. Everywhere else `hot` is absent, hence the optional chaining.
interface HotData { save?: string }
interface Hot { snapshot?: (take: () => HotData) => void; ready?: (start: (data: HotData) => void) => void; data?: HotData }
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: HotData): void {
  const stage = document.getElementById('stage')!;
  const layout = CAMP;                // a new game starts at the camp below the falls; the village comes much later
  // a hot swap hands over the running game; otherwise the page was opened or reloaded and the game is this browser's save
  const handedOver = typeof data?.save === 'string';
  let restored: GameState | null = null;
  if (handedOver) { try { restored = deserialize(data.save!, layout); } catch { restored = null; } }
  const loaded = restored ? null : load(browserStorage, layout);
  const saved = restored ?? loaded?.state ?? null;
  const newGame = saved === null;
  const state = saved ?? createState(layout, (Math.random() * 2 ** 31) | 0);
  try { hot?.snapshot?.(() => ({ save: serialize(state) })); } catch { /* not an artifact viewer */ }

  const events = new EventBus();
  const rng = createRng(state.seed ^ Math.floor(state.time));
  const queue: Command[] = [];
  const ctx = { layout, rng, events };

  // Away time (the owner's decision of 11 Oct 2026; systems/away.ts): the game was closed from when its save was made
  // until now, and he kept working at a fifth of his speed for at most 2 hours of that. It is caught up here, before
  // the first frame and before anything listens to the game's events (the note tells what happened instead). Not on a
  // hot swap: the game never stopped (awayOnOpening in sim.ts).
  const opened = performance.now(), openedAt = Date.now();
  const back = awayOnOpening(loaded, handedOver, openedAt, ctx);
  const awayMs = Math.round(performance.now() - opened);

  let view: View;
  try { view = new View(stage, layout); }
  catch {
    stage.insertAdjacentHTML('beforeend', '<div class="msg">This browser can\'t show 3D (WebGL is off or unsupported).</div>');
    return;
  }
  const hud = new Hud(view, events, layout, queue);                 // the goal card's Build button sends a command
  const combat = new CombatHud(state, view, events, layout, queue, hud);   // his health, what he trains, hits over the dummy
  const rats = new RatsHud(state, view, events, layout, hud);       // (chapter 2) bars and numbers over the rats and goblins, and over him
  goblinNotices(events, hud);                                       // (chapter 2) the goblin chief coming out, the camp cleared
  events.on(e => { if (e.type === 'strike') view.strike(e.nodeId); });     // chips fly where the tool lands
  events.on(e => { if (e.type === 'hit') view.hit(e.target, e.damage); }); // the training dummy wobbles when struck
  bindInput(view, layout, queue, label => hud.hover(label));
  showModels(view, layout);                                         // dev only: ?models in the address shows chapter 2's models
  const pack = new BackpackList(queue);                             // what's in the backpack, to drop things
  const book = new Book(state, events, layout);                     // his book: a page per goal, opened from the goal card
  new News(!newGame);                                               // a returning player sees what changed since
  new Intro(newGame);                                               // a new one is told what the game is about
  const awayNote = new AwayNote();                                  // and what he did while they were away
  // what the note tells until it is closed: a catch-up while it is still up (or waiting) adds to it (tellAway), so
  // opening the game in a background tab and looking at it later still tells of the time it was closed
  let told: Told | null = null;
  const tell = (away: Away, summary: AwaySummary) => {
    const next = tellAway(awayNote.unseen ? told : null, away, summary, newGame);
    if (next) { told = next; awayNote.show(next.spans, next.summary); }
  };
  if (back) tell(back.away, back.summary);

  // The real time between frames (FrameClock in systems/away.ts), from when away time was counted to, so the first
  // frame catches up the moment that took and the models loading, as open time. `clock.playedTo`, the real time the
  // game has been played up to, is what each save records and away time is counted from.
  const clock = new FrameClock(opened, openedAt, document.hidden);
  // For checking a running game from the browser console: hearthfolk.state, hearthfolk.view, hearthfolk.clock, and
  // hearthfolk.away (the away time caught up on opening, what he did and how many milliseconds it took)
  (window as unknown as { hearthfolk: unknown }).hearthfolk = { state, queue, view, clock, away: back && { ...back.away, summary: back.summary, ms: awayMs } };

  const loop = new FixedLoop(dt => { applyCommands(state, layout, queue, events); step(state, dt, ctx); });
  new ResizeObserver(() => view.resize(stage.clientWidth, stage.clientHeight)).observe(stage);
  view.resize(stage.clientWidth, stage.clientHeight);

  // When frames arrive slowly or stop (a background tab, a busy phone, the screen off), the game still counts as open:
  // the simulation catches up on the real time that passed, at full speed, all of it (openFor in systems/away.ts; a
  // phone's time asleep comes from the wall clock: FrameClock). That is just play, so no note (0.0.21: the note is for
  // coming back after the game was closed). A long catch-up is spread over frames (AWAY.chunk), so the page never
  // freezes: what is left waits in `behind`.
  let behind = 0;
  function simulate(seconds: number): void {
    behind += openFor(seconds).game;
    if (behind <= 0.25) { loop.advance(behind); behind = 0; return; }
    applyCommands(state, layout, queue, events);
    const now = Math.min(behind, AWAY.chunk);
    behind -= now;
    catchUp(state, now, ctx);
  }

  let sinceSave = 0;
  view.ready.then(() => {
    view.renderer.setAnimationLoop(() => {
      const real = clock.frame(performance.now(), Date.now()), dt = Math.min(0.1, real);
      simulate(real);
      view.draw(state, dt);
      hud.update(state, dt);
      combat.update(dt);
      rats.update(dt);
      showArmour(state);                                            // the armour line in the panel (chunk D)
      pack.update(state);
      book.update();
      awayNote.update();
      sinceSave += dt; if (sinceSave > 10) { sinceSave = 0; save(browserStorage, state, clock.playedTo); }
    });
  }).catch(err => {
    console.error(err);
    stage.insertAdjacentHTML('beforeend', '<div class="msg">The game\'s models failed to load. Reload the page to try again.</div>');
  });
  // Hidden (another tab, the screen off) or closed: frames stop and the device may sleep, so the next frame goes by the
  // wall clock if that says more time passed; the save says the game was played up to the last frame, so if the page
  // is closed now, the time since counts as closed time when it is opened again.
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clock.hide(); save(browserStorage, state, clock.playedTo); } });
  // closed (or reloaded): the time hidden before this still counted as open, so the save says when it closed
  window.addEventListener('pagehide', () => { clock.hide(); save(browserStorage, state, clock.playedTo, Date.now()); });
}

if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
