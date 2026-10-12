// What changed in each version, in players' words, newest first. The game's "What's new" note (ui/news.ts) shows
// the versions a player hasn't seen yet. The first entry is this build: tests/changelog.test.ts checks it against
// package.json, so a version bump needs an entry here. The full record for the team is docs/CHANGELOG.md.

export interface Release { version: string; date: string; notes: string[] }

export const CHANGELOG: Release[] = [
  {
    version: '0.0.16', date: '12 Oct 2026', notes: [
      'Make your stone axe. Once the campfire is lit and you have 2 branches and 2 stones, tap Make the stone axe on the goal card. You work on it a few seconds, right where you stand.',
      'Then tap a birch tree to chop it. The next goal is Firewood: 10 birch logs.',
      'If you already had an axe from an earlier version, you keep it, and the stone axe goal is done for you.',
      'After the firewood comes a shelter. Building it comes in a later update.',
    ],
  },
  {
    version: '0.0.15', date: '12 Oct 2026', notes: [
      'Build your campfire. Once the wreck is salvaged and you have 3 planks and 4 stones, tap Build on the goal card, or tap the fire spot (the ring on the bare earth in the middle of the camp).',
      'You work there a few seconds, and the fire is lit: it flickers, smokes a little, and lights up the camp at night. It stays lit when you come back.',
      'Before that, you are told what to finish first, or what you still need.',
      'Finished goals stay finished, so using planks for the fire never sends you back to salvaging. Next up: a stone axe.',
    ],
  },
  {
    version: '0.0.14', date: '12 Oct 2026', notes: [
      'Tap a plank and you pick up every plank on the bank, one after another, the two in the smashed crate too. When they are all in your backpack, you stop.',
      'Tap a stone or a branch and you keep gathering them, nearest first. When none are left, you wait beside the next one to come back, until your backpack is full. While you wait, a ring on the ground fills up until it is back.',
      'The torn tarp and your book are picked up on their own, as before.',
      'Tap the grass, or anything else, to stop or do something different.',
    ],
  },
  {
    version: '0.0.13', date: '12 Oct 2026', notes: [
      'The pool below the falls and the river are one stretch of water now, with a natural shoreline and a pebbly sandy bank all the way round.',
      'The river winds a little, its banks gently curving and its width changing as it goes, and it flows on out of sight instead of stopping.',
      'The foot of the mountain looks like one: a slope of fallen rock against the wall, boulders big and small, rubble, moss and ferns fading into the grass. The bigger rocks are in your way; you step over the small ones.',
      'No more trees standing in the river: trees and bushes keep off the water and its bank.',
    ],
  },
  {
    version: '0.0.12', date: '12 Oct 2026', notes: [
      'A long way down: the falls now pour out of the mist down a towering wall of rock, and you wash up below with nothing, not even your tools.',
      'Wreckage came down with you. Tap the planks, the torn tarp, the smashed crate and your book to pick them up.',
      'Stones and branches lie round the clearing. Pick them up by hand; they come back after a while.',
      'The camp starts bare: no tent and no campfire until you build them. The goal at the top starts with salvaging the wreck.',
      "Tap your backpack to see what's in it. With nowhere to store things yet, you can drop stones, branches, logs or ore to make room.",
    ],
  },
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
