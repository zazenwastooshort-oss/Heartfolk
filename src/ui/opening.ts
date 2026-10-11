// The opening cinematic's screen furniture: black bars top and bottom, the fade and the white-out in the cloud, and a
// Skip button (tap or click, Esc, Space or Enter, a TV remote's OK). The game's HUD is hidden while it plays (a class
// on <body>, plus an optional callback). It plays once, for a brand-new game only: remembered in this browser under
// OPENING_SEEN_KEY. Builds its own DOM and styles; changes nothing in the game.
import type { OpeningFrame } from '../world/opening';

export const OPENING_SEEN_KEY = 'hearthfolk_opening_seen';
/** the class on <body> while the cinematic plays; the HUD hides under it */
export const OPENING_BODY_CLASS = 'hf-opening';

/** Should a new game open with the cinematic? Only for a new game, and only the first time in this browser. */
export function shouldPlayOpening(newGame: boolean): boolean {
  if (!newGame) return false;
  try { return localStorage.getItem(OPENING_SEEN_KEY) !== '1'; } catch { return true; }
}
export function markOpeningSeen(): void {
  try { localStorage.setItem(OPENING_SEEN_KEY, '1'); } catch { /* storage blocked: it may play again next time */ }
}
/** The player asked for less motion: play the short version without the fall. */
export function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const STYLE_ID = 'hf-opening-style';
const CSS = `
.hf-op { position: absolute; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
.hf-op-bar { position: absolute; left: 0; right: 0; height: 12%; background: #000; transform: scaleY(0); }
.hf-op-bar.top { top: 0; transform-origin: top; } .hf-op-bar.bottom { bottom: 0; transform-origin: bottom; }
.hf-op-fade, .hf-op-mist { position: absolute; inset: 0; opacity: 0; }
.hf-op-fade { background: #000; } .hf-op-mist { background: #f4f8fa; }
.hf-op-skip { position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom));
  pointer-events: auto; font: 600 15px/1 system-ui, sans-serif; letter-spacing: .02em; padding: 12px 18px; min-height: 44px;
  color: var(--ink, #f1e8d4); background: var(--panel, rgba(30,52,27,.92)); border: 1px solid rgba(241,232,212,.25);
  border-radius: 10px; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.35); opacity: .9; }
.hf-op-skip:hover, .hf-op-skip:focus-visible { opacity: 1; outline: 2px solid var(--accent, #e8a65e); outline-offset: 2px; }
.hf-op-skip kbd { font: inherit; opacity: .65; margin-left: 6px; }
body.${OPENING_BODY_CLASS} .topbar, body.${OPENING_BODY_CLASS} .hint, body.${OPENING_BODY_CLASS} .notice,
body.${OPENING_BODY_CLASS} .goal, body.${OPENING_BODY_CLASS} .skill, body.${OPENING_BODY_CLASS} .floats,
body.${OPENING_BODY_CLASS} .intro, body.${OPENING_BODY_CLASS} .news { visibility: hidden !important; }
`;

const SKIP_KEYS = new Set(['Escape', 'Esc', ' ', 'Spacebar', 'Enter', 'NumpadEnter', 'Select', 'Accept']);
const SKIP_CODES = new Set([13, 27, 32]);   // older TV browsers give only keyCode

export interface OpeningOverlayOptions {
  /** called once, when the player skips */
  onSkip(): void;
  /** told when the HUD should hide (true) and come back (false), besides the class on <body> */
  hideHud?(hidden: boolean): void;
}

export class OpeningOverlay {
  private el = document.createElement('div');
  private top = document.createElement('div');
  private bottom = document.createElement('div');
  private fade = document.createElement('div');
  private mist = document.createElement('div');
  readonly skip = document.createElement('button');
  private skipped = false;
  private onKey = (e: KeyboardEvent) => {
    if (!SKIP_KEYS.has(e.key) && !SKIP_CODES.has(e.keyCode)) return;
    e.preventDefault(); e.stopPropagation(); this.doSkip();
  };

  constructor(container: HTMLElement, private opts: OpeningOverlayOptions) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; document.head.appendChild(style);
    }
    this.el.className = 'hf-op';
    this.top.className = 'hf-op-bar top'; this.bottom.className = 'hf-op-bar bottom';
    this.fade.className = 'hf-op-fade'; this.mist.className = 'hf-op-mist';
    this.skip.className = 'hf-op-skip'; this.skip.type = 'button';
    this.skip.innerHTML = 'Skip <kbd aria-hidden="true">&#9654;&#9654;</kbd>';
    this.skip.setAttribute('aria-label', 'Skip the opening');
    this.skip.addEventListener('click', e => { e.stopPropagation(); this.doSkip(); });
    this.skip.addEventListener('pointerdown', e => e.stopPropagation());   // not a tap on the ground underneath
    this.el.append(this.mist, this.fade, this.top, this.bottom, this.skip);
    container.appendChild(this.el);
    window.addEventListener('keydown', this.onKey, true);
    document.body.classList.add(OPENING_BODY_CLASS);
    opts.hideHud?.(true);
    this.skip.focus({ preventScroll: true });     // a remote's OK presses it
  }

  private doSkip(): void { if (this.skipped) return; this.skipped = true; this.opts.onSkip(); }

  update(f: OpeningFrame): void {
    this.top.style.transform = this.bottom.style.transform = `scaleY(${f.letterbox.toFixed(3)})`;
    this.fade.style.opacity = f.fade.toFixed(3);
    this.mist.style.opacity = (0.92 * f.mist).toFixed(3);
  }

  /** Take it all away and give the HUD back. */
  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.el.remove();
    document.body.classList.remove(OPENING_BODY_CLASS);
    this.opts.hideHud?.(false);
  }
}
