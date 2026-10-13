// Freezes old saves from the release tags (the camp build, stage 0: docs/plans/2026-10-13-camp-build-plan.md). For each
// release, a temporary detached worktree wt/freeze-<version> of its tag beside this checkout; the era's freeze script
// (tools/freeze/) copied in as a test, so it runs on that version's own code (createState, serialize, the simulation);
// it writes tests/fixtures/saves/<version>-<case>.json here, each exactly the text that version keeps in the browser;
// then the worktree is removed. node_modules comes from the main checkout, as for any worktree under it. Saves written
// by hand (named -hand) are kept; the others for that version are written afresh.
// Plain Node, no packages. Usage: node tools/freeze_saves.mjs [version ...]   (all of them when none is given)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Each release frozen, and the freeze scripts it runs (tools/freeze/<name>.ts). The first is copied in as
 *  tests/freeze.test.ts, any other as tests/freeze_<name>.test.ts; tools/freeze/common.ts goes in beside them. */
const RELEASES = [
  { version: '0.0.22', scripts: ['era10'] },              // save format 10: chapter 2 begins
  { version: '0.0.24', scripts: ['era10'] },              // format 10, with the rats and the goblin camp
  { version: '0.0.27', scripts: ['era11'] },              // format 11: building in stages (bench, workbench, lean-to, log hut)
  { version: '0.0.29', scripts: ['era11'] },              // format 11, the last before needs
  { version: '0.0.30', scripts: ['era11', 'needs'] },     // format 11 with his needs and the tools in the chest
];

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: here, encoding: 'utf8' }).trim();
const main = dirname(resolve(here, git('rev-parse', '--git-common-dir')));
const out = join(here, 'tests', 'fixtures', 'saves');
const vitest = join(main, 'node_modules', 'vitest', 'vitest.mjs');
const wanted = process.argv.slice(2);

mkdirSync(out, { recursive: true });
for (const { version, scripts } of RELEASES.filter(r => !wanted.length || wanted.includes(r.version))) {
  const tag = `camp-${version}`, dir = join(main, 'wt', `freeze-${version}`);
  if (existsSync(dir)) throw new Error(`${dir} is in the way: remove it first (git worktree remove)`);
  // the time each save says it was played up to: when the release was made
  const savedAt = Number(git('log', '-1', '--format=%ct', tag)) * 1000;
  for (const f of readdirSync(out)) if (f.startsWith(`${version}-`) && f.endsWith('.json') && !f.endsWith('-hand.json')) rmSync(join(out, f));
  git('worktree', 'add', '--detach', dir, tag);
  try {
    copyFileSync(join(here, 'tools', 'freeze', 'common.ts'), join(dir, 'tests', 'freeze_common.ts'));
    scripts.forEach((name, i) => copyFileSync(join(here, 'tools', 'freeze', `${name}.ts`), join(dir, 'tests', i ? `freeze_${name}.test.ts` : 'freeze.test.ts')));
    execFileSync(process.execPath, [vitest, 'run', 'tests/freeze'], {
      cwd: dir, stdio: 'inherit',
      env: { ...process.env, HEARTHFOLK_FREEZE: '1', HEARTHFOLK_FREEZE_OUT: out, HEARTHFOLK_FREEZE_VERSION: version, HEARTHFOLK_FREEZE_SAVED_AT: String(savedAt) },
    });
  } finally {
    git('worktree', 'remove', '--force', dir);
  }
}
