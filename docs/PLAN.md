# Hearthfolk: Design & Development Plan

Version 0.8, 11 Oct 2026. This file is the source of truth for the game; every change to it or to the game is logged in [CHANGELOG.md](CHANGELOG.md).

Hearthfolk is an idle skilling game you leave running like an ant farm. You send your character to work in a living village, they level up the long OSRS way, and their earnings grow the world.

## Overview

Pre-production: the design is settled enough to build the first playable slice, and two prototypes already show its parts.

| What | Detail |
| --- | --- |
| Genre | Idle skilling with a living village |
| Players | OSRS fans without the hours for the grind, idle-game players, and anyone who wants a calm screen to leave on |
| Platforms | Phone and tablet first (Android), PC browser, TV as an ambient screen |
| Inspired by | Old School RuneScape (skills and the road to 99), Eatventure (clean look, unlock ladder), ant farms and colony sims (a society that runs itself) |
| Working title | Hearthfolk (see open questions) |

Prototypes, in `prototypes/` (double-click to open in a browser):

- `wanderskill.html`: the skilling loop, with five skills, the 1 to 99 XP curve, tools, selling and offline progress.
- `hearthfolk.html`: the living village, with villagers who have needs and routines, a chronicle, seasons, day and night, and an ambient TV mode.

## Design pillars

Every feature is checked against these five; one that adds nothing for someone watching for five minutes waits.

- **Satisfying to watch.** Motion, light and small events make the screen worth leaving on.
- **You send, they do.** Tap a place or a person; your character walks there and keeps working until you send them elsewhere.
- **The village lives on its own.** NPCs follow their routines whether or not you interact, and they also run the services you need.
- **Progress shows on the map.** XP and gold become things you can see: a better axe in hand, a new field, fog pulled back.
- **Cheap to build, cheap to extend.** Every model and picture comes from a recipe and one shared palette, so new things are cheap to add and always match.

## Core loop

```mermaid
flowchart LR
    send["Send your character<br/>tap a tree, rock, forge or NPC"] -->|walks there| work["Work the task<br/>chop, mine, smelt, cook"]
    work -->|each action pays| xp["Earn XP and items<br/>levels unlock better tiers"]
    xp -->|via the bank| sell["Sell to the merchant<br/>only while the stall is open"]
    sell -->|gold| grow["Buy and grow<br/>tools, land, buildings"]
    grow -->|new places| send
```

Better tools and more land make every round faster and richer. You tap once and the loop runs on its own until you change the task.

| Session | What you do |
| --- | --- |
| A glance, about 10 seconds | See what changed, and send your character somewhere new |
| A sit-down, about 5 minutes | Watch the village, sell, and buy the next upgrade |
| Away for hours | Nothing: your character keeps working, and a summary greets you on return |

## Game systems

Slice 1 builds your character, two gathering skills, smithing, selling and one land purchase; the rest of this section is where the game is headed.

### Your character

- Tap a tree, rock, workstation or NPC: your character walks there and repeats the task until you send them elsewhere.
- Tapping the ground while they work speeds up the current action a little.
- The tool for the job is shown in their hand, so every upgrade shows.
- They carry what they gather in a backpack and walk full loads to the bank, which gives the screen more to watch.

### Hauling

Your character carries everything to the bank on foot at first; each later step moves more goods for less of their time.

| Step | How goods reach the bank | When (proposed) |
| --- | --- | --- |
| Backpack | Your character carries full loads on foot | Slice 1 |
| Cart | Your character pushes a cart and brings far more per trip | Slice 2 |
| Villagers | Villagers help haul your loads while you keep working | Slice 3 |
| Caravans | Caravans bring goods home from far regions | Slice 3, with the first far region |

### Skills and experience

XP follows an OSRS-shaped curve from 1 to 99: about 11.1 million XP for level 99, with level 92 at about half that. Gathering skills produce materials; processing skills turn them into something worth more.

| Skill | Kind | Where | Tiers, with the level that unlocks them |
| --- | --- | --- | --- |
| Woodcutting | Gathering | Trees | Birch 1, Oak 10, Pine 22, Maple 38, Yew 55, Ironbark 70, Moonwood 85, Elderwood 95 |
| Mining | Gathering | Rocks and ore veins | Copper 1, Tin 6, Iron 15, Coal 30, Silver 40, Gold 50, Starsteel 65, Duskite 80, Emberite 90 |
| Fishing | Gathering | Pond, river, dock | Minnow 1, Trout 12, Perch 25, Salmon 38, Pike 50, Sturgeon 65, Glowfin 80, Leviathan eel 92 |
| Smithing | Processing | Furnace (smelt ore into bars, part of Smithing); the blacksmith's anvil (forge tools, proposed) | Copper bar 1, Bronze 8, Iron 18, Steel 32, Silver 42, Gold 52, Starsteel 68, Duskite 82, Emberite 92 |
| Cooking | Processing | Campfire, later a kitchen | The fish above, at the same levels |
| Carpentry | Building | Every building and upgrade at the camp (since 0.0.27; 13 Oct 2026: any building effort gives XP) | Later, perhaps a sawmill to cut logs into planks |

The exact XP table, action times, XP per action and item values are in `prototypes/wanderskill.html` (`XP_TABLE`, `ACTIONS`).

### Tools

Each skill has six tool tiers, bought from the blacksmith; each tier works faster.

| Tier | Speed | Price (gold) |
| --- | --- | --- |
| 1 | x1.00 | Starting tool |
| 2 | x1.15 | 120 |
| 3 | x1.32 | 700 |
| 4 | x1.52 | 3,500 |
| 5 | x1.75 | 18,000 |
| 6 | x2.00 | 90,000 |

