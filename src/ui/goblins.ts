// The goblin camp in the HUD (chapter 2, its last part): the notices that go with it, when the goblin chief comes out
// of his tent and when the camp is cleared. The bars and numbers over the goblins, and waking up back at camp after one
// knocked him out, are the creatures' (ui/rats.ts); the torn map floats up over him like a rat's hide (ui/hud.ts).
// Listens to events; never changes the game.
import type { EventBus } from '../core/events';
import type { Hud } from './hud';

/** The notices, in plain words (the player is "you", as in the other notices). */
export const GOBLIN_TEXT = {
  chiefOut: 'The goblin chief comes out of his tent!',
  cleared: 'You beat the goblin chief, and the goblins run off for good. You find a torn map. The gate stands open.',
};

/** Show the goblin camp's notices as they happen. */
export function goblinNotices(events: EventBus, hud: Hud): void {
  events.on(e => {
    if (e.type === 'chiefOut') hud.notice(GOBLIN_TEXT.chiefOut);
    else if (e.type === 'campCleared') hud.notice(GOBLIN_TEXT.cleared);
  });
}
