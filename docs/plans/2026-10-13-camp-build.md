# The camp build: brief (approved 13 Oct 2026)

This is the brief for the camp build, written from the owner's own words. Every agent working on it reads this first. Where this brief and the owner's words seem to differ, the owner's words win: say so in your report.

## The owner's words (verbatim)

12 Oct 2026, 20:12Z (deepening chapters 1 and 2):

> the current content is too shallow, we need to expand on any possible way, anything from adding materials, being able to upgrade your tent into something sturdier, adding sleep by clicking the tent

12 Oct 2026, 20:25Z:

> On the camp upgrades, is it possible to do placement yourself? or even if its fixed position that its not visiable until you put it down to build, and as you build you see it progress into that structure, this is the carpentry skill and that shoulda lso take time, any skill and action should take time, becuase thats the grind, seein gyour vilage grow

13 Oct 2026, answering the lead's camp questions (the lead's recommendation in each item, then the owner's answer):

> 1. The outlines. I recommend nothing shows until a goal asks for it. [...] When the goal comes up, a marker shows where it goes. Then it goes up in stages and trains Carpentry, as you asked. - Answer: sure, fixed location and maybe as a later build we add object which player can place to customize it a bit. The build section was a great suggestion, and thats where we can see if we have anything to upgreade anything to build etc, give a good overview and pressing it make the charachter walk to the building to start upgrading.
>
> 2. [...] nothing shows until it's needed; - agreed
> you watch it go up; -Answer: agreed but player is commited to building it, and with this we should add a nice building animation movment, with a hammer or something. (later idea build is that you oversee others building it for you, by holding a blue print but thats for the village chapter).
> you upgrade it by walking up to it. - answer: you upgrade by the building tab, and or right clicking the object
>
> 3. [...] answer: upgrade is choosen from the build tab, and the size will change and so should the asthetics of the building. Bigger, more sections etc, here i would suggest you provide me with some design options before we commit into the build.
>
> 4. [...] answer: carpentry is now just another skill, and any building effoprt gives xp, and we should maybe consider hoow long it take to build something.

13 Oct 2026, on the chest:

> maybe chest is just "furniture" in the tent or house etc, rather than an individual object?

13 Oct 2026, choosing from the design pictures (docs/designs/):

> i like the mix, all the other ones are fine however i like the wall tent and the log cabin for the rest are good upgrades (minus the storage chest visual)

13 Oct 2026, approving this brief:

> no remove the bench and workbench, these can be added later if needed, timing is irrelevant do the work which needs to be taken, no rushing, i rather this gets done porperly. High proroptyu

Related decisions already in the game or being built (docs/PLAN.md decision log, 13 Oct): tools live in the chest once it stands and he fetches what he needs ("tools should be in the chest, because later there will be outfits that give skill bonuses etc."); going to bed is mandatory every night with a bedtime the player sets; at the camp there is no Jobs tab.

## In

