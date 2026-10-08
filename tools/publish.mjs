// npm run publish-folder: makes ../chief-of-staff-publish/, ready to publish (SPEC.md, decision 71).
//
// 1. Copies exactly the committed files (git archive HEAD): no git history, no .DS_Store, target/ or
//    node_modules/. The repository holds no real meeting: its data is the fictional sample workspace.
//    If the folder is already a git repository (it has a .git), its .git is kept as it is and everything
//    else is replaced, so a file removed here disappears there too (decision 79). No git command is ever run
//    in that folder: nothing is added, committed, tagged or pushed. That is left to the person.
// 2. Runs `npm test` inside that folder with nothing but its own files (Cargo's build output goes to this
//    repository's target/, so the folder stays clean), and checks the run added nothing to it.
// 3. Scans every file's name and contents for the home-folders path ("/Users" and a slash on a Mac), this
//    Mac's user name, and any extra terms. Extra
//    terms come from MC_SCAN_TERMS (comma-separated) or, with --ask, from a prompt that doesn't show what is
//    typed. The terms are never printed or saved: only how many hits there were, and in which files.
//
//   npm run publish-folder
//   npm run publish-folder -- --ask
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.resolve(REPO, '..', 'chief-of-staff-publish');
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const step = (m) => console.log(`\n== ${m}`);

function hiddenPrompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let text = '';
    const onData = (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(text); return; }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f') text = text.slice(0, -1);
        else text += ch;
      }
    };
    stdin.on('data', onData);
  });
}

// Every file in the folder, leaving out the publish repository's own .git.
const walk = (root) => {
  const out = [];
  const go = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (p === root && e.name === '.git') continue;
      const f = path.join(p, e.name);
      if (e.isDirectory()) go(f); else out.push(f);
    }
  };
  go(root);
  return out.sort();
};
const fingerprint = (root) => Object.fromEntries(walk(root).map((f) => [path.relative(root, f), crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));

// ---------- extra scan terms, never printed ----------
let extra = (process.env.MC_SCAN_TERMS || '').split(',').map((t) => t.trim()).filter(Boolean);
if (process.argv.includes('--ask')) {
  if (!process.stdin.isTTY) { console.error('--ask needs a terminal.'); process.exit(1); }
  const typed = await hiddenPrompt('Extra words to scan for, comma-separated (not shown): ');
  extra = [...extra, ...typed.split(',').map((t) => t.trim()).filter(Boolean)];
}

// ---------- 1. the committed files ----------
step('Copying the committed files');
if (sh('git', ['status', '--porcelain'], { cwd: REPO }).stdout.trim()) {
  console.log('Note: the working tree has uncommitted changes; they are not included (only HEAD is).');
}
const isRepository = fs.existsSync(path.join(DEST, '.git'));
if (isRepository) {
  // A repository the person publishes from: keep its .git, replace everything else.
  for (const e of fs.readdirSync(DEST)) if (e !== '.git') fs.rmSync(path.join(DEST, e), { recursive: true, force: true });
  console.log(`${path.basename(DEST)} is a git repository: its .git is kept; everything else is replaced. No git command is run there.`);
} else if (fs.existsSync(DEST)) {
  // Otherwise only a folder this script made before is replaced.
  if (!fs.existsSync(path.join(DEST, 'tools', 'publish.mjs'))) {
    console.error(`${DEST} exists and was not made by this script. Move it away first.`);
    process.exit(1);
  }
  fs.rmSync(DEST, { recursive: true, force: true });
}
fs.mkdirSync(DEST, { recursive: true });
const archive = sh('git', ['archive', '--format=tar', 'HEAD'], { cwd: REPO, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
if (archive.status !== 0) { console.error(String(archive.stderr)); process.exit(1); }
const untar = spawnSync('tar', ['-x', '-C', DEST], { input: archive.stdout });
if (untar.status !== 0) { console.error(String(untar.stderr)); process.exit(1); }
const head = sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).stdout.trim();
const files = walk(DEST);
const unwanted = files.filter((f) => /(^|\/)(\.DS_Store|target|node_modules|\.git)(\/|$)/.test(path.relative(DEST, f)));
if (unwanted.length) { console.error(`Unwanted files were copied: ${unwanted.map((f) => path.relative(DEST, f)).join(', ')}`); process.exit(1); }
console.log(`${files.length} files from commit ${head}.`);

// ---------- 2. the tests, with only this folder ----------
step('Running npm test inside the folder');
const before = fingerprint(DEST);
const env = { ...process.env, CARGO_TARGET_DIR: path.join(REPO, 'target', 'publish-test') };
delete env.MC_TEST_DATA;
const test = sh('npm', ['test'], { cwd: DEST, env, maxBuffer: 64 * 1024 * 1024 });
const summary = `${test.stdout}${test.stderr}`.split('\n').filter((l) => /^# (tests|pass|fail|cancelled) /.test(l)).map((l) => l.slice(2)).join(', ');
const testsPassed = test.status === 0 && /fail 0/.test(summary) && /cancelled 0/.test(summary);
console.log(`npm test: ${summary || 'no summary'}${testsPassed ? '' : ' — FAILED'}`);
const after = fingerprint(DEST);
const touched = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]);
console.log(touched.length ? `The test run changed files in the folder: ${touched.join(', ')}` : 'The test run added or changed nothing in the folder.');

// ---------- 3. the scan ----------
step('Scanning names and contents');
const terms = [
  { label: `"${path.dirname(os.homedir())}/"`, needle: `${path.dirname(os.homedir())}/`, ci: false },
  { label: 'this Mac\'s user name', needle: os.userInfo().username, ci: true },
  ...extra.map((t, i) => ({ label: `extra word ${i + 1}`, needle: t, ci: true })),
];
let hits = 0;
for (const t of terms) {
  const needle = t.ci ? t.needle.toLowerCase() : t.needle;
  const found = [];
  for (const f of walk(DEST)) {
    const rel = path.relative(DEST, f);
    const text = fs.readFileSync(f).toString('latin1');
    const hay = t.ci ? text.toLowerCase() : text;
    const name = t.ci ? rel.toLowerCase() : rel;
    let n = name.includes(needle) ? 1 : 0;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
    if (n) found.push(`${rel} (${n})`);
  }
  hits += found.length;
  console.log(`${found.length ? 'FOUND' : 'none '}  ${t.label}${found.length ? `: ${found.join(', ')}` : ''}`);
}
if (!extra.length) console.log('(No extra words given. Run with --ask, or set MC_SCAN_TERMS, to add some.)');

// ---------- summary ----------
const size = sh('du', ['-sh', DEST]).stdout.split('\t')[0].trim();
const top = fs.readdirSync(DEST).filter((e) => e !== '.git').sort().map((e) => (fs.statSync(path.join(DEST, e)).isDirectory() ? `${e}/` : e));
console.log(`\n${path.relative(path.dirname(REPO), DEST)}/: ${files.length} files, ${size}${isRepository ? ' (with its .git)' : ''}: ${top.join(' ')}`);
if (isRepository) console.log('Nothing was added, committed, tagged or pushed. Review with git status in that folder.');
const ok = testsPassed && touched.length === 0 && hits === 0;
console.log(ok ? 'Ready to publish: tests pass with only this folder, and the scan came back empty.' : 'NOT ready: see above.');
process.exit(ok ? 0 : 1);
