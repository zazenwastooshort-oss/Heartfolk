# Discovery, a slimmer bar, and an information button (game 0.0.38): the brief

The owner's words win over any paraphrase below. Every clause is a requirement unless "Not in" says otherwise.

## The owner's words (13 Oct 2026, in chat with the lead)

1. "ii think we can work on the UI and the bar below. now the task takes up a lot space, and m wondering what we call "book" maybe that should just be part of the recepie and research tab or something. or it should be part of it, a bit like minecraft does it, a progression tree, you unlock and progress through the materials"
2. The lead proposed: the goal card (the "task") becomes one slim line sharing a row with Rested, the skill he trains and the clock, so the bar is two rows on a phone (about 105 px, from about 170) and one on a wide screen; the arrow still sends him off; tapping the goal's name opens its page. The book becomes a tree like Minecraft's: "finished nodes are lit, the next ones glow, and later ones are dark outlines"; "tapping a node shows its recipe (what it needs, how many you have), where the materials come from, and the short lines the book has now".
3. The owner: "I think lets call it discovery now, and as u click an object thats when u discover it and at that point u can access recepies so its really like a tree."
4. "Let's put in level unlock, with certain skill rather than xp and the collection of materials x amount of sticks /stone etc," then "Naybe not amount of gathered but rather the skill level and certain research criteria and activities, like defeat the boss, etc", and for the chapter 1 and 2 recipes: "Yes them too". (That is the second build: Not in, below.)
5. "Let's do Journaling and tips as a (informstion) button somewhere." Then, on a small "i" beside the clock: "Yupp beside the clock".
6. "Build is basically the progression of the lodging, camp, village, city, et."
7. On doing it in two builds, the first by agents side by side: "Ok thats fine".
8. A bug the owner saw (fixed in 0.0.37, before this build): "the bubble above the player staggers and shakes when its shown and he walks".

## In (this build)

