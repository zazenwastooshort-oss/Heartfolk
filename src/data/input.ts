// Pressing on the scene (the camp build, 13 Oct 2026: "you upgrade by the building tab, and or right clicking the
// object"), as tables only: when a press is a tap, a drag that turns the camera, or a long press that opens what can
// be done with a building at the camp (ui/gesture.ts decides; ui/campmenu.ts is the menu).

/** A press held still on a phone or tablet: held `ms` milliseconds within `slop` pixels of where it went down, it opens
 *  the camp's menu (a mouse opens it with its right button); moved further than `slop`, it is a drag (the camera
 *  turns) and never a tap; from `cue` milliseconds a small ring fills round the finger, so a held press can be seen
 *  coming (D24). */
export const LONG_PRESS = { ms: 500, slop: 8, cue: 150 };

/** Where the camp's menu opens: `offset` pixels to the side of and below the mouse's press, kept on the screen and clear
 *  of the goal card and the row of buttons; for a finger's long press, `finger.offset` pixels to its side and above it
 *  first (the hand comes from below), the fingertip a disc `finger.r` pixels round the press (about 44 px across), so
 *  it never sits under the finger or the hand. */
export const MENU = { offset: 14, finger: { offset: 30, r: 22 } };