Proposed: with enough Smithing, you forge your own tools at the anvil instead of buying them.

### Selling and buying

- You sell to the merchant at flat prices in slice 1: copper ore 3 gold, copper bar 10, birch log 2.
- Processing pays: a bar sells for more than its ore, so the walk to the forge is worth it.
- Gold buys tools, land, buildings (a bigger bank and forge, a dock, a sawmill) and, later, far regions.
- Later, a market and auto-sell let items sell as they reach the bank while you're away.

### NPCs

- Every NPC is a villager with needs (hunger, energy, company), five personality traits, a home and a daily routine.
- Some hold a role with a workplace: the blacksmith (forge and anvil), the merchant (stall), the cook; later a fisher and a farmer.
- A service is open only while its NPC is at work, and a closed one says why: "Bram is asleep; the forge opens at dawn."
- When a role-holder grows old and dies, an apprentice or newcomer takes over, so a service is never lost.
- NPCs react lightly to you: a greeting, thanks after a sale, a grumble if you hog the forge.
- Later, villagers can help haul your loads (see Hauling); NPC quests are not planned for now.

The villager simulation (needs, traits, routines, partners, families, roles, chronicle) is in `prototypes/hearthfolk.html` (`decide`, `runAct`, `onNewDay`).

### The world

- One continuous map: the village starts by a river, and the rest is fog.
- The village is laid out like a real one, in rings from the town square: the square itself (hearth, well, notice board, benches), then the busiest buildings facing it (city hall, bank, forge, market, inn), then workshops and storage (barn), then homes along the roads with gardens, then the resources and wilds at the edges. New buildings go in the ring that matches how busy they are.
- Land is claimed at the city hall, in parcels next to land you already have. Two ways: buy a parcel with gold (the price rises with distance from the village fire), or restore it (clear and repair it with your skills) and then claim it at the city hall.
- Each parcel also needs an XP milestone before it can be claimed, so land opens up as your skills grow (exact milestones to be set in slice 1).
- A bought parcel clears with a short animation and is seeded from the terrain: trees, ore, berry bushes, a pond, sometimes an NPC's home or a landmark.
- Far regions come later as a bigger step: a path at the map's edge opens a new area, such as a hill mine or the coast, with its own resources and NPCs.
- Seasons recolour the world, nights bring lit windows and firelight, and weather brings rain and snow.

### Idle play and the chronicle

- Your character keeps doing the last task while you're away; on return, a summary shows what they made and which levels they gained.
- Away time counts for up to 2 hours at first, raised in steps to 24 hours: 4 hours for 1,500 gold, 8 for 10,000, 16 for 60,000, 24 for 300,000.
- The chronicle records the village's life (births, deaths, buildings, seasons, your purchases) as a log you can read back.

## Art and feel

Direction (11 Oct 2026, to be confirmed by the style test): OSRS's chunky, flat-shaded low-poly models in Eatventure's bright, clean world.

- **From OSRS:** chunky low-poly models with flat, faceted shading; characters and tools you recognise by their outline; gear that changes the model, like a bronze pickaxe becoming iron.
- **From Eatventure:** bright colours, soft light and shadows, a tidy scene seen from a fixed angle above, and small characters you can read at a glance.
- Take the feel of OSRS, never its actual models, names or art.

Palette, carried over from the prototypes; every model and picture uses it:

| Use | Colours |
| --- | --- |
| Grass: spring, summer, autumn, winter | #7bb65c, #5ca04a, #b5a24a, #e2e8ea |
| Water, shore, lake highlight | #3f86c4, #b9a06c, #5a9fd8 |
| Wood, stone, stone highlight | #8a5f3a, #8a8d92, #a9adb3 |
| House wall, roof, door | #e3cfa8, #9b4a3a, #4a2f1a |
| Fire, outside to centre | #ff6a1a, #ffa41b, #ffe066 |
| Night tint, warm light | Deep blue rgb(10,16,48) at up to 62% opacity; amber rgb(255,150,60) glow around lights |
| Skill colours | Mining #d8a35a, Woodcutting #8fd36e, Fishing #7fc1ff, Smithing #c9bde6, Cooking #ff9b6a |
| Interface panel, accent, highlight | #f9f3e5 at 86% opacity, #a8641c, #e4a42a |

- **Type.** Fraunces, a serif, for the village name, banners and card titles; the device's own font for everything else; no all-caps labels.
- **Models.** Built from recipes out of simple solids with flat shading: a tree is a trunk with three faceted blobs, a house is a box with a wedge roof.
- **Light.** The sun moves across the day; at night the fire, windows and torches are real lights.
- **Camera.** Third person, OSRS-style: it circles your character, the player rotates and tilts it (drag or arrow keys) and zooms in and out. The demo also has fixed overhead angles and an over-the-shoulder Follow view for later use.
- **Motion.** Trees sway, flames flicker, water glints and people bob as they walk. Nothing flashes, and only sparks move faster than a person walks.
- **Sound.** None yet; planned for slice 4.

## Platform and technology

The game runs in the browser for now: one HTML file that opens on a phone, tablet, PC or TV with nothing to install.

