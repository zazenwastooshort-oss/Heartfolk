// Sound (13 Oct 2026, the owner: "Can we also make and add sound? Like an ambient music and then the general sounds?",
// then the pick "Made in code"): every sound is made here as it plays, with Web Audio, nothing downloaded (numbers in
// data/sound.ts). Around the camp: the river and the falls (louder near the falls), a soft wind, birds by day, crickets
// at night, the campfire crackling (louder near it, livelier at night). For what happens: a chop, a clink of the pick, a
// plip as a fish bites, a soft pop for each thing gained, the mallet's knocks as he builds, blows and bites in a fight,
// eating, cooking, stoking, a chime for a level and a fuller one for a goal, and a light tick for the buttons. The music
// (ui/music.ts) plays a quiet piece now and then. Two settings (ui/settings.ts), Music and Sounds, each Off, Low, Medium
// or High, remembered in this browser only. Browsers let a page make sound only once the player has touched or clicked
// it, so it all starts at the first touch; it pauses while the page is hidden, and stays quiet while the game catches up
// on time (main.ts: hushed) and while he sleeps (the night goes by quickly). Reads the game; changes nothing in it.
import type { GameEvent, EventBus } from '../core/events';
import type { GameState } from '../core/state';
import { dayFraction } from '../core/clock';
import { createRng, type Rng } from '../core/rng';
import type { Layout, Vec2 } from '../world/layout';
import { stepPlace } from '../world/steps';
import { RESOURCES } from '../data/skills';
import { CARPENTRY } from '../data/building';
import { AMBIENCE, LEVEL_GAIN, SOUND_DEFAULTS, SOUND_GAP, SOUND_LEVELS, type SoundLevel } from '../data/sound';
import { MusicPlayer, hz } from './music';

/** The sounds there are for what happens (cueFor). */
export type Cue = 'chop' | 'clink' | 'plip' | 'gain' | 'pick' | 'level' | 'goal' | 'made' | 'stage' | 'knock' | 'whack'
  | 'miss' | 'bitten' | 'down' | 'knockout' | 'munch' | 'sizzle' | 'burnt' | 'stoke' | 'store' | 'sleep' | 'wake'
  | 'drum' | 'fanfare' | 'tap' | 'drop';

/** The sound for an event, or null for none: a strike by what is struck (a tree, a rock, the water), a blow by whether
 *  it landed. */
export function cueFor(e: GameEvent, layout: Layout): Cue | null {
  switch (e.type) {
    case 'strike': {
      const res = RESOURCES[layout.nodes.find(n => n.id === e.nodeId)?.resource ?? ''];
      return !res ? null : res.skill === 'woodcutting' ? 'chop' : res.skill === 'mining' ? 'clink' : res.skill === 'fishing' ? 'plip' : null;
    }
    case 'itemGained': return 'gain';
    case 'pickedUp': return 'pick';
    case 'levelUp': return 'level';
    case 'goalDone': return 'goal';
    case 'made': return 'made';
    case 'buildStage': return 'stage';
    case 'hit': return e.damage > 0 ? 'whack' : 'miss';
    case 'bitten': return e.damage > 0 ? 'bitten' : 'miss';
    case 'beaten': return 'down';
    case 'knockedOut': return 'knockout';
    case 'ate': case 'meal': return 'munch';
    case 'cooked': return e.burnt ? 'burnt' : 'sizzle';
    case 'stoked': return 'stoke';
    case 'banked': case 'stacked': return 'reason' in e && e.reason ? null : 'store';
    case 'dropped': return 'drop';
    case 'fellAsleep': return 'sleep';
    case 'awake': return 'wake';
    case 'chiefOut': return 'drum';
    case 'campCleared': return 'fanfare';
    default: return null;
  }
}

/** The two levels as remembered (JSON, or nothing): each one of SOUND_LEVELS, else its default. */
export function soundLevelsOf(raw: string | null): { music: SoundLevel; sounds: SoundLevel } {
  let v: unknown = null;
  try { v = raw ? JSON.parse(raw) : null; } catch { v = null; }
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const level = (x: unknown, d: SoundLevel) => SOUND_LEVELS.find(l => l === x) ?? d;
  return { music: level(o.music, SOUND_DEFAULTS.music), sounds: level(o.sounds, SOUND_DEFAULTS.sounds) };
}

const KEY = 'hearthfolk_sound';
const store = {
  get(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v: string): void { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: it lasts until the page closes */ } },
};