1. **The slim bar.** The goal card becomes one slim line: its name (cut short with an ellipsis when tight), its count ("3 / 5 cooked fish"), a thin progress line, its Build button when it has one (smaller), and the arrow that sends him off. It shares a row with his state (health, Hungry, the skill he trains, Rested, Well fed) and the clock. On a phone held upright the bar is two rows: that row, then the buttons, about 105 px tall in all (now about 170). On a wide screen it is one row. His state can show compactly (an icon and a number) where room is short; its words come back in a tooltip and where there is room.
2. **Discovery** replaces the Book (its button, its place in the row). It is a tree, like Minecraft's: materials, tools, buildings, gear and food, each a node joined to what it leads to. A material leads to the recipes that use it; a tool leads to the material it gathers (the stone axe to birch logs, the pickaxe to copper ore, the rod to fish, the club to rat hides); the fire leads to cooked fish. Nodes he has found are lit, the recipes they open glow (with "?" for inputs not found yet), and nothing further shows. Tapping a node opens its card: what it is (the book's lines for it: the Making, Food and Materials-and-places pages, and its goal page's words), its recipe (what it needs and how many he has, carried or stored), where it is made, where its materials come from, what it is used in (tap to go there), and for food how much it heals. The tree scrolls and pans; on a phone it scrolls sideways.
3. **Discovering by tapping.** "As u click an object thats when u discover it": the first tap on anything in the world (a tree, a rock, the ripples, a stone, a branch, a plank, the tarp, the book, a berry bush, reeds, clay, a rat, a goblin, the goblin chief, the training dummy, a camp building or its marker) discovers it, the material it gives, and so the recipes that use it, even before he can use it (a copper rock before the pickaxe). Whatever comes into his hands another way (a rat's hide, a cooked fish, the chief's map) and whatever he makes or builds is discovered too. Each discovery gets a short notice ("Discovered: copper ore.") and a dot on the Discovery button until it is opened.
4. **The information button**: a small round "i" beside the clock, on every screen size. It opens an Information window with three tabs: Story (the goal pages his book has now, one per goal, in order, with the current one first when opened from the goal line), Journal (his thoughts so far, as the book has them) and Tips. A dot on the "i" when a new journal entry or tip comes. Tapping the goal line's name opens Story at the current goal's page.
5. **Build** is unchanged in this build: it stays the progression of "the lodging, camp, village, city".
6. **Saves** go to format 13 (`discovered`), with old saves (format 12 and older) given as discovered everything they have already come across (what he owns or stores, his tools and what he wears, everything built, every goal done and the things it asked for, the book's pages already unstuck), and nothing lost; an unreadable save is kept aside as now.

## Not in (this build)

- **Unlocks** (the owner's words 4): each recipe needing a skill level ("certain skill rather than xp") and research criteria or activities ("like defeat the boss"), the chapter 1 and 2 recipes too. That is the second build; its table of what unlocks what goes to the owner on the board first. Nothing is locked in this build: making and building work as now.
- New materials or recipes (the copper chain is its own build), the village and the city, and any change to Build.
- Changing the goals, their order or their numbers.

## Done means

- At 390 x 844 (a phone upright) the bar is two rows and at most about 110 px tall, nothing in it overlaps or is cut off but the goal's name (with an ellipsis), every button at least 44 px tall to tap; at 844 x 390, 768 x 1024, 1280 x 800 and 1920 x 1080 it is one row (or two at most on the tablet), tidy, nothing overlapping. Windows still open just above the bar (ui/windows.ts `--above-dock`).
- The "i" beside the clock at every size above, opening Information (Story, Journal, Tips); the goal line's name opens Story at the current goal.
- Discovery: from a new game, the first taps discover what they say; the tree grows as he goes; a whole-camp save (tests/fixtures) shows the full chapter 1 and 2 tree, tidy, with no crossing mess and nothing overlapping; every node's card has its words, recipe and links; it works with a mouse, a touch and the keyboard; it opens at the right size on a phone.
- No text from the Book is lost: every Making, Food, Materials-and-places page's words are on a Discovery card; every goal page and the Journal and Tips are in Information.
- Saves: every fixture in tests/fixtures/saves loads into format 13 with the right things discovered; a new save round-trips exactly.
- The full check passes (`npm run check`), the playthrough bot clears chapter 2 on 20 seeds (`HEARTHFOLK_PACING=1 HEARTHFOLK_SEEDS=20 npx --no-install vitest run tests/playthrough.test.ts`) with pacing as in 0.0.37, and the layer rules hold (tests/architecture.test.ts).

## The lead's picks for the details (D1 to D9)

- **D1, what a tap discovers:** the thing tapped and what it gives (a birch tree: the birch tree and birch logs; a rat: rat hides; the goblin chief: the torn map); a camp building or marker: that building. Discovery is game state (saved), set in the simulation when the command for the tap is applied (systems/), never by the UI. Hovering discovers nothing.
- **D2, the nodes:** things, not places: every item (materials and food) and every thing in `MAKES` (tools, gear, camp buildings and their upgrades). Sources (a birch tree, a copper rock, the nest) are named on the cards ("Chop the birch trees round the clearing"), not nodes of their own.
- **D3, what shows:** found nodes (lit; made ones marked made), and every recipe one of whose inputs is found (glowing, its unknown inputs as "?"). Nothing else.
- **D4, the layout:** columns by depth (things from the ground first, then what they make, then what that makes; a material gathered with a tool sits after the tool), rows in three bands, the camp (wood, stone, buildings), food, and fighting (club, hides, armour, the map); computed from the data, not placed by hand, so a new recipe needs no layout work.
- **D5, the notice:** "Discovered: copper ore." once per thing, as a notice (ui/hud.ts), not for things a new game starts with.
- **D6, the goal line's arrow** does what the goal card's tap does now (sends him off: the `next` command); its name opens Story.
- **D7, the "i":** always shown (from a new game), round, the clock's height.
- **D8, the Book's sections:** Food, Materials and places, and Making move into Discovery's cards; Journal and Tips move into Information; the goal pages become Information's Story. The book as an item (found at the wreck, `hasBook`) still matters to the salvage goal; Discovery and Information don't wait for it.
- **D9, names:** the button and window "Discovery"; the window with the "i" "Information".

## How the work is split (agents side by side, the owner's OK: "Ok thats fine")

- **The bar and Information** (worktree `wt/bar`, branch `ui-bar`): index.html's dock and its CSS, ui/hud.ts (the goal line), ui/rail.ts (fitting the row), ui/windows.ts if needed, the Book window turned into Information (ui/book.ts becomes ui/info.ts; Story, Journal, Tips), core/book.ts and core/survival.ts as Information needs them, the "i" button, main.ts's wiring for these, and their tests. Leaves the Book's Making, Food and Materials-and-places pages' data where it is (data/survival.ts) for Discovery to use.
- **Discovery's core, then its window** (worktree `wt/disc`, branch `discovery`, one agent after the other): first data/discovery.ts (the nodes and how they join, derived from the data), core/discovery.ts (what is found and shown, the layout, each node's card), the saved `discovered` and format 13 with its migration, discovery when a tap's command is applied and when things come into his hands or are made, the `discovered` event and its notice, and their tests; then ui/discovery.ts (the window, the tree, the cards), its markup and CSS in index.html (its own section and its own CSS block), the Book button turned into Discovery, main.ts's wiring for it, and its tests.
- The lead merges the two branches, runs two reviews (the owner's words and the game on screen; saves and the core), has the findings fixed, checks everything above, and publishes.