- **Code.** TypeScript in modules (below), bundled by a small build step into that single HTML file. No game engine yet.
- **3D (proposed).** Three.js shows the low-poly models live, with real light for day and night.
- **Asset pipeline.** Every model and picture has a recipe in `assets-src/`, and generator scripts in `tools/` turn recipes into files in `assets/`. Models: Blender Python scripts run headless and export glTF. Pictures: ComfyUI workflows on the owner's AMD graphics card (Radeon RX 7000 or 9000 series) for style references, icons, the logo and store art. Change a recipe or the palette and regenerate; never edit generated files by hand.
- **Saves.** Progress saves in the browser, with a version number and migrations so an update never wipes a village; an export code moves a save to another device.
- **Testing.** Every module has tests. Every build runs a headless simulation of hundreds of in-game days, checking for stuck characters, broken positions and runaway shortages, then gets screenshots at phone, desktop and TV sizes.
- **Performance target.** 60 frames per second on a mid-range phone, and 2 hours of away time caught up in under 6 seconds.
- **Where it's built.** Claude Code on the owner's Windows PC, in this project folder (`A:\Hearthfolk`). Version control (Git, then a private GitHub repository) is deferred until the owner wants it.
- **AI images.** ComfyUI runs on the owner's Radeon RX 9070 XT (16 GB), installed at `A:\ComfyUI` with Stable Diffusion XL. It makes flat 2D pictures, so it is for style references, icons, the logo and store art, not for game models.
- **Live 3D (decided 11 Oct 2026).** The game shows the Blender models live in the browser with Three.js, exported as glTF with their animations. Item icons and store art are rendered from the same models.
- **Engine decision after slice 3.** Stay on the web and wrap it as an Android app, or port to Godot (free, exports to Android); the glTF models carry over directly.

### Code modules

```
src/
  core/      clock, game loop (fixed time step), save/load, event bus, seeded randomness
  data/      skills, items, prices, tools, buildings, NPC roles: tables only, no logic
  world/     map, terrain, land parcels and fog, trees and rocks
  actors/    your character, NPCs, walking
  systems/   skills and XP, backpack and bank, selling, hauling, chronicle, away time
  render/    draws the world; reads game state, never changes it
  ui/        panels, buttons, taps turned into commands
  main.ts    connects the modules
tests/       one test file per module, plus a 300-day simulation run
assets-src/  recipes for every model and picture
tools/       generators that turn recipes into assets
assets/      generated models and pictures
```

- **Drawing never changes the game.** A visual bug can't damage a save, and the art can be redone without touching the rules.
- **Modules announce events instead of reaching into each other.** When an item reaches the bank, the bank module announces it, and the chronicle, the UI and later sound react.
- **Content is data.** A new ore, tool tier or price is one row in a table, not new code.

## Product and business

Draft: the audience and positioning are set; whether and how the game earns money is still open.

