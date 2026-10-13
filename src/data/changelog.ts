// What changed in each version, in players' words, newest first. The game's "What's new" note (ui/news.ts) shows
// the versions a player hasn't seen yet. The first entry is this build: tests/changelog.test.ts checks it against
// package.json, so a version bump needs an entry here. The full record for the team is docs/CHANGELOG.md.

export interface Release { version: string; date: string; notes: string[] }

export const CHANGELOG: Release[] = [
  {
    version: '0.0.31', date: '13 Oct 2026', notes: [
      'Nothing at the camp shows until your goal needs it. Then a few stakes, a string and a little flag mark the spot.',
      'Everything at the camp now goes up stage by stage while he works at it with a mallet. Every knock trains Carpentry, and each level makes him a little quicker.',
      'Once he begins building something he sees it through. If the fire, a meal, bed or one of your taps calls him away, he goes back to it afterwards.',
      'Open Build to see your whole camp: what is under way, what you can build or upgrade, what each needs and how long it takes. Press one and he walks over to start.',
      'Right-click a building, or hold your finger on it, to see what you can do there: look in the chest, store everything, sleep, cook, upgrade and more.',
      'Once the chest is built, your tent can become a wall tent and then a log cabin, each bigger and more restful than the last. The campfire can become a stone hearth with a spit and log seats, and the firewood pile a woodshed.',
      'The storage chest is now furniture inside your shelter. Tap the shelter by day to look in it, and use Store everything to empty his backpack into it. At night, a tap sends him to bed.',
      'The log bench and the workbench are gone for now. If you had built them, what they took is back in your chest. A lean-to is now a wall tent, and a log hut a log cabin.',
    ],
  },
  {
    version: '0.0.30', date: '13 Oct 2026', notes: [
      'Once berries are part of his story he gets hungry about once a day. He eats from his pack or the chest, then gets back to work, and never touches food your goal is counting.',
      'Every night he goes to bed in the shelter at his bedtime, sleeps 6 hours and wakes rested. Pick the hour in Settings, from 22:00 to 01:00.',
      'Tap something while he sleeps and he will do it when he wakes up.',
      'Once the chest is built his tools live in it, and he fetches the one he needs.',
    ],
  },
  {
    version: '0.0.29', date: '13 Oct 2026', notes: [
      'The camp has a new look: canvas windows in wooden frames, wooden buttons, and parchment for his book, notes and thoughts.',
      'The buttons at the edge are a strip of planks with hand-drawn icons. If they ever don\'t all fit, the last ones tuck into a More button.',
      'Health and skill bars are twisted rope that fills with colour, and the clock hangs on a little wooden sign.',
    ],
  },
  {
    version: '0.0.28', date: '13 Oct 2026', notes: [
      'He sleeps until 7:00 now, and the moonlight moves across the sky, so you can watch the night turn to dawn.',
      'If you switch away or your screen goes off while he sleeps, that time no longer races by twenty times over.',
      'Tapping the goal or his thought while he sleeps no longer wakes him.',
      'One tap on "A cooked meal" is enough: he catches the fish, then takes them to the fire and cooks them himself.',
      'Building never uses what your current goal still needs.',
    ],
  },
  {
    version: '0.0.27', date: '13 Oct 2026', notes: [
      'He thinks out loud now: short thoughts over his head as he finds his way, all kept in a journal in his book.',
      'Tap the goal at the top, or his thought, and he sets off to do it.',
      'Your book is a survival book now: a journal, things you can make, food, places and tips. Pages come loose as you discover things.',
      'Once your camp is set up, the new Build button lets you build a log bench and a workbench wherever you like. Turn them and set them down where they show green.',
      'Building takes time and trains a new skill, Carpentry. Watch each thing go up stage by stage, and tap a half-built thing to send him back to it.',
      'Turn your tent into a lean-to, then a log hut. Better shelter, better rest.',
      "Cut reeds for fibre and dig clay by the river, and birch logs sometimes give bark. The Build list tells you where to find anything you're short of.",
    ],
  },
  {
    version: '0.0.26', date: '12 Oct 2026', notes: [
      'Tap the shelter at night and he goes to bed. The night speeds by, and he wakes up well rested: gathering goes faster until nightfall.',
      'A day and night dial beside the clock shows how far the day has gone.',
      'New buttons at the edge of the screen open your backpack, skills, book and settings. Close one with its x or the same button.',
      'Your backpack shows all 28 slots, with a picture for everything in it. Tap a thing to eat it or drop it.',
      "See what you're wearing and your bonuses, and what's in the chest and the firewood pile.",
      'The goal card is smaller and windows stay clear of it, so its Build button is always in reach. Text size and Start over are now in Settings.',
    ],
  },
  {
    version: '0.0.25', date: '12 Oct 2026', notes: [
      'A new goal before the goblin camp: Ready for the goblins. Practise at the dummy or fight rats until Attack, Strength and Defence reach 7.',
      'He switches what he trains by himself: when a skill reaches what your goal asks, and when the dummy has taught him all it can.',
      "If his food runs out in a fight and there's more in the chest, he walks back for it and carries on.",
      'When he empties his backpack into the chest, he keeps up to 5 meals on him.',
      "The Fish goal asks for 8 fish, so a few burnt ones don't leave you short for the meal.",
    ],
  },
  {
    version: '0.0.24', date: '12 Oct 2026', notes: [
      'Goblins have camped where the river leaves the valley. Beat all three before they get back up, and their chief comes out of his tent.',
      'Take food and wear your hide armour: goblins hit harder than rats. If they keep getting back up, train Attack and Strength.',
      "Beat the chief for a torn map, and the way along the river is open. That's the end of chapter 2!",
    ],
  },
  {
    version: '0.0.23', date: '12 Oct 2026', notes: [
      'Rats have moved into the woods down the river. Tap one to fight it; they only fight back if you start it.',
      'Beaten rats sometimes leave a hide, and come back to their nest after a while.',
      "He eats when he's hurt, fish first, and takes food from the chest if he has none. If a rat knocks him out, he wakes up back at camp with everything he had.",
      'Stitch rat hides into hide armour: a cap, a vest and a shield. Each goes on as soon as you make it and makes you harder to hit; the panel shows what you wear.',
      "Want a fresh start? Open What's new (top right) and tap Start over, twice to be sure.",
      'On phones the goal card and the panel use smaller text and take up less of the screen.',
    ],
  },
  {
    version: '0.0.22', date: '12 Oct 2026', notes: [
      'Chapter 2 begins: once the storage chest is built, new goals help you hold the camp.',
      'Build a training dummy beside the camp and make a stone club, your first weapon. Tap the dummy and he practises by himself.',
      'New skills: Attack, Strength and Defence (choose which to train under Train in the panel), and Vitality, which raises his health.',
      "Your health shows in the panel, and it comes back slowly when you're hurt. Eat berries and cooked fish from your backpack to heal.",
      'Berry bushes grow by the camp. Tap one and he picks them bush after bush; they grow back in a minute or so.',
      'Make a fishing rod from branches and fish the pool and the river from the bank. Tap the campfire to cook your fish: some burn at first, fewer as your Cooking gets better.',
      "The panel is smaller: the skill you're training shows its bar, and your other skills are listed with their levels under it. On a phone held sideways it sits on the right.",
    ],
  },
  {
    version: '0.0.21', date: '12 Oct 2026', notes: [
      'Gathering is slower and calmer: a log or a lump of ore every 7 or 8 seconds to begin with, quicker as he levels.',
      "He stops gathering once your current goal has enough, so your backpack no longer fills up with things you don't need yet.",
      'Firewood is now a pile beside the fire: chop 10 logs, then tap Stack. At nightfall he stokes the fire from the pile first. Tap the pile to stack more logs on it.',
      'The shelter needs its own 10 logs now, since the firewood stays in the pile.',
      'Hopping to the next tree or rock, he keeps his axe or pick in his hands.',
      'If you send him somewhere while he is off to stoke the fire, he goes back to it once he has nothing to do.',
      'With the game open in another tab or your screen off, time simply counts as play, at full speed and with no limit. The "While you were away" note is only for coming back after closing the game.',
      'Copper rocks are flecked with green now.',
      'Your stone axe and pickaxe look the part: rough knapped stone heads on a branch, bound with lashing.',
    ],
  },
  {
    version: '0.0.20', date: '12 Oct 2026', notes: [
      'He keeps working while the game is closed, at a fifth of his speed, for up to 2 hours. After that he waits for you to come back.',
      'When you come back, a short note says how long you were away and what he did: what he gathered, the XP and levels he earned, and whether he stoked the fire.',
      'With the game left open, in another tab or with your screen off, he works at full speed, and the note shows when you come back to it.',
      'Away time counts from the next time you close the game.',
    ],
  },
  {
    version: '0.0.19', date: '12 Oct 2026', notes: [
      'Build your storage chest beside the shelter. Once you have 10 logs and 3 copper ore, tap Build the storage chest on the goal card, or tap the chest spot.',
      "The chest is your camp's storage. When your backpack fills up, he carries it to the chest, empties it and goes back to work. Tap the chest to empty your backpack into it yourself. The panel shows what is in the chest, and it counts for your goals.",
      'At nightfall (20:00) he takes a few logs from the chest, or from his backpack, and stokes the campfire, then goes back to what he was doing. Once a night.',
      'With no logs at all, the fire burns low that night. Nothing is lost, and it burns brightly again once he stokes it.',
      'With the chest built, your camp is set up. More comes in later updates.',
    ],
  },
  {
    version: '0.0.18', date: '12 Oct 2026', notes: [
      'Build your shelter. Once you have the firewood, tap Build the shelter on the goal card, or tap the shelter spot by the fire. It takes the tarp, 4 planks and 10 logs, and your tent stays up when you come back.',
      'Then make a stone pickaxe from 2 branches and 3 stones, right where you stand, and mine 3 copper ore from the grey rocks with orange lumps.',
      'If you already had a pickaxe from an earlier version, you keep it, and the stone pickaxe goal is done for you.',
      'After the copper comes a storage chest. Building it comes in the next update. Your book has a page for each new goal.',
    ],
  },
  {
    version: '0.0.17', date: '12 Oct 2026', notes: [
      'Your book opens when you pick it up on the shore. It has a page for each goal: a few words about it, what you need with a tick for each thing you have, and a hint.',
      'Once you have your book, tap the goal card to open it at your current goal. Turn the pages with Previous and Next, or the arrow keys, and close it with the cross or Esc.',
      'Finished goals stay ticked and marked Done. The pages after your current goal are still stuck together from the river.',
    ],
  },
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
