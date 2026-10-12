# Making Do: final copy

The text for the book in the printed-handbook direction. The same words go in the game and the printed copy. Typographic apostrophes (’) in the final files.

## The title

| | Title | Subtitle |
| --- | --- | --- |
| **Pick** | **Making Do** | **A Pocket Handbook for the Unexpectedly Outdoors** |
| 2 | From Scratch | A Field Manual for Starting Over Outdoors |
| 3 | Nothing to Hand | The Castaway’s Field Handbook |

**Why Making Do:** two short words stamp large and clear on a small cover. It is the whole game in a phrase: start with nothing, make do with what washed up. It sounds like a real old manual, and the subtitle carries the joke. It doesn't depend on the game's name, which is still open.

**The fictional publisher:** Ottery & Moss, Publishers of Useful Books. The book is No. 7 in their Field Series. (Invented. Check the name isn't taken before anything is printed.)

## Quantities the brief didn't set

These are proposals. Change them in one place and both the game and the print layout follow.

- The wreck gives **7 planks**: 5 loose on the bank (two of them in the shallows) and 2 from the smashed crate. 3 go into the campfire and 4 into the shelter. This matches the camp as built (5 plank pickups, and a crate that gives 2). **Game change needed:** `src/data/goals.ts` asks for `plank: 6` for "salvage"; it should be 7, or the player ends Chapter 1 one plank short of Chapters 2 and 5. That is the game agent's change, once the owner agrees the number.
- The stone pickaxe takes **2 branches and 3 stones** (a heavier head than the axe's 2 stones).
- Chapter 6 mines **5 copper ore**. Chapter 7's chest takes those 5 plus **10 birch logs**.
- Chapter 4's **10 birch logs all go on the fire**. That is why Chapter 5 asks for "10 more". If the game settles on a different fuel number, change Chapter 4's step and Chapter 5's "10 more" together.

---

## Cover and wraps

**Front:** Field Series · No. 7 / Making Do / A Pocket Handbook for the Unexpectedly Outdoors / Ottery & Moss / Revised Edition

**Spine:** Making Do · 7

**Back:**

> Most people buy this book before they need it. A few find it afterwards, on a riverbank, slightly damp.
>
> Either way, *Making Do* starts where you are, with nothing, and gets you to a fire, a roof and a dry box to keep things in, one plain job at a time. Every chapter tells you what you need, what to do and what it should look like. None asks for anything you can’t find or make by then.
>
> 24 chapters · a figure for each · 10 pages for your own notes
>
> Ottery & Moss · Publishers of Useful Books · Price: two copper

**Inside front cover: The Rules of Making Do**

> Seven to start with. Each one is earned in the chapter of the same number.
>
> 1. Take stock first.
> 2. Build where you’ll stay.
> 3. Tools open doors.
> 4. Feed the fire before it asks.
> 5. Save up, then build.
> 6. The right tool for the job.
> 7. Store what you don’t carry.
>
> *Also in the Field Series:* No. 3 Knots, and How to Undo Them · No. 5 Edible or Not? · No. 9 Rivers, and Staying Out of Them

(In the finished book the list runs to all 24 rules, in two columns.)

**Inside back cover:** a 10 cm ruler printed along the fore-edge, and nothing else.

## Page 1: title page

> Field Series · No. 7
>
> **Making Do**
> *A Pocket Handbook for the Unexpectedly Outdoors*
>
> Everything you need to make camp from nothing, in the order you’ll need it, in plain words, with pictures.
>
> This book is the property of ____________________
> *If found, please return it. If found wet, please dry it first.*
>
> Ottery & Moss · Publishers of Useful Books · Revised Edition

In the game, the player's name is pencilled on the line.

## Page 2: contents

> The Rules of Making Do ........ inside cover
> **Part One · Camp**
> 1 Salvage the Wreck ........ 4
> 2 A Fire for the Night ........ 6
> 3 A Sharp Edge ........ 8
> 4 Firewood ........ 10
> 5 A Roof ........ 12
> 6 Breaking Rock ........ 14
> 7 Keeping Things Dry ........ 16
> **Part Two · The Road:** chapters 8 to 15 ........ 18
> **Part Three · The Village:** chapters 16 to 24 ........ 34
> **At the back:** Field Notes 52 · Index of Materials 62 · About the Publishers 64
>
> *The publishers accept no responsibility for waterfalls.*

## Page 3: how to use this book

> **How to Use This Book**
>
> Each chapter is one job, set across two facing pages so the book can lie open while you work. Start at Chapter 1. No chapter needs anything from a later one.
>
> *Fig. 0.1 A chapter, labelled.*
> A Chapter number and name · B What’s going on · C What it teaches; tools needed · D You will need: exact amounts · E Steps. Tick each one off · F The figure, parts lettered · G The rule. Remember it · H Footnotes. Read these too
>
> **Quantities are exact.** Four stones means four. Three won’t do, and five is showing off.
> **Tick in pencil.** Ink runs, and you’ve seen what water does.
> **Later pages may be stuck together.** Don’t force them. They’ll come apart when you get there.

---

## The seven chapters

Each chapter has the same parts, in this order. Left page: number, title, story line, Teaches / Tools, You will need, Steps. Right page: figure and legend, Done when, the Rule, the footnote. Steps marked *(game counts)* show a pencilled count such as 2/4 until done.

### Chapter 1 · Salvage the Wreck

- **Story:** You came down with the water, and so did some of your things. Before anything else, see what’s left.
- **Teaches:** Picking things up. **Tools:** None. Hands will do.
- **You will need:** Planks 7 · Tarp, torn 1 · This book 1
- **Steps:**
  - [x] Find this book. You are holding it. *(printed already ticked; the game opens the book on pickup)*
  - [ ] Gather the 7 planks: 5 loose, 2 from the crate. *(game counts)*
  - [ ] Gather the tarp.
- **Fig. 1.1 The wreck, as found.** A Planks. Five loose, two of them in the shallows. B The tarp. Torn, but still a tarp. C The crate. Smashed, but good for two planks.¹ D This book. First box already ticked.
- **Done when** the planks, the tarp and this book are all in your pack.
- **Rule 1 · Take stock first.** Everything the river brought down is yours now, and most of it is useful. Walk over to a thing to pick it up.
- **Footnote:** ¹ Experts have looked at the rest of the crate and are sorry for your loss.

### Chapter 2 · A Fire for the Night

- **Story:** Night comes early at the bottom of a waterfall. A fire turns the place you landed into a camp.
- **Teaches:** Building from parts. **Tools:** None.
- **You will need:** Planks 3 · Stones 4
- **Steps:**
  - [ ] Gather 4 stones from the riverbank. *(game counts)*
  - [ ] Bring 3 planks from the wreck. *(game counts; usually done already)*
  - [ ] Build the fire at camp: stones in a ring, planks leaned in the middle (Fig. 2.1).
- **Fig. 2.1 Fire ring, from above and from the side.** A Stones, four, in a ring about a stride across. B Planks, three, leaned together in the middle. C Air in low, smoke out the top. Leave gaps. D This book, at arm’s length.²
- **Done when** the fire is lit. Poking it is optional.
- **Rule 2 · Build where you’ll stay.** Bring the parts to the spot you want it. It’s built the moment the last part arrives.
- **Footnote:** ² Planks are poor firewood and this book is worse. Chapter 4 has better ideas.

### Chapter 3 · A Sharp Edge

- **Story:** Hands are good for most things, but not trees. You need an edge. The river has spent a long time rounding every stone it owns, so look carefully.
- **Teaches:** Making tools. **Tools:** None.
- **You will need:** Branches 2 · Stones 2
- **Steps:**
  - [ ] Gather 2 branches from under the trees. *(game counts)*
  - [ ] Gather 2 stones: one flat, one round. *(game counts)*
  - [ ] Make the stone axe (Fig. 3.1).
- **Fig. 3.1 Stone axe, taken apart.** A Handle. The straighter branch, about forearm long, split at the top. B Lashing. Bark peeled from the other branch, wound tight. C Head. The flat stone. Strike its edge with D until it bites.³ D Hammerstone. The round one.
- **Done when** you are holding a stone axe, and it holds together.
- **Rule 3 · Tools open doors.** Most things here need a tool before they’ll give you anything. Trees need an axe. This is your first tool. It won’t be your last.
- **Footnote:** ³ Test the edge on a branch, not a thumb. The publishers have had letters.

### Chapter 4 · Firewood

- **Story:** The fire ate well last night. It would like breakfast.
- **Teaches:** Woodcutting, and that a fire burns its fuel. **Tools:** Stone axe (Chapter 3).
- **You will need:** Birch logs 10
- **Steps:**
  - [ ] Find the birches: white bark, black marks.
  - [ ] Chop 10 birch logs. *(game counts)*
  - [ ] Put the 10 logs on the fire.
- **Fig. 4.1 Telling a birch, and felling it.** A White bark that peels in papery strips.⁴ B Black marks across the trunk, like dashes. C Cut a notch on the side you want it to fall. D Stand clear of the fall line.
- **Done when** ten logs are cut and the fire has had its breakfast.
- **Rule 4 · Feed the fire before it asks.** A fire burns its wood as it goes. When the wood runs out, so does the fire. Keep a few logs by it.
- **Footnote:** ⁴ Birch bark lights even when damp. So, in fairness, would this book. Please don’t.

### Chapter 5 · A Roof

- **Story:** It hasn’t rained yet. It’s only being polite.
- **Teaches:** Saving up for a big build. **Tools:** None.
- **You will need:** Tarp 1 · Planks 4 · Birch logs 10
- **Steps:**
  - [ ] Chop 10 more birch logs. The first 10 went on the fire. *(game counts)*
  - [ ] Bring the tarp and 4 planks to camp.
  - [ ] Build the shelter (Fig. 5.1).
- **Fig. 5.1 A-frame shelter, from the front and the side.** A Two pairs of logs, crossed at the top. B One log across them for a ridge. C The tarp over the ridge, pegged at the corners.⁵ D Planks laid for a floor, off the wet ground.
- **Done when** the shelter stands and you can sit under it, dry.
- **Rule 5 · Save up, then build.** Big jobs need more than one trip. Gather it all first: half a shelter keeps out exactly none of the rain.
- **Footnote:** ⁵ Put the torn bit of the tarp at the back. Rain mostly comes from the front, in the publishers’ experience.

### Chapter 6 · Breaking Rock

- **Story:** There’s green in the rocks by the falls. Green in a rock means copper, and copper means you can stop making everything out of sticks.
- **Teaches:** Mining. **Tools:** Stone pickaxe (made in this chapter).
- **You will need:** Branches 2 · Stones 3 · then Copper ore 5
- **Steps:**
  - [ ] Make a stone pickaxe: 2 branches, 3 stones.
  - [ ] Find the rocks with green streaks.
  - [ ] Mine 5 copper ore. *(game counts)*
- **Fig. 6.1 Axe or pick, and which rock.** A Axe: a broad edge, in line with the handle, for cutting. B Pick: a narrow point, for cracking. C Copper ore: streaked green and orange.⁶ D Plain rock: no streaks, no copper.
- **Done when** five lumps of copper ore are in your pack.
- **Rule 6 · The right tool for the job.** An axe for wood, a pick for rock. Each new tool opens a new kind of work.
- **Footnote:** ⁶ If it isn’t streaked green, it’s just rock, and you’re just hitting it.

### Chapter 7 · Keeping Things Dry

- **Story:** You now own more than you can carry. That’s how it starts.
- **Teaches:** Storing things. **Tools:** None.
- **You will need:** Birch logs 10 · Copper ore 5
- **Steps:**
  - [ ] Bring 10 logs and 5 copper ore to camp.
  - [ ] Build the storage chest.
  - [ ] Put something in it.
- **Fig. 7.1 Storage chest, taken apart.** A Logs, split into boards for the sides and base. B Copper, worked into two bands round the sides. C A copper hinge, so the lid stays on. D The lid, with a lip to shed rain.⁷
- **Done when** the chest is built and something is in it.
- **Rule 7 · Store what you don’t carry.** Your pack only holds so much. A chest holds the rest and keeps it dry. What goes in stays put until you take it out.
- **Footnote:** ⁷ This book fits in the chest. It has asked.

---

## Game-only text

- **Stuck pages chip:** *Still stuck together.* The river glued the rest of the book shut. Each chapter comes apart when you finish the one before it.
- **Book title bar:** Making Do · Your book · chapter 2 of 24
- **Page label (bottom bar):** Chapter 2 · page 6 / Chapter 2 · page 7 · 1 of 2 (when a page is split across two screens) / Title page / Pages 8 to 64. The page number appears only here in the game, not on the page.
- **Split page markers:** foot of the first screen: *Continued ›* · top of the second: *Page 7, continued*
- **Overflow cue:** *More below*

## Page 64: About the Publishers (colophon)

> Ottery & Moss have published useful books since before anyone thought to need them. This one is set in Fraunces, Literata and Barlow Condensed, printed on Munken Premium Cream, and sewn so it lies open on a rock.
>
> Revised Edition. Printed in [country]. No part of this book will save you from a waterfall, but most of it will help afterwards.
