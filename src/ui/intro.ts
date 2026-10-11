// The welcome for a new player: what the game is about and what to do first. Shown once, at the start of a brand-new
// game, before the how-to-play hint; remembered in this browser only. Changes nothing in the game.

const SEEN_KEY = 'hearthfolk_intro_seen';

export class Intro {
  /** newGame: no save was found, so this is the player's very first look */
  constructor(newGame: boolean) {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* storage blocked: show it */ }
    if (!newGame || seen) return;
    const panel = document.getElementById('intro')!, hint = document.getElementById('hint'), ok = document.getElementById('introOk') as HTMLButtonElement;
    hint?.classList.add('waiting');                     // the hint follows once the welcome is read
    panel.hidden = false;
    ok.focus({ preventScroll: true });
    const close = () => {
      panel.hidden = true; hint?.classList.remove('waiting');
      try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
    };
    ok.addEventListener('click', close);
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
}
