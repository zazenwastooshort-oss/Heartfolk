# Spec: A Field Guide to Having Nothing

The field journal direction. A hardcover notebook, 130 × 210 mm, 96 pages, with a leather-grain cover, copper foil, an elastic band and a ribbon. It is printed in full colour on cream paper so it looks like Ida's own journal: her ink, her grandson's pencil, other people's notes taped in. The words are in `copy.md`; the look is in `index.html`.

## Trim size: 130 × 210 mm (5.1 × 8.3 in)

- **The size of a large hardcover notebook.** Journal makers tool for this size already, so rounded-corner dies, elastic bands, ribbons and cover materials are stock items, which keeps quotes low and samples quick.
- **It is a field journal, not a coffee-table book.** It sits in one hand and goes in a coat pocket. A larger book would lose the joke.
- **It is shaped like a phone held upright.** The page is 1 : 1.62. The book area on a 390 × 844 phone screen is about 1 : 1.8, so one page fills one screen with little wasted space.
- **Boards** are 133 × 216 mm: 3 mm larger than the pages at the head, foot and fore-edge.

## Page count: 96 pages, six sewn sections of 16

| Pages | What |
|---|---|
| Front endpaper | The map, *Below the falls* (pasted to the board and the facing flyleaf; not counted) |
| 1 | Title page, blurb, the printed *This book belongs to* plate |
| 2 | How to use this book |
| 3 | Contents: all 40 entries, two columns of 20, Caveat 12.5 pt on 8 mm lines (see below) |
| 4–83 | 40 entries, one spread each: the entry on the left, the sketch on the right |
| 84–93 | Your own notes: ten pages of the blank printed form |
| 94 | People I owe a pie: everyone credited in the book, with page numbers |
| 95 | Small print and colophon ("Do not rely on this book in a real river. Ida would want you to have a phone.") |
| 96 | Blank, as the last page of a journal should be |
| Back endpaper | The map again, with the river running off the edge toward the village |

**Why 96:** printers work in 16-page sections, and 40 spreads covers the whole game's goal list as planned. If the list grows past 40, add whole sections (112 or 128 pages); never an odd number of pages. The spine comes out at about 12 mm (book block about 7 mm at 120 gsm, plus boards); take the exact figure from the printer's blank dummy before the cover is drawn.

