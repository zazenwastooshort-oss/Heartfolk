// What a press on the scene is (the camp build's stage 5, D24), worked out from the pointer's own events alone, with
// nothing of the page, so the tests can play it any sequence of presses (tests/campmenu.test.ts, T5.5). ui/input.ts
// feeds it every pointer going down, moving, coming up or being cancelled, and the time while a finger is held, and
// does what it says:
//   - a tap: a press that comes up where it went down (within LONG_PRESS.slop): the left mouse button, a finger or a pen;
//   - a menu: the right mouse button clicked (never a tap), or a finger or pen held still for LONG_PRESS.ms (its release
//     sends nothing); the browser's own menu, which Android shows after a long press, opens nothing more;
//   - a turn: one pointer dragged (the camera turns; a right-button drag too, as before), a finger only once it has
//     moved beyond the slop, so one held still doesn't nudge the camera on its way to a long press;
//   - a pinch: two fingers, never a menu or a tap.
// The middle button only drags. Changes nothing in the game.
import { LONG_PRESS } from '../data/input';

export type PointerKind = 'mouse' | 'touch' | 'pen';
/** A pointer event as the classifier needs it: which pointer, what kind, which button went down (0 left, 2 right),
 *  where (px) and when (ms). */
export interface PointerAt { id: number; kind: PointerKind; button: number; x: number; y: number; t: number }

export type Gesture =
  | { type: 'turn'; dx: number; dy: number }
  | { type: 'pinch'; scale: number }
  | { type: 'tap'; x: number; y: number }
  | { type: 'menu'; x: number; y: number; by: 'click' | 'hold' };

/** The press under way: the first pointer down, where and when, and what it has become. */
interface Press { id: number; kind: PointerKind; button: number; x: number; y: number; t: number; moved: boolean; held: boolean; pinched: boolean }

export class Gestures {
  private pointers = new Map<number, { x: number; y: number }>();
  private press: Press | null = null;
  private pinchD = 0;

  constructor(private rule: { ms: number; slop: number; cue: number } = LONG_PRESS) {}

  /** How many pointers are down. */
  get down(): number { return this.pointers.size; }

  /** Whether pointer `id` is down (a mouse moving with no button down is only passing over). */
  isDown(id: number): boolean { return this.pointers.has(id); }

  /** A pointer went down. The first starts a press; a second makes it a pinch. */
  start(p: PointerAt): Gesture[] {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 1) this.press = { id: p.id, kind: p.kind, button: p.button, x: p.x, y: p.y, t: p.t, moved: false, held: false, pinched: false };
    else if (this.press) { this.press.pinched = true; this.press.moved = true; this.pinchD = 0; }
    return [];
  }

  /** A pointer moved (one that is down; a mouse just passing over is the caller's, for the hover). */
  move(p: PointerAt): Gesture[] {
    const prev = this.pointers.get(p.id), press = this.press;
    if (!prev) return [];
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y), scale = this.pinchD ? d / this.pinchD : 0;
      this.pinchD = d;
      return scale ? [{ type: 'pinch', scale }] : [];
    }
    if (this.pointers.size !== 1) return [];
    if (press) {
      // held until the menu opened: the finger stays where it is, and the camera with it
      if (press.held) return [];
      if (Math.hypot(p.x - press.x, p.y - press.y) > this.rule.slop) press.moved = true;
      if (press.kind !== 'mouse' && !press.moved) return [];
    }
    return [{ type: 'turn', dx: p.x - prev.x, dy: p.y - prev.y }];
  }

  /** A pointer came up: the press it ends is a tap, a right-click menu, or nothing (dragged, pinched, held). */
  end(p: PointerAt): Gesture[] {
    if (!this.pointers.delete(p.id)) return [];
    if (this.pointers.size < 2) this.pinchD = 0;
    const press = this.press;
    if (!this.pointers.size) this.press = null;
    if (!press || press.id !== p.id || press.moved || press.held || press.pinched) return [];
    if (Math.hypot(p.x - press.x, p.y - press.y) > this.rule.slop) return [];
    if (press.kind !== 'mouse' || press.button === 0) return [{ type: 'tap', x: press.x, y: press.y }];
    return press.button === 2 ? [{ type: 'menu', x: press.x, y: press.y, by: 'click' }] : [];
  }

  /** A pointer was cancelled (the browser took it over): it ends nothing. */
  cancel(p: PointerAt): Gesture[] {
    if (!this.pointers.delete(p.id)) return [];
    if (this.pointers.size < 2) this.pinchD = 0;
    if (!this.pointers.size || this.press?.id === p.id) this.press = null;
    return [];
  }

  /** Time passes (ms) while a finger is held: held still long enough, the menu opens, once. */
  tick(t: number): Gesture[] {
    const press = this.press;
    if (!press || press.kind === 'mouse' || press.moved || press.held || press.pinched || t - press.t < this.rule.ms) return [];
    press.held = true;
    return [{ type: 'menu', x: press.x, y: press.y, by: 'hold' }];
  }

  /** The browser's own menu was asked for (a right click, or Android's after a long press): it opens nothing of its
   *  own; ours opens from the press itself. */
  contextMenu(): Gesture[] { return []; }

  /** The ring round a finger held still (D24): where, and how far it has filled (0..1), from LONG_PRESS.cue on; null
   *  when no finger is held still (or the menu has opened). */
  cue(t: number): { x: number; y: number; progress: number } | null {
    const press = this.press;
    if (!press || press.kind === 'mouse' || press.moved || press.held || press.pinched) return null;
    const since = t - press.t;
    if (since < this.rule.cue) return null;
    return { x: press.x, y: press.y, progress: Math.min(1, (since - this.rule.cue) / (this.rule.ms - this.rule.cue)) };
  }

  /** Where the press under way went down, and with what (null when none is). */
  get pressAt(): { x: number; y: number; kind: PointerKind } | null {
    return this.press ? { x: this.press.x, y: this.press.y, kind: this.press.kind } : null;
  }
}
