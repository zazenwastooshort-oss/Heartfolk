// The goals that take a new player from washing up below the falls to a working camp (12 Oct 2026), in order. Each
// asks for materials; the goal card shows the first one not yet done. Building them comes in the next updates, so for
// now the card counts what has been gathered, and `ready` says what happens once it's all there.

export interface Goal { id: string; title: string; hint: string; ready: string; needs: Record<string, number> }

export const GOALS: Goal[] = [
  { id: 'campfire', title: 'Light the campfire', hint: 'Chop birch trees for logs.', ready: 'You have the logs. Lighting the fire comes in the next update.', needs: { birch_logs: 5 } },
  { id: 'shelter', title: 'Build a shelter', hint: 'Chop more birch logs.', ready: 'You have the logs. Building the shelter comes in a later update.', needs: { birch_logs: 15 } },
  { id: 'chest', title: 'Build a storage chest', hint: 'Chop logs and mine copper ore.', ready: 'You have it all. Building the chest comes in a later update.', needs: { birch_logs: 20, copper_ore: 10 } },
];
