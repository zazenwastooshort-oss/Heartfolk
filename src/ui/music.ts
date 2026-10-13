// The music, made by the game's own code (13 Oct 2026, the owner's pick for sound: "Made in code"; numbers in
// data/sound.ts): now and then a short piece, a quiet plucked melody over soft held chords, then a long rest, so it
// never wears on the ear. By day a major key, by night a minor one, slower. `compose` writes a piece from a random
// number source and reads nothing else, so tests can check it; MusicPlayer plays the pieces through Web Audio.
import type { Rng } from '../core/rng';
import { MUSIC } from '../data/sound';

/** A note of a piece: `at` seconds from its start, `midi` its pitch, `dur` seconds, `vel` 0 to 1. */
export interface Note { at: number; midi: number; dur: number; vel: number }
/** A piece: the melody, the held chords (a note each), and how long it lasts in seconds. */
export interface Piece { melody: Note[]; pads: Note[]; length: number; night: boolean }

/** A note's pitch in hertz. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The rhythms a bar's melody picks from, in beats (four to a bar). */
const RHYTHMS: readonly (readonly number[])[] = [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [2, 1, 1], [1, 1, 2], [0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2]];

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;

/** A piece for the time of day: `bars` bars over one of the chord progressions (twice through), its melody moving
 *  mostly by step on the key's five-note scale, landing on the chord at the start of each bar, now and then resting,
 *  and ending on the key's root. */
export function compose(rng: Rng, night: boolean): Piece {
  const key = night ? MUSIC.night : MUSIC.day, beat = 60 / key.bpm, bar = 4 * beat;
  const progression = pick(rng, MUSIC.chords);
  // a degree of the seven-note scale (0 the root, 7 the root an octave up) as a pitch above `base`
  const pitch = (base: number, degree: number) => base + key.scale[((degree % 7) + 7) % 7]! + 12 * Math.floor(degree / 7);
  // the melody's notes: the five-note scale over an octave and a half from the root
  const range: number[] = [];
  for (let o = 0; o < 2; o++) for (const s of key.pentatonic) { const m = key.root + 12 * o + s; if (m <= key.root + 19) range.push(m); }
  const melody: Note[] = [], pads: Note[] = [];
  let at = range.indexOf(key.root + key.pentatonic[2]!);
  for (let b = 0; b < MUSIC.bars; b++) {
    const chord = progression[b % progression.length]!, start = b * bar;
    for (const d of [0, 2, 4]) pads.push({ at: start, midi: pitch(key.root - 12, chord + d), dur: bar, vel: 0.7 });
    const last = b === MUSIC.bars - 1;
    const rhythm = last ? [2, 2] : pick(rng, RHYTHMS);
    let t = start;
    rhythm.forEach((beats, i) => {
      const end = last && i === rhythm.length - 1;
      if (end) at = range.indexOf(key.root + 12) >= 0 ? range.indexOf(key.root + 12) : 0;
      else if (i === 0) {
        // on the bar's first beat, the nearest note of its chord
        const tones = [0, 2, 4].map(d => pitch(key.root, chord + d) % 12);
        let best = at, bestD = Infinity;
        range.forEach((m, j) => { const dist = Math.abs(j - at); if (tones.includes(m % 12) && dist < bestD) { best = j; bestD = dist; } });
        at = best;
      } else {
        const stepBy = pick(rng, [-2, -1, -1, 1, 1, 2, 0]);
        at = Math.max(0, Math.min(range.length - 1, at + stepBy));
      }
      const rest = !end && i > 0 && rng.next() < 0.18;
      if (!rest) melody.push({ at: t, midi: range[at]!, dur: beats * beat, vel: 0.65 + rng.next() * 0.35 });
      t += beats * beat;
    });
  }
  return { melody, pads, length: MUSIC.bars * bar, night };
}

/** The seconds of rest after a piece, between MUSIC.rest's shortest and longest. */
export const restAfter = (rng: Rng) => MUSIC.rest[0] + rng.next() * (MUSIC.rest[1] - MUSIC.rest[0]);

/** Plays pieces through Web Audio into `out`: the first MUSIC.first seconds after it starts, then one after each rest. */
export class MusicPlayer {
  private nextAt: number;

  constructor(private ctx: AudioContext, private out: AudioNode, private rng: Rng) {
    this.nextAt = ctx.currentTime + MUSIC.first;
  }

  /** Each frame: when the next piece is due (half a second ahead), it is written for the time of day and scheduled. */
  update(night: boolean): void {
    const now = this.ctx.currentTime;
    if (now + 0.5 < this.nextAt) return;
    const start = Math.max(now + 0.05, this.nextAt), piece = compose(this.rng, night);
    for (const n of piece.pads) this.pad(start + n.at, n);
    for (const n of piece.melody) this.pluck(start + n.at, n);
    this.nextAt = start + piece.length + restAfter(this.rng);
  }

  /** A plucked note, like a soft lute or kalimba: a sine with a little of its octave, dying away. */
  private pluck(when: number, n: Note): void {
    const ctx = this.ctx, f = hz(n.midi), g = ctx.createGain(), tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 2600;
    const a = ctx.createOscillator(), b = ctx.createOscillator(), bg = ctx.createGain();
    a.type = 'sine'; a.frequency.value = f;
    b.type = 'triangle'; b.frequency.value = f * 2; bg.gain.value = 0.18;
    const peak = MUSIC.melody * n.vel, ring = Math.min(2.4, n.dur + 0.9);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + ring);
    a.connect(g); b.connect(bg).connect(g); g.connect(tone).connect(this.out);
    a.start(when); b.start(when); a.stop(when + ring + 0.05); b.stop(when + ring + 0.05);
  }

  /** A held chord note: two soft, slightly apart triangles, swelling in and out. */
  private pad(when: number, n: Note): void {
    const ctx = this.ctx, f = hz(n.midi), g = ctx.createGain(), tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 900;
    const peak = MUSIC.pad * n.vel, end = when + n.dur;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + Math.min(1.2, n.dur / 3));
    g.gain.setValueAtTime(peak, end - 0.3);
    g.gain.linearRampToValueAtTime(0, end + 1.2);
    for (const detune of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = detune;
      o.connect(g); o.start(when); o.stop(end + 1.3);
    }
    g.connect(tone).connect(this.out);
  }
}
