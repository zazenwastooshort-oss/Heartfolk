// Sound (13 Oct 2026, the owner: "Can we also make and add sound? Like an ambient music and then the general sounds?",
// then the pick "Made in code"): every sound is made by the game's own code as it plays (ui/sound.ts, ui/music.ts),
// with nothing downloaded. The numbers here: how loud each setting is, the sounds around the camp (the river, the wind,
// birds by day, crickets at night, the fire), and the music, a few quiet phrases now and then with long rests between.
// Composed music can take the music's place in an art pass.

/** The two volume settings (Settings, remembered in this browser only): music, and every other sound. */
export type SoundLevel = 'off' | 'low' | 'medium' | 'high';
export const SOUND_LEVELS: readonly SoundLevel[] = ['off', 'low', 'medium', 'high'];
/** What each level does to the loudness, 0 to 1. */
export const LEVEL_GAIN: Record<SoundLevel, number> = { off: 0, low: 0.3, medium: 0.6, high: 1 };
/** A new player's levels: the sounds medium, the music low. */
export const SOUND_DEFAULTS = { music: 'low' as SoundLevel, sounds: 'medium' as SoundLevel };

/** The sounds around the camp, each at its loudness (0 to 1, under the Sounds setting). river: the water and the falls,
 *  louder near the falls (`near` metres, down to `far` of it from `far` metres on). wind: a soft, slow wind. birds: a
 *  call every `every` seconds (shortest, longest) from dawn to dusk (`from`, `to`, hours). crickets: a chirp every
 *  `every` seconds from dusk to dawn. fire: a crackle `perSecond` times a second (by night, a fire just stoked, `night`
 *  times as many), loudest within `near` metres of it, quiet from `far` on. */
export const AMBIENCE = {
  river: { gain: 0.22, near: 6, far: 40, quiet: 0.3 },
  wind: { gain: 0.06 },
  birds: { gain: 0.09, every: [1.5, 6] as const, from: 6, to: 19.5 },
  crickets: { gain: 0.035, every: [0.5, 1.4] as const, from: 20.5, to: 5.5 },
  fire: { gain: 0.07, perSecond: 3, night: 2, near: 4, far: 18 },
} as const;

/** The music, generated (ui/music.ts): a piece of `bars` bars of four beats now and then, a rest of `rest` seconds
 *  (shortest, longest) between pieces, the first `first` seconds after the sound starts. By day a major key at `bpm`,
 *  by night a minor one, slower. `scale`: the notes of each (semitones from the key's root); `chords`: the chord
 *  progressions a piece picks from (degrees of the scale's seven notes, 0 the root). `root`: the key's root (MIDI). */
export const MUSIC = {
  bars: 8, first: 4, rest: [25, 60] as const,
  day: { root: 62, bpm: 76, scale: [0, 2, 4, 5, 7, 9, 11] as const, pentatonic: [0, 2, 4, 7, 9] as const },
  night: { root: 57, bpm: 62, scale: [0, 2, 3, 5, 7, 8, 10] as const, pentatonic: [0, 3, 5, 7, 10] as const },
  chords: [[0, 4, 5, 3], [0, 3, 4, 0], [5, 3, 0, 4], [0, 5, 3, 4]] as const,
  melody: 0.16, pad: 0.05,
} as const;

/** The shortest gap between two of the same sound (seconds), so a burst of events (a catch-up, a fast night) never
 *  turns into a din. */
export const SOUND_GAP = 0.06;