**Contents on one page.** It must stay on page 3: a second contents page would push No. 1 onto a right-hand page and break the entry-left, sketch-right pattern for the whole book. So page 3 lists all 40 entries in two columns of 20 (1–20 left, 21–40 right), each column 47 mm wide with a 5 mm gap, in Caveat at 12.5 pt on 8 mm lines. 20 lines take 160 mm; with the page heading that ends at 193 mm, inside the 195 mm text area. Each line is number, title, dotted leader, page. Titles in the contents are 20 characters at most (use a short form if an entry's own title is longer). The mock-up in `index.html` sets all 40 lines; entries 8–40 there are stand-in titles, only to prove the fit. If the book grows past 40 entries, the contents switches to Ida's chapters with page ranges instead of more lines.

## Margins and bleed

- **Bleed:** 3 mm on the head, foot and fore-edge of every page and both endpapers. The gutter edge needs none.
- **Margins, measured from the trim:** head 18 mm, foot 15 mm, outer 13 mm, inner (gutter) 18 mm. The text area is 99 × 177 mm, from 18 mm to 195 mm below the head.
- **Why the deep gutter:** a sewn hardcover with a rounded spine opens well but not perfectly flat; the 10 mm nearest the spine curves away.
- **The printed form** sits in the head margin, 7–16 mm from the top: a 10 × 9 mm *No.* box at the outer corner, with the *Place* and *Weather* rules beside it. Why 7 mm: a sewn book block trimmed on three sides can be up to about ±1 mm out, and a ruled box 4–5 mm from the edge would look visibly crooked from copy to copy. At 7 mm the wander is not noticeable.
- **Folio:** Fraunces, 8.5 pt, at the outer foot corner, 8 mm above the trim (inside the 15 mm foot margin, about 5 mm below the text area).
- **Safe zone:** nothing that matters within 5 mm of the trim, and no ruled line or box parallel to a trimmed edge within 7 mm of it. Stains, tape, the pressed leaf and the singed corner may run into the bleed on purpose.
- **Rounded corners:** a 6 mm radius die-cut on the book block and the boards. The No. box and the folio sit clear of the curve.

## Printing

- **Full colour (CMYK) on every page.** The tape, the leaf, the stains and the copper wash on the flames need it, and at Kickstarter quantities (digital print, up to about 1,000 copies) four colours cost about the same as two.
- **Cheaper option for a big offset run:** two spot inks, forest green for the printed form and sepia black for everything written. Pencil becomes a 65% tint of sepia; tape, leaf and stains become lighter tints.
- **The cream is the paper.** Never print a cream background; the colour comes from the stock.
- **Line art stays vector** (PDF/SVG) so it prints sharp; the kraft paper and tape textures are 300 dpi images.
- **Colour profile:** uncoated (PSO Uncoated v3, FOGRA52). Colours print a little softer than on screen, which suits the look. Proof on the real stock before the run.

## Paper and binding

- **Text paper:** 120 gsm cream uncoated woodfree, such as Munken Pure 120 or the printer's cream equivalent. It takes pencil and fountain pen without show-through, so owners can tick the boxes and use the notes pages.
- **Endpapers:** 140 gsm uncoated, natural or kraft tint, printed with the map in sepia and green.
- **Binding:** section-sewn hardcover, rounded spine, brown head and tail bands, 2.5 mm greyboard.
- **Cover:** leather-grain coated paper in dark tan, such as Skivertex Vicuana or the printer's PU leatherette. Not real leather in the standard edition: cheaper, more even from copy to copy, and fine for vegan backers.
- **Cover marks:** title and waterfall emblem in copper foil; the frame and the word *Hearthfolk* blind-debossed (pressed in, no ink). Spine: the title in copper foil, reading top to bottom, with *Hearthfolk* at the foot. Back: the emblem, blind-debossed, nothing else.
- **Fittings:** an 8 mm dark brown elastic band running top to bottom through the back board, a 3 mm copper satin ribbon, 6 mm rounded corners.
- **Barcode:** if the book is ever sold in shops, the barcode goes on a paper belly band, so the cover stays clean.
- **Stretch goals:** a pocket inside the back cover holding a folded map; a vegetable-tanned real leather edition; a pencil loop.

## Fonts and licences

All four are on Google Fonts under the SIL Open Font License 1.1: free for print, free to embed in the game (commercial use included) and free to modify. The two limits are that the font files can't be sold on their own, and a modified version must be renamed. Ship the OFL text with the game's credits, and self-host Latin-subset WOFF2 files (roughly 200 KB for all four) rather than loading Google's servers, so the book works offline.

| Use | Font | x-height | Print size | Phone size |
|---|---|---|---|---|
| The notebook's printed parts (form labels, folios, plate), the cover title. It is also the game's display face. | **Fraunces** (Undercase Type) | 0.44 em | labels 7.8 pt italic, folio 8.5 pt | labels 13 px, folio 11 px (furniture, see below) |
| Ida's hand: the entries | **Caveat** (Impallari Type) | 0.36 em | body 16 pt on 20.5 pt; hints, asides, *learned from* and the form 15.3 pt; titles 29 pt bold; sketch labels 15.7 pt; contents 12.5 pt | body **22 px**, weight 500; hints 22 px in ink-soft; asides, *learned from* and the form **21 px**; titles 31 px; sketch labels 22 px |
| The grandson's pencil | **Patrick Hand** (Patrick Wagesreiter) | 0.47 em | 14 pt | 17.5 px |
| Other people's hands: Os, Gret and later contributors | **Kalam** (Indian Type Foundry) | 0.53 em (bold) | 11.5 pt bold | 15.5 px |

**The phone floor: 15 px equivalent, measured by x-height.** Point sizes lie for handwriting fonts, so the floor is set on the x-height (the height of a lower-case x): anything the player reads must have an x-height of at least 7.5 px, which is what 15 px Segoe UI or Roboto gives. Caveat's x-height is only 0.36 em (Segoe UI is 0.50, Arial 0.52), so Caveat at 22 px reads like about 15.5 px of an ordinary font, and Caveat never goes below 21 px. Patrick Hand needs 16 px, Kalam Bold 14.5 px, Fraunces 17 px. Ida's body is weight 500 on screens so the strokes hold up on small, bright displays; print stays at 400. The where-to-find hints are information the player needs, so on a phone they are the same size as the body and set apart by colour (ink-soft), not by size. The only text below the floor is the printed form's labels (*No.*, *Place*, *Weather*) and the page numbers: furniture that is the same on every page and never needed to play. At 22 px a line of Ida's hand is about 44 characters on a 390 px phone.

Handwriting fonts repeat identical letters. To keep the page looking written: margin notes and taped scraps are turned 1–3°, body text stays straight, and each hand keeps its own colour. A custom font for Ida can come later (Caveat is OFL, so it can be adapted and renamed).

## Colour palette

The CMYK values are rough starting points for uncoated stock; the printer converts them with the FOGRA52 profile and we check them on a proof.

| Role | Hex | CMYK, approx. |
|---|---|---|
| Paper (the stock, not printed) | `#f3ead5` | — |
| The printed form: rules, labels, No. box, folios | `#3d5a3a` forest green | 70 35 80 40 |
| Dot grid (5 mm pitch, 0.6 mm dots) | forest green at 25% | tint |
| Ida's ink | `#2e2219` sepia black | 50 65 75 75 |
| Ida's where-to-find hints (ink-soft) | `#4a3a2c` | 45 60 75 55 |
| The grandson's pencil and all sketches | `#57534d` graphite | 40 40 45 60 |
| Other hands (Gret) | `#2b3d5c` blue-black | 90 70 35 30 |
| Os's charcoal | `#26221f` | 40 45 50 85 |
| Red pencil: *Remember* | `#a5502e` rust | 20 75 90 15 |
| Copper: foil match and the flame wash (at 40%) | `#e8a65e` | 5 40 65 0 |
| Kraft paper scraps | `#d6bc8c` | 15 25 48 0 |
| Tape | `#ece0aa` at 60% | 5 8 35 0 |
| Endpaper tint and map ink | `#e7d9bb`, `#4a3423` | 5 10 25 0; 45 65 80 50 |
| Cover leather (the material, not printed) | about `#5b3c25` dark tan | — |

In the game, the book sits inside the game's own interface colours: green panel `rgba(30, 52, 27, .96)`, cream text `#f1e8d4`, muted `#b6c0a2`, copper accent `#e8a65e`.

## How the game version maps to the print

**One source.** The game and the print use the same words, order, numbers and marks. `copy.md` is that source; in the game each entry is one data record: number, title, place, weather, story, needs (item, quantity, where), steps, remember, aside, learned from, notes (hand, who, text, shown always or only when done), sketch, and extras (tape, stains).

**One entry = one spread.** The left page holds everything the game needs; the right page is the sketch.

**Front pages in the game.** The title page and *How to use this book* come first, as in print. The game's contents lists only the entries the player has reached plus the next one, at phone sizes; the 40-line two-column contents is print only.

**Phones in portrait (under 700 px wide): one page per screen.**
- The book opens on the current goal's entry page. Page order: entry, its sketch, the next entry, and so on.
- Screen budget, top to bottom: the phone's own safe area (47–59 px for the status bar and camera), 56 px for a chip saying *No. 2 of 7* and the close button (46 px), the page in a 7 px leather border, 100 px for the arrows (54 px round buttons in the game's green) including the 34 px home-bar safe area. Swipe left and right also turns. The gutter shadow sits on the side it has in print.
- Type never goes below the phone sizes in the font table, so most pages are taller than the screen. The page scrolls inside the border and the arrows stay put. The scrollbar stays hidden, so whenever there is more below, the foot of the page fades softly to paper and a small pencil chevron shows; tapping it scrolls on by 70% of a screen. The fade goes when the page is scrolled to the end.
- Same parts in the same order as print, with three moves: the grandson's pencil note sits straight after the tick list, on a line kept blank for it (a faint pencil guide until the note arrives), so it appears where the player's eye already is; the *learned from* line follows the text instead of sitting at the foot; taped scraps (Os's note) sit under the sketch instead of on it. Margins shrink to 18 px.
- Sketches: the same line art at the page width, without its printed labels. The labels are set in HTML on top of the drawing at 22 px Caveat, in the shorter phone wording from `copy.md`, positioned for the narrowest phone (a 280 px drawing). Tapping a sketch (or its magnifier button) opens the whole printed drawing, printed labels and all, 560 px wide in a drag-to-look-around view, where the labels come out at about 31 px.

**Wide screens (landscape tablets, PC, TV).** The exact print spread only where it is big enough to read; otherwise phone pages, two at a time.
- Work out the print scale: *s* = the smaller of (screen height − 96) ÷ 210 and (screen width − 144) ÷ 260, in px per mm (96 px for the controls above and below, 72 px for each side arrow, 260 mm for an open spread).
- **s ≥ 3.9 px/mm (a page at least about 820 px tall): the exact print spread**, measured in print millimetres. At 3.9 px/mm Ida's body is 22 px, her hints, asides and form 21 px, sketch labels 21.6 px, the pencil 19 px and Kalam 16 px, so everything clears the phone floor. In practice: 1080p and larger monitors, a 12.9-inch iPad Pro in landscape.
- **s < 3.9 px/mm: two phone pages side by side**, entry left and sketch right, using the phone layout with the phone sizes as fixed minimums. Each page is 360–420 px wide, centred, and scrolls on its own with the fade and chevron. In practice: 1366 × 768 and 1440 × 900 laptops, landscape tablets, phones turned sideways. (Printed spread at 768 px tall would be 3.2 px/mm: Ida at 18 px, about 12.6 px equivalent. Too small.)
- **TV: always two pages side by side, at TV sizes, never the print spread.** From across a room the floor goes up: Ida's body at least 34 px, and the other hands scaled with it (× 1.55): hints 34 px, asides and form 33 px, titles 48 px, pencil 27 px, Kalam 24 px, sketch labels 34 px, form labels 20 px. On a 1920 × 1080 screen each page is about 600 px wide and scrolls; D-pad up and down scrolls the page, left and right turns it, Back closes. TV means the TV build, or the *Across the room* text setting on any screen.
- **Easy-read** always uses the two-page layout on wide screens, never the print spread (see below).
- Arrows sit at the sides in every wide layout.

**What the game adds, always in pencil.** Ticks; counts at the end of a line (*2 of 4*); and when an entry is finished, the grandson's note. If its line is not fully on screen, the page first scrolls smoothly until the line sits clear of the fade; then the note writes itself in (a 1.3 s left-to-right reveal), so the player always sees it happen. With reduced motion on, the scroll jumps and the note appears without the reveal. The game never changes Ida's ink. Her one tick, *This book* on page 4, is printed in ink in both versions.

**Pages ahead are stuck together.** The player can always read the next entry. Anything further shows as pages still stuck together from the river, with a short note in the game's own green interface (not in the book's voice). They come apart as goals are done.

