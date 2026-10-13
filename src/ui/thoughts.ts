// His thoughts over his head (the survival book): a small, calm bubble, cream on forest green, shown for a few seconds
// (THOUGHT.show) and fading, each time he says a thought out loud (systems/thoughts.ts sets GameState.thoughts.last and
// saidAt; the rules for when are there). One at a time: a new one takes the old one's place, once that has been up a
// moment (MIN_UP), so two goals' thoughts in quick succession can both be read. A tap on it sends him off
// on the goal's next step, as the goal card does (the 'next' command). A thought said while the page caught up on time
// it wasn't looked at (a background tab) shows only if it is still fresh; one said before the page opened (away time)
// never does: it is in his journal. The first frame is different: it catches up the page opening and the models
// loading as play, which can take a few seconds on a slow phone, so a thought said since the page opened shows then
// however old it is (a new game's first thought). While a note is open over the game (the welcome, "What's new",
// "While you were away"), or a window covers the spot over his head (the book opening as he picks it up, on a phone),
// the bubble waits, so it isn't missed behind it. Reads state; never changes the game.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Command } from '../systems/commands';
import type { View } from '../render/view';
import { THOUGHT, thoughtDef } from '../data/thoughts';

/** How high over his feet the bubble's tail points (m): above the floating numbers. */
const ABOVE = 2.5;
/** Play seconds after it was said that a thought is still fresh enough to show. */
const FRESH = 3;
/** Seconds the bubble takes to fade out at its end (as .thought's transition in index.html). */
const FADE = 0.5;
/** Real seconds a bubble stays up at least before the next takes its place. */
const MIN_UP = 2.5;

export class ThoughtBubble {
  private el = document.createElement('div');
  private seen: number | null;          // saidAt as last seen, so each thought shows once
  private opened: number;               // the time of play when the page opened
  private first = true;                 // the first frame is still to come
  private left = 0;                     // real seconds it stays up
  private next: string | null = null;   // a thought waiting to take its place (MIN_UP)
  private at = new THREE.Vector3();

  constructor(state: GameState, private view: View, queue: Command[]) {
    this.seen = state.thoughts.saidAt;  // whatever was said before the page opened is in his journal
    this.opened = state.time;
    this.el.className = 'thought';
    this.el.setAttribute('role', 'button');
    this.el.hidden = true;
    this.el.addEventListener('click', e => {
      e.stopPropagation();
      queue.push({ type: 'next' });
      this.left = Math.min(this.left, FADE);
    });
    document.getElementById('floats')!.append(this.el);
  }

  update(state: GameState, dt: number): void {
    const t = state.thoughts;
    if (t.saidAt !== this.seen) {
      this.seen = t.saidAt;
      // fresh: said in the last moments of play, or, at the first frame (the page opening and the models loading,
      // caught up as play), since the page opened
      const fresh = t.saidAt !== null && (state.time - t.saidAt <= FRESH || (this.first && t.saidAt > this.opened));
      if (t.last && fresh) this.next = t.last;
    }
    this.first = false;
    // the waiting thought takes the bubble once the one up has been read a moment
    const def = this.next && (this.left <= 0 || THOUGHT.show - this.left >= MIN_UP) ? thoughtDef(this.next) : undefined;
    if (def) {
      this.next = null;
      this.el.textContent = def.text;
      this.el.setAttribute('aria-label', `${def.text} Tap to set off.`);
      this.el.hidden = false;
      this.left = THOUGHT.show;
      this.el.classList.remove('show');
      void this.el.offsetWidth;          // start the fade in from nothing
    }
    if (this.left <= 0) return;
    // over him where he is drawn (smoothed between the game's steps, as the camera follows him), not where the game has
    // him: the steps would make the bubble shake as he walks
    const p = this.view.minerPos(), b = this.view.renderer.domElement.getBoundingClientRect();
    const v = this.at.set(p.x, ABOVE, p.z).project(this.view.cam.camera);
    const tipX = (v.x + 1) / 2 * b.width, tipY = (1 - v.y) / 2 * b.height;
    // a note over the game, or a window over the spot above his head: the bubble waits until it is closed
    const waiting = !!document.querySelector('.win.note:not([hidden])') || (v.z <= 1 && this.covered(b.left + tipX, b.top + tipY - 12));
    this.el.hidden = waiting;
    if (waiting) return;
    this.left -= dt;
    this.el.classList.toggle('show', this.left > FADE);
    if (this.left <= 0) { this.el.hidden = true; return; }
    if (v.z > 1) { this.el.style.opacity = '0'; return; }        // behind the camera
    this.el.style.opacity = '';
    const half = this.el.offsetWidth / 2 + 8;
    const x = Math.min(Math.max(tipX, half), b.width - half);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${Math.max(tipY, this.el.offsetHeight + 8)}px`;
  }

  /** Whether an open window covers this spot (in the page's coordinates). */
  private covered(x: number, y: number): boolean {
    for (const w of document.querySelectorAll<HTMLElement>('.wins > .win:not([hidden])')) {
      const r = w.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }
}
