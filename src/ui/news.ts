// "What's new": when the game has been updated since this player last played, a short note lists what changed
// (data/changelog.ts). The version they last saw is remembered in this browser only, like the save. The version
// button at the top and the Settings window (ui/settings.ts, which also has Start over since the UI foundation) open
// the note again. Reads nothing from the game and changes nothing in it.
import { CHANGELOG, type Release } from '../data/changelog';

const SEEN_KEY = 'hearthfolk_seen_version';
const SHOW_AT_MOST = 3;                // versions listed at once; older ones get one line

/** True when version `a` (like "0.0.10") is later than `b`, comparing each part as a number. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The releases to show on opening: none for a new player (the how-to-play hint is theirs) or one who has seen
 *  this version; every newer one for a returning player; just the latest for one from before this note existed. */
export function unseen(seen: string | null, returning: boolean, log: Release[] = CHANGELOG): Release[] {
  if (seen) return log.filter(r => isNewer(r.version, seen));
  return returning ? log.slice(0, 1) : [];
}

const seenStore = {
  get(): string | null { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } },
  set(version: string): void { try { localStorage.setItem(SEEN_KEY, version); } catch { /* storage blocked */ } },
};

export class News {
  private panel: HTMLElement;
  private body: HTMLElement;
  private ok: HTMLButtonElement;
  private current = CHANGELOG[0]!.version;
  /** what had keyboard focus when the note opened (the version button, or What's new in Settings), to go back to */
  private opener: HTMLElement | null = null;

  /** returning: this browser already had a game going (a save was loaded). */
  constructor(returning: boolean) {
    this.panel = document.getElementById('news')!;
    this.body = document.getElementById('newsBody')!;
    this.ok = document.getElementById('newsOk') as HTMLButtonElement;
    const button = document.getElementById('ver')!;
    button.textContent = `v${this.current}`;
    button.title = "What's new";
    button.setAttribute('aria-label', `Version ${this.current}: what's new`);
    button.addEventListener('click', () => (this.panel.hidden ? this.show() : this.close()));
    this.ok.addEventListener('click', () => this.close());
    this.panel.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    const fresh = unseen(seenStore.get(), returning);
    if (fresh.length) {
      document.getElementById('hint')?.classList.add('gone');      // a returning player knows how to play
      this.open(fresh, true);
    } else seenStore.set(this.current);
  }

  /** Every version's notes, newest first (the version button, or Settings). */
  show(): void { this.open(CHANGELOG, false); }

  private open(releases: Release[], isUpdate: boolean): void {
    const el = (tag: string, text?: string, className?: string) => {
      const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e;
    };
    this.body.replaceChildren();
    if (isUpdate) this.body.append(el('p', 'The game has been updated since you last played.', 'lead'));
    for (const r of releases.slice(0, SHOW_AT_MOST)) {
      const head = el('h3', `Version ${r.version}`); head.append(el('span', r.date.replace(/ \d{4}$/, ''), 'when'));
      const list = el('ul');
      for (const n of r.notes) list.append(el('li', n));
      this.body.append(head, list);
    }
    const older = releases.length - SHOW_AT_MOST;
    if (older > 0) this.body.append(el('p', `And ${older} earlier ${older === 1 ? 'update' : 'updates'}.`, 'older'));
    if (this.panel.hidden) {
      const active = document.activeElement;
      this.opener = active instanceof HTMLElement && active !== document.body && !this.panel.contains(active) ? active : null;
    }
    this.panel.hidden = false;
    this.body.scrollTop = 0;
    this.ok.focus({ preventScroll: true });
  }

  private close(): void {
    // keyboard focus in the note (or already lost) goes back to what opened it, while that is still on the screen
    const active = document.activeElement, lost = !active || active === document.body || this.panel.contains(active);
    const back = this.opener;
    this.opener = null;
    this.panel.hidden = true;
    seenStore.set(this.current);
    if (lost && back?.isConnected && back.getClientRects().length) back.focus({ preventScroll: true });
  }
}