1. **Nothing shows until its goal comes up.** Unbuilt camp buildings (campfire, firewood pile, shelter, training dummy) show no outline, ring or tap area from the start. When the current goal asks for one, a small marker shows its spot (for example a few stakes with a string between them), and the goal card and the Build tab can send him there. The spots stay fixed.
2. **Everything is built in stages, with Carpentry XP.** The campfire, firewood pile, tent, the storage chest, the training dummy and every upgrade go up in visible stages over time while he works beside it, each knock giving Carpentry XP. He holds a hammer (or mallet) and swings it while building (a quick placeholder model and an existing swing clip are fine). Once begun, the player is committed: what it needs is used when he begins, and a half-built thing stays until he finishes it; sent elsewhere (stoking, a meal, bed, a tap), he comes back to it after.
3. **Build times** (a first proposal, tunable in data): campfire 20 s, firewood pile 25 s, training dummy 40 s, storage chest 45 s, tent 60 s, wall tent 2 min, log cabin 4 min, stone hearth and woodshed about 90 s each.
4. **Carpentry is just another skill.** Every building effort gives Carpentry XP. No Carpentry level forces a detour (remove the level gates). If a level matters at all, a higher level may make building a little quicker, like the other skills; keep it simple and say what you did.
5. **The Build tab is the camp's overview.** It lists what can be built now, what can be upgraded, what each needs (what's missing, and what is kept for the current goal), and how far along anything begun is. Pressing one sends him walking to the building to begin or carry on. A right click on a building (a long press on a phone) offers what can be done with it: Upgrade (to the next step, or what it still needs), Sleep (the shelter, at night), Store (the shelter, for the chest inside). The goal card's button keeps working for the goal's building.
6. **The shelter's line: tent, wall tent, log cabin.** The wall tent is design C's first step (a squared timber frame with the old canvas, a raised plank floor, a porch, guy ropes, a stovepipe) and the log cabin is design A's second step (round notched logs, a loft, a stone chimney, a covered porch). Models in `wt/designs/designs/models.ts` (`wallTent`, `logCabin`), pictures in `docs/designs/`. Each upgrade is chosen from the Build tab or by right-clicking the shelter, is bigger, and goes up in stages (footings, frame, half built, then built) drawn in code like `render/building.ts`. Sleep works in each; a better shelter gives a bigger rested boost (tent 0.25, wall tent 0.35, log cabin 0.5).
7. **The stone hearth** (the campfire's upgrade: a raised stone ring, a spit with fish, log seats; `stoneHearth`) and **the woodshed** (the firewood pile's upgrade: a bark roof, logs end-on that still show how many there are, a chopping block; `woodshed`), from the same file. Cooking and stoking work at them as at the campfire and the pile.
8. **The storage chest is furniture inside the shelter**, not an object of its own and not a storage shed. Chapter 1's last goal becomes a storage chest in his shelter. Storing, fetching tools and taking food all happen at the shelter's door. The chest is seen just inside the tent's open front, and by the door or on the porch of the wall tent and the log cabin. Tapping the shelter by day opens what is stored (the Backpack window's chest section); at night it sends him to bed.
9. **Proposed materials** (tunable): wall tent 12 birch logs and 8 fibre; log cabin 30 birch logs, 10 clay and 12 stones; stone hearth 12 stones and 4 clay; woodshed 10 birch logs and 6 bark. The camp's own buildings keep what they need today.
10. **Remove** the log bench and the workbench, and the old lean-to and log hut, with their Build entries, models and data.
11. **The camp's layout** makes room for the bigger buildings: walking, tap areas and rings follow each building's size at each step; the chest's old spot is gone; the woodpile and hearth have room around the fire.
12. **Saves.** Players have 0.0.22 to the latest saves. Everything they have is kept: a built chest moves inside the shelter with its contents; a built or begun lean-to or log hut becomes the wall tent or the log cabin (begun: keep the progress or give back what it took, and say which); a placed log bench or workbench is removed and what it took is given back to the chest. The save format stays at its current number unless a migration is truly needed; old saves load without loss.

## Not in (for later)

- Placing camp buildings yourself (the spots stay fixed).
- More furniture (shelves, a tool rack or wardrobe for outfits), decorations the player places, the log bench and workbench.
- A third upgrade step, or upgrades for the training dummy.
- Overseeing others building from a blueprint (the village chapter).
- Changing the goals' order or chapter length (to be settled with the owner; these builds add about 3 minutes to chapter 1: report it).
- The 3D world's look (sky, weather, textures), a start screen.

## Done means

- Every item under In works in the game, checked in a new game from the start (phone and desktop sizes) and with an old save, and each is covered by tests.
- The full check passes (typecheck, every test, the playthrough bot) and `npm run build:web` works.
- The report lists, item by item against the owner's words above, what was done, anything done differently and why, and the questions for the owner.
