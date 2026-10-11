// What changed in each version, in players' words, newest first. The game's "What's new" note (ui/news.ts) shows
// the versions a player hasn't seen yet. The first entry is this build: tests/changelog.test.ts checks it against
// package.json, so a version bump needs an entry here. The full record for the team is docs/CHANGELOG.md.

export interface Release { version: string; date: string; notes: string[] }

export const CHANGELOG: Release[] = [
  {
    version: '0.0.11', date: '12 Oct 2026', notes: [
      'A new beginning: you wash up below a waterfall and make camp at its foot.',
      'A goal at the top shows what to do next, starting with the campfire.',
      'New players get a short welcome that explains the game.',
    ],
  },
  {
    version: '0.0.10', date: '11 Oct 2026', notes: [
      "Your character carries his axe or pick on his back whenever he walks, and takes it out when he gets to a tree or rock.",
      'This note: after an update it shows what changed. Tap "What\'s new" at the top to see it again.',
      'The panels are forest green now, easier on the eyes than the old bright ones.',
    ],
  },
  {
    version: '0.0.9', date: '11 Oct 2026', notes: [
      "A backpack with 28 slots. When it's full, your character takes it to the bank, empties it and goes back to work.",
      'Tap the bank to empty your backpack yourself.',
      'The panel shows your backpack and everything in your bank.',
    ],
  },
  {
    version: '0.0.8', date: '11 Oct 2026', notes: [
      'When a rock runs out of ore, your character walks to the nearest rock that still has some.',
    ],
  },
  {
    version: '0.0.7', date: '11 Oct 2026', notes: [
      'When a tree falls, your character walks on to the nearest standing tree.',
      'Arms that bend: both hands stay on the handle as he swings.',
      'Your character jogs, twice as fast as before.',
      'Dragging sideways turns the camera the way your finger moves.',
    ],
  },
  {
    version: '0.0.6', date: '11 Oct 2026', notes: [
      'Woodcutting: chop the birches south of the square. The oaks by the river need Woodcutting level 10.',
      'Trees fall, leave a stump and grow back.',
      'A panel with your Mining and Woodcutting levels.',
    ],
  },
  {
    version: '0.0.5', date: '11 Oct 2026', notes: [
      'The village is rebuilt like a real village, round a town square.',
    ],
  },
];