/** Whether `hour` is between `from` and `to` (round midnight when `from` is the later). */
const between = (hour: number, from: number, to: number) => from < to ? hour >= from && hour < to : hour >= from || hour < to;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
/** How loud something `d` metres away sounds: full within `near`, `quiet` from `far` on. */
const nearness = (d: number, near: number, far: number, quiet: number) => d <= near ? 1 : d >= far ? quiet : 1 - (1 - quiet) * (d - near) / (far - near);

export class Sound {
  /** the two settings */
  levels = soundLevelsOf(store.get());
  /** true while the game catches up on time (main.ts): no sounds for that */
  hushed = false;
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private sounds: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private river: GainNode | null = null;
  private player: MusicPlayer | null = null;
  private rng: Rng = createRng(Date.now() & 0x7fffffff);
  private last = new Map<Cue, number>();
  private nextBird = 0;
  private nextCricket = 0;
  private knocks = -1;
  private asleep = false;

  constructor(private layout: Layout, events: EventBus) {
    const start = () => this.start();
    for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, start, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend(); else void this.ctx.resume();
    });
    events.on(e => { const cue = cueFor(e, layout); if (cue) this.play(cue); });
    // a light tick for the buttons (the bar's, the windows', the menus')
    document.addEventListener('click', e => { if ((e.target as Element | null)?.closest?.('button, [role=menuitem]')) this.play('tap'); }, true);
  }

  /** Set a level (Settings), and remember it. */
  set(kind: 'music' | 'sounds', level: SoundLevel): void {
    this.levels = { ...this.levels, [kind]: level };
    store.set(JSON.stringify(this.levels));
    this.volumes();
    if (kind === 'music' && level !== 'off' && this.ctx && !this.player && this.music) this.player = new MusicPlayer(this.ctx, this.music, this.rng);
  }

  /** At the first touch: the sound starts (a browser lets it only then). */
  private start(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    const master = ctx.createDynamicsCompressor();
    master.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.connect(master);
    this.sounds = ctx.createGain(); this.sounds.connect(master);
    this.volumes(true);
    // a second of white noise, the stuff of the river, the wind, the fire's crackle and the knocks' thud
    const buf = this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ambience();
    if (this.levels.music !== 'off') this.player = new MusicPlayer(ctx, this.music, this.rng);
  }

  private volumes(now = false): void {
    if (!this.ctx || !this.music || !this.sounds) return;
    const t = this.ctx.currentTime, at = (g: GainNode, v: number) => now ? g.gain.setValueAtTime(v, t) : g.gain.setTargetAtTime(v, t, 0.08);
    at(this.music, LEVEL_GAIN[this.levels.music]);
    at(this.sounds, LEVEL_GAIN[this.levels.sounds]);
  }

  /** The river and the wind, always there (the birds, the crickets and the fire come and go: update). */
  private ambience(): void {
    const ctx = this.ctx!, out = this.sounds!;
    // the river: deep, rushing water
    const river = ctx.createBufferSource(), riverLow = ctx.createBiquadFilter(), riverHigh = ctx.createBiquadFilter();
    river.buffer = this.noise; river.loop = true;
    riverLow.type = 'lowpass'; riverLow.frequency.value = 650;
    riverHigh.type = 'highpass'; riverHigh.frequency.value = 90;
    this.river = ctx.createGain(); this.river.gain.value = AMBIENCE.river.gain * AMBIENCE.river.quiet;
    river.connect(riverLow).connect(riverHigh).connect(this.river).connect(out);
    river.start();
    // the wind: a breath that rises and falls
    const wind = ctx.createBufferSource(), band = ctx.createBiquadFilter(), windGain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    wind.buffer = this.noise; wind.loop = true; wind.playbackRate.value = 0.7;
    band.type = 'bandpass'; band.frequency.value = 520; band.Q.value = 0.9;
    lfo.frequency.value = 0.06; depth.gain.value = 260;
    lfo.connect(depth).connect(band.frequency);
    windGain.gain.value = AMBIENCE.wind.gain;
    wind.connect(band).connect(windGain).connect(out);
    wind.start(); lfo.start();
  }

  /** Each frame: the river by how near the falls he is, birds or crickets by the time of day, the fire's crackle, the
   *  mallet's knocks as he builds, and the music. */
  update(state: GameState, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, hour = dayFraction(state.time) * 24, p = state.player;
    this.asleep = p.task.kind === 'sleep';
    if (this.river) {
      const falls = this.layout.falls?.pool.pos, r = AMBIENCE.river;
      const v = r.gain * (falls ? nearness(dist(p.pos, falls), r.near, r.far, r.quiet) : r.quiet);
      this.river.gain.setTargetAtTime(v, now, 0.5);
    }
    if (this.layout.camp && !this.hushed) {
      const birds = AMBIENCE.birds, crickets = AMBIENCE.crickets;
      if (between(hour, birds.from, birds.to) && now >= this.nextBird) { this.bird(now); this.nextBird = now + birds.every[0] + this.rng.next() * (birds.every[1] - birds.every[0]); }
      if (between(hour, crickets.from, crickets.to) && now >= this.nextCricket) { this.cricket(now); this.nextCricket = now + crickets.every[0] + this.rng.next() * (crickets.every[1] - crickets.every[0]); }
      this.crackle(state, now, dt, hour);
    }
    // the mallet: a knock each CARPENTRY.knock seconds of work, as it lands
    if (p.task.kind === 'raise') {
      const k = Math.floor((state.underway[p.task.id] ?? 0) / CARPENTRY.knock + 1e-9);
      if (this.knocks >= 0 && k > this.knocks) this.play('knock');
      this.knocks = k;
    } else this.knocks = -1;
    if (this.levels.music !== 'off') this.player?.update(!between(hour, 6, 20));
  }

  /** The campfire's crackle (or the stone hearth's), by how near he is and the time of day. */
  private crackle(state: GameState, now: number, dt: number, hour: number): void {
    const f = AMBIENCE.fire, built = state.built.includes('stone_hearth') ? 'stone_hearth' : state.built.includes('campfire') ? 'campfire' : null;
    if (!built) return;
    const at = stepPlace(this.layout, built)?.pos;
    if (!at) return;
    const rate = f.perSecond * (between(hour, 20, 6) && !state.fireLow ? f.night : 1);
    if (this.rng.next() >= rate * dt) return;
    const loud = f.gain * nearness(dist(state.player.pos, at), f.near, f.far, 0.15) * (0.4 + this.rng.next() * 0.6);
    this.burst(now, 0.004 + this.rng.next() * 0.012, 1800 + this.rng.next() * 2500, 'highpass', loud);
  }

  /** A sound for what happened, unless it is too soon after the same one, the game is catching up, or he sleeps. */
  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.hushed || this.levels.sounds === 'off') return;
    if (this.asleep && cue !== 'sleep' && cue !== 'wake' && cue !== 'tap') return;
    const now = ctx.currentTime;
    if (now - (this.last.get(cue) ?? -1) < SOUND_GAP) return;
    this.last.set(cue, now);
    const t = now + 0.01;
    switch (cue) {
      case 'chop': this.tone(t, 150, 70, 0.14, 'sine', 0.5); this.burst(t, 0.05, 900, 'bandpass', 0.35); break;
      case 'clink': this.tone(t, 1850, 1800, 0.28, 'sine', 0.18); this.tone(t, 2790, 2760, 0.18, 'sine', 0.1); this.burst(t, 0.02, 3000, 'highpass', 0.15); break;
      case 'plip': this.tone(t, 520, 1150, 0.08, 'sine', 0.22); this.burst(t + 0.02, 0.06, 1400, 'bandpass', 0.08); break;
      case 'gain': this.tone(t + 0.05, 880, 1320, 0.07, 'sine', 0.08); break;
      case 'pick': this.burst(t, 0.07, 2200, 'bandpass', 0.12); this.tone(t + 0.04, 700, 1000, 0.06, 'sine', 0.08); break;
      case 'level': this.notes(t, [74, 78, 81, 86], 0.09, 0.9, 0.14); break;
      case 'goal': this.notes(t, [74, 81, 86, 90], 0.13, 1.6, 0.13); break;
      case 'made': this.notes(t, [81, 86], 0.1, 0.8, 0.12); break;
      case 'stage': this.knock(t, 300); this.knock(t + 0.12, 260); break;
      case 'knock': this.knock(t, 280 + this.rng.next() * 60); break;
      case 'whack': this.burst(t, 0.07, 520, 'bandpass', 0.35); this.tone(t, 170, 90, 0.12, 'sine', 0.3); break;
      case 'miss': this.sweep(t, 0.16, 700, 2200, 0.1); break;
      case 'bitten': this.tone(t, 120, 80, 0.14, 'sine', 0.35); this.burst(t, 0.05, 700, 'lowpass', 0.2); break;
      case 'down': this.tone(t, 95, 45, 0.3, 'sine', 0.45); this.burst(t, 0.08, 400, 'lowpass', 0.25); break;
      case 'knockout': this.tone(t, 95, 40, 0.4, 'sine', 0.5); this.notes(t + 0.25, [69, 65, 62], 0.16, 0.9, 0.1); break;
      case 'munch': this.burst(t, 0.05, 1500, 'bandpass', 0.18); this.burst(t + 0.13, 0.05, 1300, 'bandpass', 0.15); break;
      case 'sizzle': this.burst(t, 0.5, 3200, 'highpass', 0.12, 0.05); break;
      case 'burnt': this.burst(t, 0.6, 2600, 'highpass', 0.12, 0.05); this.tone(t + 0.1, 220, 180, 0.3, 'triangle', 0.08); break;
      case 'stoke': this.burst(t, 0.7, 500, 'lowpass', 0.25, 0.25); break;
      case 'store': for (let i = 0; i < 3; i++) this.knock(t + i * 0.07, 380 - i * 40); break;
      case 'drop': this.tone(t, 200, 120, 0.1, 'sine', 0.18); break;
      case 'sleep': this.notes(t, [69, 62], 0.35, 1.6, 0.1); break;
      case 'wake': this.bird(t); break;
      case 'drum': this.tone(t, 75, 45, 0.35, 'sine', 0.55); this.tone(t + 0.3, 75, 45, 0.35, 'sine', 0.55); break;
      case 'fanfare': this.notes(t, [74, 78, 81, 86, 90], 0.12, 2, 0.14); break;
      case 'tap': this.tone(t, 900, 700, 0.03, 'triangle', 0.05); break;
    }
  }

  /** A tone gliding from `from` to `to` Hz over `len` seconds, dying away. */
  private tone(t: number, from: number, to: number, len: number, type: OscillatorType, peak: number): void {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.sounds!); o.start(t); o.stop(t + len + 0.02);
  }

  /** A short burst of filtered noise (a crack, a thud, a hiss); `rise` seconds to swell in. */
  private burst(t: number, len: number, freq: number, type: BiquadFilterType, peak: number, rise = 0.002): void {
    const ctx = this.ctx!, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + rise); g.gain.exponentialRampToValueAtTime(0.0001, t + rise + len);
    s.connect(f).connect(g).connect(this.sounds!);
    s.start(t, this.rng.next() * 1.5); s.stop(t + rise + len + 0.02);
  }

  /** A breath of air sweeping from `from` to `to` Hz (a swing that misses). */
  private sweep(t: number, len: number, from: number, to: number, peak: number): void {
    const ctx = this.ctx!, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + len * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(this.sounds!); s.start(t); s.stop(t + len + 0.02);
  }

  /** A wooden knock: a hollow tone and a tap of noise. */
  private knock(t: number, freq: number): void {
    this.tone(t, freq, freq * 0.8, 0.09, 'triangle', 0.3);
    this.burst(t, 0.025, 1200, 'bandpass', 0.2);
  }

  /** Plucked notes one after another (a chime), each ringing for `ring` seconds. */
  private notes(t: number, midis: number[], gap: number, ring: number, peak: number): void {
    midis.forEach((m, i) => this.tone(t + i * gap, hz(m), hz(m) * 0.998, ring, 'sine', peak));
  }

  /** A bird's call: a few quick whistles, rising or falling, one of three songs. */
  private bird(t: number): void {
    const song = Math.floor(this.rng.next() * 3), base = 2600 + this.rng.next() * 1400, peak = AMBIENCE.birds.gain;
    const n = 2 + Math.floor(this.rng.next() * 4);
    for (let i = 0; i < n; i++) {
      const at = t + i * (song === 2 ? 0.16 : 0.1);
      if (song === 0) this.tone(at, base, base * 1.35, 0.07, 'sine', peak);
      else if (song === 1) this.tone(at, base * 1.3, base * 0.85, 0.09, 'sine', peak);
      else this.tone(at, base * (i % 2 ? 1.2 : 0.95), base * (i % 2 ? 1.05 : 1.15), 0.12, 'sine', peak * 0.8);
    }
  }

  /** A cricket's chirp: three fast pulses of a high note. */
  private cricket(t: number): void {
    const f = 4100 + this.rng.next() * 500, peak = AMBIENCE.crickets.gain;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.045, f, f, 0.03, 'sine', peak);
  }
}
