# The whole camp

`whole-camp.json` is a camp save with every building at its largest step: the log cabin (with the storage chest on its porch), the stone hearth, the woodshed (full) and the training dummy. It was made by playing a new game: the playthrough bot plays to the training dummy, then he builds the four upgrades (`tests/wholecamp.test.ts`, which also checks it). Make it again with `HEARTHFOLK_WHOLE_CAMP=1 npx vitest run tests/wholecamp.test.ts`.

To walk round it in the game: on the game's address (any missing page on the same port works), set `localStorage['hearthfolk_camp']` to the file's text, then open the game with a fresh query (`?fresh=N`). It has no time stamp, so it opens as it is, with no away time caught up.