**Marks of use.** Water stains, tape, the leaf and the thumbprint appear in the game too, but anything that would sit under text on a phone is left out there (the singed corner, for one).

**Easy-read setting.** For players who find handwriting hard to read. It swaps the three handwriting fonts for Fraunces and **reflows the text**; it does not keep the print layout. At the same size Fraunces is about 35% wider than Caveat (measured on the same sentence at 22 px), so sizes are matched by x-height instead: Caveat sizes × 0.85, Patrick Hand × 1.07, Kalam × 1.2. On a phone that gives Ida's body 19 px, hints 19 px, asides and form 18 px, titles 26 px, the pencil 19 px (Fraunces italic, still graphite), other hands 19 px (in their own colours). Text still runs about 15% wider than Caveat, so pages get a little longer and scroll. Sketch labels leave the drawing in Easy-read: small numbered pencil circles mark the spots, and the labels sit in a numbered list under the sketch, so wider type never collides with the line art. On wide screens Easy-read always uses the two-page phone layout (TV sizes on a TV, × 0.85 again), never the exact print spread.

**The printed edition is the finished journal.** All of the grandson's pencil notes are printed, so it reads as the book he carried to the end, passed on to its next owner. The boxes stay empty (except Ida's first one) so that owner can tick them.

## Making the files

- **Layout:** InDesign or Affinity Publisher, 130 × 210 mm facing pages, 3 mm bleed. A master page holds the printed form (No. box and Place and Weather rules at 7–16 mm, the dot grid over the 18–195 mm text area, the folio). Export PDF/X-4.
- **Sketches:** the drawings in `index.html` set the composition. For print, an illustrator redraws them in real pencil at 150% and scans at 600 dpi; the game uses traced SVGs of the same drawings, so both versions match.
- **Proofs:** one printed and bound blank dummy (spine width, how flat it opens), then one hard proof on the real stock before the run.