- **Audience.** OSRS players who love skilling but can't spend the hours, idle-game players, and people who want a calm screen to leave on.
- **Positioning.** The skilling without the grind, and the village without the management.
- **Closest comparable.** [Melvor Idle](https://www.pcgamer.com/au/jagex-to-publish-runescape-inspired-idle-game-melvor-idle) reworks RuneScape's skills into a casual idle game, sold for a single price and published under Jagex Partners. Hearthfolk's difference is a world you watch: your character walking to the forge, villagers living around them.
- **Loop and look model.** [Eatventure](https://www.pocketgamer.biz/eatventure-vs-cat-snack-bar-an-analysis-of-both-games), Lessmore's idle restaurant game, grows from a lemonade stand to fine dining across new locations; Hearthfolk's land parcels and far regions follow the same ladder.
- **Money (proposed).** If it charges, a one-time price like Melvor Idle's, or cosmetic extras. No energy timers and no paying to skip, because waiting is the game.
- **Risks.** Being seen as a Melvor clone; idle players drifting away after the first week; the village simulation growing faster than the game around it; standing out in app stores without an ad budget.

## How we work

Work moves one small piece per round. Claude Code builds, tests and shows each piece; you play it and decide what's next.

- **You decide** what the game is, what comes next, and when something is done.
- **Claude Code** designs, writes and tests the code and the art on your PC, and keeps this plan and the changelog current.
- **Done means played.** Every task has a done-when line, and it's done once you've played it and agree.
- **Every round is logged.** A changelog entry says what changed and in which version.
- **Questions before work.** Open questions are answered before the work that depends on them, and the answers move to the decision log.
- **New ideas wait.** Ideas that come up mid-slice go to the parking lot under the backlog, not into the current slice.
- **Nothing installs without asking.** Claude Code says what it wants to install and why, and keeps everything inside this project folder.

## Roadmap

```mermaid
flowchart TD
    now["Now: pre-production<br/>this plan, the decisions behind it, project setup and the style test"]
    g1{"Gate: you approve this plan and the style test, and answer the slice 1 questions"}
    s1["Slice 1: the loop<br/>your character, woodcutting, mining, smelting, the merchant, a neighbour, one land parcel"]
    g2{"Gate: someone watches for 5 minutes, taps once, and sees gold become new land"}
    s2["Slice 2: depth<br/>fishing and cooking, a cart, tools you can see, more land, NPCs who pass on their roles"]
    g3{"Gate: every skill in the plan is playable, and each parcel reveals something new"}
    s3["Slice 3: the world<br/>the first far region, village haulers, caravans, a market, auto-sell, longer away time"]
    g4{"Gate: an evening away comes back as a summary worth reading; engine decision made"}
    s4["Slice 4: polish and platform<br/>sound, ambient TV mode, a phone layout pass, and the Android build"]
    g5{"Gate: it plays well on your phone and a TV, and is ready to share"}
    now --> g1 --> s1 --> g2 --> s2 --> g3 --> s3 --> g4 --> s4 --> g5
```

Slices are in order, not to scale; dates get set after slice 1 shows how long a slice takes.

## Before slice 1

- [x] **Project setup.** TypeScript build, test runner and the module folders (Git deferred, see decision log). Done: the game builds to one file and its 16 tests pass; the 3D demo was carried over as the starting point.
- [x] **Style test.** Done as the miner demos and the cinematic; the v2 low-poly look is the placeholder, to be refined later.
- [ ] **Slice 1 questions answered** (see open questions).

## Slice 1 backlog

Ten tasks take the village prototype to the first playable loop; tick each one once you've played it and agree it's done.

**Build order (11 Oct 2026, proposed by Claude; the owner started with step 1):** village layout, woodcutting, backpack and bank, merchant, blacksmith and smelting, a neighbour, city hall and the first parcel, away time, version 0.1. This puts the player's loop (gather, bank, sell, claim land) first and the villagers after it; where the villagers go is still the owner's call.

- [ ] **Village layout (step 1).** The village around a central hearth: bank, city hall, forge, merchant's stall and a cottage, a river to the west, forest to the north and south, copper rocks and a birch grove, unexplored land under fog to the east. Buildings say what they'll do later. Rebuilt in rings like a real village (11 Oct) after the owner's feedback. Done when you can walk the village and every slice 1 place is there.

- [ ] **Clean base.** Port the village simulation from the Hearthfolk prototype into the new modules, without priorities, blessings and petitions. Done when the village runs with day, night and the chronicle in the new look, and no player yet.
- [ ] **Your character.** Tap a tree or rock and they walk there and work until sent elsewhere. Done when tapping a tree makes them chop until you tap something else. Built 11 Oct with step 2 (game 0.0.6), awaiting the owner's play.
- [ ] **Woodcutting and mining (step 2).** Both skills on the 1 to 99 XP curve with their first tiers. Done when levels survive a reload and show in a skills panel. Built 11 Oct (game 0.0.6): six birches south of the square (level 1) and three oaks by the river (level 10), a chopping swing with an axe that replaces the pick, trees that fall and leave a stump, then grow back, and a panel with both skills.
- [ ] **Backpack and bank (step 3).** Your character fills a backpack; when it's full they walk it to the bank, empty it and go back to the same tree or rock on their own. Done when wood and ore pile up in the bank where you can count them. Built 11 Oct (game 0.0.9), awaiting the owner's play.
- [ ] **The blacksmith.** An NPC with a daily routine who keeps the forge open only while at work; you smelt copper bars there. Done when the forge is cold at night and your character waits or says why.
- [ ] **The merchant.** Buys everything at flat prices. Done when selling turns items into gold you can see.
- [ ] **A neighbour.** One ordinary villager who eats, sleeps and chats on their own. Done when they live a whole day without you.
- [ ] **First land parcel.** Buy the land east of the village; the fog clears and a tin vein appears, so bronze bars become possible. Done when gold turns into new land end to end.
- [ ] **Saving and away time.** Progress saves, and your character keeps working while the game is closed, at a fifth of the live rate for up to 2 hours. Done when closing and reopening shows a summary of what they made. Built 12 Oct at the camp (game 0.0.20), awaiting the owner's play: saves record when they were written, opening one catches up a fifth of the time since (at most 24 minutes of play from 2 hours away), and a "While you were away" note lists what he gathered, the XP and levels and the fire; a game left open (a background tab, or a phone with its screen off) still catches up at full speed and gets the note too.
- [ ] **Test and publish.** Headless simulation, screenshots at three sizes, version 0.1 built and logged. Done when you've played it.

**Parking lot**, not slice 1: helpers who skill alongside you, NPC quests, petitions and blessings as flavour, achievements, prestige, sound, stamina for walking (11 Oct, the owner: maybe later, now that walking is faster), a watch showing the time of day, when it gets dark and where north is (11 Oct; possibly an item bought from the merchant, or a sundial on the square).

## Decision log

Seventy-three decisions so far, newest first; each answered open question is added here with its date. D1 to D26 are the lead's defaults in the camp build (game 0.0.31, the plan's open decisions in `docs/plans/2026-10-13-camp-build-plan.md`), taken while the owner slept, for the owner to confirm or change; the owner's questions Q1 and Q2 are in Open questions below, with their defaults taken.

| Date | Decision |
| --- | --- |
| 13 Oct 2026 | **D1, the marker** (the lead's default, owner to confirm): Nothing at a camp spot shows until its goal comes up. Then a marker shows where it goes: stakes at the corners of the first step with a string between them, a cloth flag, and a soft glint every 2.4 seconds, plus a tap area. The glint is 0.4 m across, the size of a pickup's (the plan had 0.12 m, too small to spot). For the storage chest it is a square chalked on the tent's floor, with its glint in the doorway, because the canvas hides the square from most angles. |
| 13 Oct 2026 | **D2, reaching the chest** (the lead's default, owner to confirm): The chest has one door point: the stand of the furthest-out shelter step, built or begun. Trips to the chest and to the shelter both end there, and the chest blocks nothing. He is at the door within 0.5 m of it. Each door keeps at least 0.6 m of open ground to each side and in front, where 0.25 m was asked. |
| 13 Oct 2026 | **D3, building the chest** (the lead's default, owner to confirm): He builds the chest from the door, facing in. At the tent, where it is always built (the upgrades come after it), it is within his mallet's reach of the door (0.65 m). On the wall tent's porch it is 0.69 m from the door, and on the log cabin's 0.82 m, because the cabin's porch roof reaches 0.17 m past its floor. While an upgrade is at its footings or frame, the chest stays drawn in the old shelter, about 1.15 m from the door, which has moved out. |
| 13 Oct 2026 | **D4, what the Build window lists** (the lead's default, owner to confirm): The camp's first five buildings show from their goal on. An upgrade shows once the thing it upgrades stands and the chest stands (the rule since 0.0.27: one value, `UPGRADES_AFTER`). The next step shows only once the step before it stands. With nothing in it the window says what comes next ("Nothing to build right now. Next: Firewood.") or that everything is built. |
| 13 Oct 2026 | **D5, Carpentry speed** (the lead's default, owner to confirm): Each Carpentry level above 1 makes building 1% quicker, with the same XP per building: a knock every 3 seconds of work, worth 4 XP. No Carpentry level is asked for anything (the owner: "carpentry is now just another skill"). |
| 13 Oct 2026 | **D6, stages and the old step** (the lead's default, owner to confirm): Every building goes up in four stages: footings, frame, half built, built. The old step is drawn until the new one is half built, and is used (slept in, stoked, stacked) until the new one is built. The old step's guy ropes or pegs go once the new one is begun, and any part of the new one that would cut through the old one goes up in a later stage. |
| 13 Oct 2026 | **D7, begun at the press** (the lead's default, owner to confirm): What a building needs is taken when he begins it, so a half-built thing never waits for materials. |
| 13 Oct 2026 | **D8, one build at a time** (the lead's default, owner to confirm): Only one thing is under way at a time; pressing another says "Finish the X first". The goal card and the next step offer "Carry on with the X" first. |
| 13 Oct 2026 | **D9, going back by himself** (the lead's default, owner to confirm): Once he has begun something he goes back to it after stoking the fire, a meal, bed, or a tap that ends by itself. After a walk to a spot on the ground he waits 5 seconds first. Work that doesn't end by itself (chopping, a fight) keeps him until he is sent elsewhere. |
| 13 Oct 2026 | **D10, taps** (the lead's default, owner to confirm): By day a tap on the shelter opens the chest's window once the chest stands. It no longer stores: Store everything does, in the menu and in the Backpack window. Before the chest stands a day tap says he isn't tired yet, and while the chest's goal is up the tap builds the chest. At night a tap is bed. With an upgrade under way, a tap on the fire or the pile carries on with it, and cooking and stacking are in the menu. Look in stays in the menu at night too. |
| 13 Oct 2026 | **D11, the mallet** (the lead's default, owner to confirm): The mallet is a prop swung on the mining swing, not a tool he owns. Since the first round of review fixes he swings it over and over while he builds, as he does chopping and mining (one swing every 3 seconds, with him standing still between, read as standing about); Carpentry XP still comes every 3 seconds. He leans down as far as each stage of each building asks, so the mallet lands on what is there (a test checks every stage from every place he stands). The storage chest is built from the tent's door almost upright, aimed beside the tent's front pole, so his head stays outside the tent. The handle is shorter than the pick's so the head doesn't sink into walls. |
| 13 Oct 2026 | **D12, a begun lean-to or log hut in an old save** (the lead's default, owner to confirm): It carries on as the wall tent (or the log cabin) at the same share of the new time, with nothing more asked for. The lean-to's 6 bark is not given back. |
| 13 Oct 2026 | **D13, saves** (the lead's default, owner to confirm): Save format 12, with one guarded migration from 11. A save that can't be read is kept under its own key (`hearthfolk_camp.unread`) before a new game's save could overwrite it. The brief kept the format unless a migration was truly needed; it was, because the renamed buildings would otherwise be dropped on load. |
| 13 Oct 2026 | **D14, what the upgrades give** (the lead's default, owner to confirm): Rest after a night's sleep: tent 0.25, wall tent 0.35, log cabin 0.5. The stone hearth and the woodshed work as the campfire and the pile did. The woodshed holds 30 logs, like the pile. |
| 13 Oct 2026 | **D15, the words under the mouse** (the lead's default, owner to confirm): "Build\|Campfire", "Carry on\|Wall tent", "Upgrade to\|Log cabin". By day the shelter reads "Look in\|Chest" once the chest stands, and just "Tent" before. At night it reads "Sleep in\|Wall tent", naming the step he sleeps in. Then "Cook at\|Stone hearth", "Stack logs on\|Woodshed" and "Practise on\|Training dummy". A tap goes to what is drawn under it first, so a big building's tap area never takes a tap meant for something beyond it. |
| 13 Oct 2026 | **D16, where the bigger buildings stand** (the lead's default, owner to confirm): The spots stay fixed. Each front faces the fire, and a bigger step grows back and to the sides. The stone hearth is turned a little (0.35 rad) so its seats clear the woodshed, and its seats block walking along their whole length (its reach is 2.05 m). To make room, the firewood pile's spot moved 0.9 m out, to (5.45, 1.89), and one stone pickup moved to (-5.0, 8.2). He stands 0.65 m from the face he builds. Walks still pass about 0.16 m from the campfire stones and the dummy's arms, as before, and the cabin's porch eave comes within 0.17 m of his head. From some camera angles the cabin hides him (his thought bubble still shows). To confirm: is that fine? |
| 13 Oct 2026 | **D17, placing** (the lead's default, owner to confirm): The placing code (the log bench and workbench put down anywhere) is removed. It stays in git at 0.0.29 if placing comes back (the brief's Not in: "later... object which player can place"). |
| 13 Oct 2026 | **D18, the long-press tip** (the lead's default, owner to confirm): A Tips page in his book, "Your camp", comes unstuck once the first upgrade can be built: hold a finger on a building, or right-click it, to see what can be done there. |
| 13 Oct 2026 | **D19, timings for going back** (the lead's default, owner to confirm): He waits 5 seconds after a walk he was sent on before going back. With no way there, he looks again 10 seconds later and says "no path" once. |
| 13 Oct 2026 | **D20, the fish on the hearth's spit** (the lead's default, owner to confirm): Kept, as in the design, and hidden while his own fish cooks on the spit. He cooks on the hearth's spit from its footings on. |
| 13 Oct 2026 | **D21, the woodshed's axe** (the lead's default, owner to confirm): Left off the chopping block, because his tools live in the chest. |
| 13 Oct 2026 | **D22, storing by hand** (the lead's default, owner to confirm): Store everything is in the Backpack window's Chest section and in the shelter's menu. It is hidden when he carries only the few meals every trip leaves on him anyway. |
| 13 Oct 2026 | **D23, opening an old save** (the lead's default, owner to confirm): If he stands where something bigger now stands, he is moved out by up to 4 m and carries on with what he was doing (an old sleeper behind the lean-to sleeps just outside the wall tent until morning). A walk to the chest, the shelter, the fire, the pile or a building goes on to where he stands for it now. A damaged save keeps one build under way and gives back what the others took. |
| 13 Oct 2026 | **D24, presses** (the lead's default, owner to confirm): A right click opens the menu, and a right drag turns the camera, as before. A long press is 500 ms with the finger within 8 px, and a ring fills round the finger. A finger held still doesn't turn the camera until it has moved 8 px. There is no keyboard way to open the menu: the Build window covers upgrades and the Backpack window covers Look in. On a narrow phone the menu can open over the finger when there is no clear spot beside it (under 10% of presses); lifting that finger can't choose an entry. Still to try on a real phone: the long press, and Android's own long-press menu. |
| 13 Oct 2026 | **D25, Practise in the menu** (the lead's default, owner to confirm): Enabled once the training dummy stands. When he can't, the menu shows the fight command's own reasons. |
| 13 Oct 2026 | **D26, walking grids for the creatures** (the lead's default, owner to confirm): The rats and goblins keep their own walking grids. A test keeps the camp's largest steps clear of their nests and the goblin camp. |
| 13 Oct 2026 | The log bench and workbench are removed from the game (the owner: "no remove the bench and workbench, these can be added later if needed"). The camp build (fixed spots hidden until needed, everything built in stages with Carpentry, the Build tab as the camp's overview, the tent to wall tent to log cabin, the stone hearth, the woodshed, the chest as furniture in the shelter) is high priority and is to be done properly rather than quickly ("timing is irrelevant do the work which needs to be taken, no rushing, i rather this gets done porperly"): it is built after the needs, sleep and tools build is in the game, on top of it. |
| 13 Oct 2026 | The camp's upgrades (the owner, from the design pictures in docs/designs/): the shelter goes tent, then the wall tent (a timber frame with the old canvas, a plank floor and a porch: design C's first step), then the log cabin (round logs, a loft, a stone chimney and a covered porch: design A's second step); the campfire upgrades to a stone hearth with a spit and log seats, and the firewood pile to a woodshed that still shows its logs. The storage chest is no longer an object of its own: it is furniture inside the shelter (the owner: "maybe chest is just \"furniture\" in the tent or house etc, rather than an individual object"), so no storage shed. |
| 13 Oct 2026 | Jobs, tools and needs at the camp (the owner): at the camp there is no Jobs tab; he does what the player chooses (tapping a tree, rock or the like, which keeps going by itself) and what is started from the Build tab. A Jobs tab comes later, in the village, once a task board (or the like) can be built, and queueing several skills one after another, for longer idling, comes later as something earned. Once the storage chest stands his tools live in it, and he fetches the one he needs (later, outfits will give skill bonuses). Going to bed is mandatory every night, with at least 6 hours of sleep, and the player can set the time (later, NPCs may build while he sleeps). Hunger starts with the first food goal (Berries), it never pulls him out of a fight, and while the game is closed he doesn't go to bed. The hunger numbers (about one cooked fish a day, four berries to a meal, 80% speed hungry with nothing to eat) stay until chapter length is settled. |
| 13 Oct 2026 | The camp's buildings (the owner, after the review of 0.0.27): they keep fixed spots, and nothing shows until a goal asks for it (then a marker shows where it goes). Every building and upgrade goes up in stages over time with a hammering animation, and once begun the player is committed to it (the materials are used; a half-built thing stays until finished). Carpentry is just another skill: every building effort gives Carpentry XP, with no levels that force a detour; how long each build takes is to be set (a first proposal: campfire 20 s, firewood pile 25 s, dummy 40 s, chest 45 s, tent 60 s, upgrades 2 and 4 minutes). The Build tab is the camp's overview of what can be built or upgraded and what each needs; pressing one sends him walking there to start; an upgrade can also be started by right-clicking the building (a long press on a phone). Each upgrade makes the building bigger, with more sections and a new look; design options go to the owner before any is built. Later: objects the player places to customise the camp (the log bench and workbench may be the first), and, in the village chapter, overseeing others building from a blueprint. |
| 13 Oct 2026 | How we work, after the review of 0.0.27 (docs/reviews/2026-10-13-what-is-in-0.0.27.md): every team brief quotes the owner's own words and keeps each alternative they offered; its "not included" list goes to the owner before the team starts; every update comes with an "in / not in / open questions" list before it is published; questions the teams raise go to the owner on the plan board; decisions are written here. |
| 12 Oct 2026 | Deepening chapters 1 and 2 (the owner: "the current content is too shallow"): his book is a survival book that fills in as he discovers things, and his thoughts in his own voice carry the story, in speech bubbles spaced apart so they never get cheesy; one tap on the goal sends him to its next step, and tapping around the world stays; sleeping in the tent at night speeds up time so the night is seen to turn to dawn, and he wakes well rested; jobs as the idle core (he fetches his tools at the chest and works the nearest place for that material) with needs (he eats when hungry and goes to bed at night); levelling should give something (a talent tree or research area, queueing several jobs: which kind is still open); any skill and action should take time; the UI should be clean but rustic, not modern. |
| 12 Oct 2026 | The owner went with the lead's picks: he switches what he trains by himself (to the next skill the goal asks for, and off a skill the dummy can't teach any more); "Ready for the goblins" (Attack, Strength and Defence 7) comes before the goblin camp; out of food mid-fight he walks back to the chest for more; emptying the backpack keeps up to 5 meals; the Fish goal asks for 8. |
| 12 Oct 2026 | A UI foundation (windows that open and close from a row of buttons: Backpack, Skills, Book, Settings; a tiny always-on screen) is built now, before chapter 3, instead of a layout pass in slice 4. After it, the owner and the lead review chapters 1 and 2 together before expanding them. |
| 12 Oct 2026 | Chapter 2, "Holding the camp", comes after the storage chest, in this order: a training dummy, a first weapon, practice on the dummy, food (berry bushes near the camp first, then fishing and cooking at the campfire), rats, hide armour and protection, then the goblins blocking the path up the river. The village comes much later, once he can travel safely with enough food, gear and protection. |
| 12 Oct 2026 | Combat is OSRS-style: Attack, Strength and Defence. His health comes from Vitality, not Hitpoints, so it differs a bit. Losing a fight isn't punishing: he is knocked out, wakes at the camp, keeps his gear and loses only the food he ate. |
| 12 Oct 2026 | The first weapon is a stone club (the lead's call, open to the owner): it swings with the axe's Chop clip, so no new animation is needed; a spear needs its own thrust clip and can come later. |
| 12 Oct 2026 | Several teams may build side by side in their own copies of the project to save time (the owner: "we can implement agents again to work on multiple tasks"); the lead merges and checks the result before anything is published. |
| 12 Oct 2026 | The idle feel starts at the camp: tapping something to pick up starts an activity that keeps going, like woodcutting. A plank (or the crate) gathers all the wreck's planks, nearest first, then stops; a stone or a branch keeps gathering that kind, waiting beside the next to come back, until the backpack is full (then the bank where there is one). The tarp and the book are picked up on their own. Built as game 0.0.14. |
| 12 Oct 2026 | The survival book is in from the start: wreckage washes up with him (planks, a tarp, a crate and his book). Picking up the book opens it; its pages are the goals, in order: salvage the wreck, a campfire (planks and stones), a stone axe (branches and stones), firewood, a shelter (tarp, planks, logs), a stone pickaxe, a storage chest. Stones and branches are gathered by hand. A printed copy could still be a Kickstarter reward. |
| 12 Oct 2026 | The character washes up with nothing: no tools. He gathers branches and stones by hand and makes his first tools from them (a stone axe first); better tools come later. The camp starts bare: tent and campfire appear only when built. |
| 12 Oct 2026 | The fall was so far that the top of the waterfall is never seen: from the camp there is only water pouring out of the sky down a towering mountain wall. The opening cinematic shows him falling out of the mist with the water into the pool. |
| 12 Oct 2026 | The camp is at the foot of a waterfall. A new game opens with a short cinematic: the character drifts down the river, goes over the waterfall and washes up in the pool below, where he sets up camp. The village lies far up the river and comes much later. |
| 12 Oct 2026 | Work comes in small chunks of about 30-45 minutes, each ending in something the owner can see and play; a sketch comes first when the direction is unclear. |
| 12 Oct 2026 | The game starts from zero at a camp in the wild. Setting up camp costs materials (campfire, shelter, storage chest) and keeping it going costs more: the fire burns fuel. Around Woodcutting 10 a fallen oak on the road can be cut, and beyond it lies an abandoned village the player restores building by building, with villagers joining as it grows. Existing saves start over at the camp. |
| 11 Oct 2026 | Panels are forest green with cream text, in the game and on the plan board: dark and calm, never bright. |
| 11 Oct 2026 | Roads are faster to travel (about 40% quicker than grass, easy to tune), and the character takes the quickest route: the road whenever it gets him there sooner, straight across the grass for short hops. |
| 11 Oct 2026 | How new land is obtained is open again: land is there to explore, and getting it may take a task, a price, or both. The earlier decisions (claimed at the city hall, gold plus an XP milestone) stand as the working plan until this is settled; not needed before step 7. |
| 11 Oct 2026 | Progress runs at the full rate (1x) while the game is open, even in a background tab or with the screen off, and at a fifth of it (0.2x) while the game is closed, for at most 2 hours; after that the character stops until you come back. The game cannot tell a game you closed from one the phone closed in the background, so both count as closed. The 2 hours is easy to change later. Built as game 0.0.20 (numbers in `src/data/away.ts`). |
| 11 Oct 2026 | The backpack's size doesn't matter for now (easy to expand later). When it's full, the character walks it to the bank, empties it and goes back to work on their own. |
| 11 Oct 2026 | Little downtime while gathering: when a tree falls or a rock runs out, the character moves on to the nearest free one of the same kind, as long as that is quicker than waiting for it to grow back. |
| 11 Oct 2026 | Git and GitHub after all, replacing the earlier "no Git" decision: a private repository on the owner's GitHub account, pushed after every round, so the work is safe off the PC. |
| 11 Oct 2026 | The village is laid out like a real village: the town square at the centre, the busiest buildings round it, then workshops, then homes, then the edges. |
| 11 Oct 2026 | The game model can still change: it doesn't have to be an idle game. The owner's view is that an idle core is the best way to make an OSRS-style game streamlined and modern for how people use phone games, so that stays the direction; the code keeps room for more hands-on play. |
| 11 Oct 2026 | Land is claimed at the city hall: bought with gold, or restored first and then claimed. |
| 11 Oct 2026 | The default camera is third person and rotatable, OSRS-style. |
| 11 Oct 2026 | The game is live 3D (Three.js and glTF models), not pre-rendered sprites. |
| 11 Oct 2026 | The v2 low-poly miner look is placeholder art to build on; the final look is settled towards the end. |
| 11 Oct 2026 | No Git or GitHub for now; the project lives in `A:\Hearthfolk` on the owner's PC. Revisit once losing the work would hurt. |
| 11 Oct 2026 | Land is bought with gold, and each parcel also needs an XP milestone before it opens. |
| 11 Oct 2026 | Smelting is part of Smithing, not its own skill. |
| 11 Oct 2026 | The graphics card is a Radeon RX 9070 XT with 16 GB; ComfyUI runs on it. Pixel-art test icons were made for Wanderskill and don't fit Hearthfolk's look; game art comes from 3D models. |
| 11 Oct 2026 | Claude Code on your PC builds everything (code, art, this plan) in a local project folder; this file replaces the Claude doc as the plan. |
| 11 Oct 2026 | The art moves toward OSRS-style low-poly models with Eatventure's bright, clean look; a style test confirms it before slice 1. |
| 11 Oct 2026 | The code is split into modules that announce events to each other, each with its own tests. |
| 11 Oct 2026 | Your character carries everything to the bank. Hauling grows in this order: a backpack, then a cart, then villagers who help, then caravans. |
| 10 Oct 2026 | Development continues in the chat with Claude, guided by this plan and its changelog (replaced on 11 Oct by Claude Code). |
| 10 Oct 2026 | The world grows two ways: land bought around the village, and far regions later as a bigger step. |
| 10 Oct 2026 | NPCs run the services and live their own routines; for now they aren't hired and don't give quests. |
| 10 Oct 2026 | You send the character: tap a place or an NPC, and they work until sent elsewhere. |
| 10 Oct 2026 | One game combines the skiller's loop with the village's living NPCs: work, earn XP, sell, buy, grow the world. |
| 8 Oct 2026 | Build in small slices with your feedback, not whole games in one go. |
| 8 Oct 2026 | The look stays simple and easy to replicate: flat shapes, easy on the eyes, as clear as Eatventure (the flat shapes were replaced on 11 Oct by the low-poly direction; clear, easy-to-replicate art still stands). |

## Open questions

Eleven questions for you; the first two come from the camp build (13 Oct 2026), the others are in the order they're needed.

| Question | Options | Needed by |
| --- | --- | --- |
| Q1. "Any skill and action should take time": should making the stone axe, pickaxe, club, rod and hide armour take real time too (now 3 to 4 seconds, no XP), and train a skill? | Unchanged (the default taken in 0.0.31); longer times (a data change); longer and training Carpentry or a new skill (a build of its own) | Before chapters 1 and 2 are reviewed |
| Q2. "Anything from adding materials": the camp build puts fibre, bark, clay and stones to use and adds none. Add new ones (flint, resin, bones, leather, herbs, mushrooms)? | None for now (the default taken in 0.0.31); pick some, each with where it is found and what uses it | Before chapters 1 and 2 are reviewed |
| How is new land obtained? | Pay gold at the city hall; do a task to restore it; reach a level (total, or the skill the land serves); a mix | Slice 1, step 7 |
| Is "cut wood" a Carpentry skill, with planks used for building? | Yes; fold it into Woodcutting; not now | Slice 2 |
| Can you forge your own tools? | Buy only; buy or forge | Slice 2 |
| Do NPCs age and die, with someone taking over their role? | Yes; no, they stay | Slice 2 |
| Do merchant prices move? | Flat; shifting with supply | Slice 2 |
| Do far regions need levels as well as gold? | Gold only; gold and levels | Slice 3 |
| Which engine after slice 3? | Web, wrapped as an Android app; Godot; Unity | Slice 4 |
| Does the game charge, and how? | Free; one-time price; cosmetic extras | Slice 4 |
| What's the game called? | Hearthfolk; Wanderskill; a new name | Before sharing |

## Sources

- [Jagex to publish RuneScape-inspired idle game Melvor Idle](https://www.pcgamer.com/au/jagex-to-publish-runescape-inspired-idle-game-melvor-idle), PC Gamer, 24 Oct 2021
- [Eatventure vs Cat Snack Bar: an analysis of both games](https://www.pocketgamer.biz/eatventure-vs-cat-snack-bar-an-analysis-of-both-games), PocketGamer.biz, undated (cites figures to about August 2023)
- [AMD x ComfyUI: Advancing Professional Quality Generative AI on AI PCs](https://www.amd.com/en/blogs/2026/amd-comfyui-advancing-professional-quality-generative-ai-ryzen-radeon.html), AMD, 5 Jan 2026
- [Amuse](https://www.amd.com/en/ecosystem/isv/consumer-partners/amuse.html), AMD consumer partners page
- [How to set up ComfyUI on an AMD RDNA 4 GPU using ROCm on Windows](https://wccftech.com/how-to-setup-comfyui-ai-image-generation-on-amd-rdna-4-gpu-rocm-7-1-1-windows/amp/), Wccftech, 15 Dec 2025
