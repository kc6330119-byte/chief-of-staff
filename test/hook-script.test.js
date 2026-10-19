// 0.4.0, step 3: the hook as a script. Each workspace's .claude/settings.json runs
// sh "$CLAUDE_PROJECT_DIR/.claude/hooks/check-summary.sh" after every Edit or Write. The script passes over a save
// outside meeting-notes/ without starting the app, never starts an app older than 0.4.0 (which has no --hook and would
// open its window), and otherwise hands the payload to the app's --hook and returns its exit code. These tests run it
// with sh and stand-in apps in a temporary folder: the script with /Applications moved there, and HOME set to it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { SITE_DIR, snapshot } from './helpers/site.js';

const TARGET_DIR = process.env.CARGO_TARGET_DIR || path.join(SITE_DIR, 'target');
const APP_BIN = path.join(TARGET_DIR, 'debug', 'chief-of-staff');
const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');
const SCRIPT = '.claude/hooks/check-summary.sh';
const COMMAND = 'sh "$CLAUDE_PROJECT_DIR/.claude/hooks/check-summary.sh"';
const APP = 'Chief of Staff for Managers.app';
const SUMMARY = '2026-09-15_kevin-sam_1on1.md';
const NOT_INSTALLED = 'Chief of Staff for Managers isn\'t installed, so this summary wasn\'t checked.\n';
const TOO_OLD = 'This version of Chief of Staff for Managers can\'t check summaries; update to 0.4.0 or later.\n';
const PAYLOADS = fs.readFileSync(path.join(SITE_DIR, 'test', 'fixtures', 'hook', 'step1-payloads.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const script = read(SAMPLE, SCRIPT);

let built = false;
function buildApp() {
  if (built) return;
  const res = spawnSync('cargo', ['build', '--quiet', '-p', 'chief-of-staff-app'], { cwd: SITE_DIR, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`cargo build failed.\n${res.error?.message || ''}${res.stdout}${res.stderr}`);
  built = true;
}

function run(cmd, args, input, { env, cwd = SITE_DIR }) {
  const res = spawnSync(cmd, args, { input, cwd, env, encoding: 'utf8', timeout: 30000 });
  if (res.error) throw res.error;
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

// A step 1 payload for this tool, pointed at `file` with `cwd` as the session's folder.
function payload(tool, file, cwd) {
  const p = structuredClone(PAYLOADS.find((x) => x.tool_name === tool));
  p.cwd = cwd;
  p.tool_input.file_path = file;
  p.tool_response.filePath = file;
  return JSON.stringify(p);
}

const plist = (version) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.practicalaishift.chiefofstaff</string>${version === undefined ? '' : `
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>`}
</dict>
</plist>
`;

let tmp;
let n = 0;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-hook-script-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A folder for one test: system/ stands for /Applications, home/ for the home folder, log for what the stand-in apps
// were run with.
function place() {
  const dir = path.join(tmp, `t${++n}`);
  for (const d of ['system', 'home', 'cwd', 'tmp']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const copy = path.join(dir, 'check-summary.sh');
  const from = '"/Applications/Chief of Staff for Managers.app"';
  assert.equal(script.split(from).length, 2, 'the script names /Applications once');
  fs.writeFileSync(copy, script.replace(from, JSON.stringify(path.join(dir, 'system', APP))));
  return { dir, system: path.join(dir, 'system'), home: path.join(dir, 'home'), log: path.join(dir, 'log'), copy };
}

// A stand-in app in `apps` (a folder standing for /Applications or ~/Applications): its Info.plist gives `version`
// (none when undefined, no Info.plist at all when null). When started it adds a line to `log`, says how it was run on
// stderr and exits with `code`.
function fakeApp(apps, version, { log, code = 2 } = {}) {
  const contents = path.join(apps, APP, 'Contents');
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  if (version !== null) fs.writeFileSync(path.join(contents, 'Info.plist'), plist(version));
  const exe = path.join(contents, 'MacOS', 'chief-of-staff');
  fs.writeFileSync(exe, `#!/bin/sh\nin=$(cat)\nprintf '%s\\n' "${version} $*" >> "${log}"\nprintf '%s\\n' "${version} $*: $in" >&2\nexit ${code}\n`, { mode: 0o755 });
  return exe;
}

// Runs the script copy as Claude Code's sh would, with only PATH, HOME and TMPDIR set.
const hook = (p, input) => run('/bin/sh', [p.copy], input, { env: { PATH: '/usr/bin:/bin', HOME: p.home, TMPDIR: path.join(p.dir, 'tmp') + path.sep }, cwd: path.join(p.dir, 'cwd') });
const started = (p) => (fs.existsSync(p.log) ? fs.readFileSync(p.log, 'utf8').split('\n').filter(Boolean) : []);
const summaryPayload = (tool = 'Write') => payload(tool, path.join(SAMPLE, 'meeting-notes', SUMMARY), SAMPLE);

describe('the hook in .claude/settings.json', () => {
  const settingsOf = (dir) => JSON.parse(read(dir, '.claude/settings.json'));

  test('the sample and the starter have the same settings: one PostToolUse hook on Edit|Write that runs the script with sh', () => {
    assert.deepEqual(settingsOf(STARTER), settingsOf(SAMPLE));
    assert.deepEqual(settingsOf(SAMPLE), { hooks: { PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: COMMAND }] }] } });
  });

  test('the sample and the starter have the same script, in plain sh, with nothing that writes a file', () => {
    assert.equal(read(STARTER, SCRIPT), script);
    assert.deepEqual(fs.readdirSync(path.join(SAMPLE, '.claude', 'hooks')), ['check-summary.sh']);
    assert.deepEqual(fs.readdirSync(path.join(STARTER, '.claude', 'hooks')), ['check-summary.sh']);
    const code = script.split('\n').filter((l) => !l.startsWith('#')).join('\n');
    assert.doesNotMatch(code, /\b(jq|python3?|node|bash|perl|ruby|osascript|defaults|rm|mv|cp|touch|mkdir|tee|ln|chmod|open)\b/);
    // The only redirections: messages to stderr, and PlistBuddy's own errors to /dev/null.
    assert.deepEqual([...code.matchAll(/\d*>+[^\s)]*/g)].map((m) => m[0]).sort(), ['2>/dev/null', '>&2', '>&2']);
    assert.equal((code.match(/\$\(cat\)/g) || []).length, 1, 'stdin is read once');
    const syntax = spawnSync('/bin/sh', ['-n', path.join(SAMPLE, SCRIPT)], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  });

  test('the command, as Claude Code runs it with CLAUDE_PROJECT_DIR, runs the workspace\'s script', () => {
    const p = place();
    fakeApp(p.system, '0.4.0', { log: p.log, code: 2 });
    const project = path.join(p.dir, 'project');
    fs.mkdirSync(path.join(project, '.claude', 'hooks'), { recursive: true });
    fs.copyFileSync(p.copy, path.join(project, SCRIPT));
    const out = run('/bin/sh', ['-c', COMMAND], summaryPayload(), { env: { PATH: '/usr/bin:/bin', HOME: p.home, CLAUDE_PROJECT_DIR: project }, cwd: path.join(p.dir, 'cwd') });
    assert.deepEqual(out, { code: 2, stdout: '', stderr: `0.4.0 --hook: ${summaryPayload()}\n` });
  });
});

describe('check-summary.sh', () => {
  test('a save outside meeting-notes/: exit 0, nothing said, and the app is not started', () => {
    const p = place();
    fakeApp(p.system, '0.4.0', { log: p.log });
    for (const input of [...PAYLOADS.map((x) => JSON.stringify(x)), payload('Write', path.join(SAMPLE, 'people.md'), SAMPLE),
      payload('Edit', path.join(SAMPLE, '.claude', 'skills', 'review-transcript', 'SKILL.md'), SAMPLE), '', 'not json', '{}']) {
      assert.deepEqual(hook(p, input), { code: 0, stdout: '', stderr: '' }, input);
    }
    assert.deepEqual(started(p), []);
  });

  test('no app in /Applications or ~/Applications: exit 0 and one line', () => {
    const p = place();
    for (const tool of ['Write', 'Edit']) assert.deepEqual(hook(p, summaryPayload(tool)), { code: 0, stdout: '', stderr: NOT_INSTALLED }, tool);
  });

  test('an app reporting 0.3.3: exit 0 and one line, and the app is not started', () => {
    const p = place();
    fakeApp(p.system, '0.3.3', { log: p.log });
    assert.deepEqual(hook(p, summaryPayload()), { code: 0, stdout: '', stderr: TOO_OLD });
    assert.deepEqual(started(p), []);
  });

  test('an older app, or one whose version can\'t be read, is never started', () => {
    for (const version of ['0.2.0', '0.3.9', '0.0.1', '0', '', 'abc', '0.4.0-beta', '.4.0', undefined, null]) {
      const p = place();
      fakeApp(path.join(p.home, 'Applications'), version, { log: p.log });
      assert.deepEqual(hook(p, summaryPayload()), { code: 0, stdout: '', stderr: TOO_OLD }, String(version));
      assert.deepEqual(started(p), [], String(version));
    }
  });

  test('a 0.4.0 app is started with --hook and the payload on stdin, and its exit code is the script\'s', () => {
    for (const code of [2, 0, 1]) {
      const p = place();
      fakeApp(p.system, '0.4.0', { log: p.log, code });
      const input = summaryPayload();
      assert.deepEqual(hook(p, input), { code, stdout: '', stderr: `0.4.0 --hook: ${input}\n` }, String(code));
      assert.deepEqual(started(p), ['0.4.0 --hook']);
    }
  });

  test('later versions are started too', () => {
    for (const version of ['0.4', '0.4.1', '0.10.0', '1', '1.0.0', '2.3']) {
      const p = place();
      fakeApp(p.system, version, { log: p.log, code: 2 });
      assert.equal(hook(p, summaryPayload()).code, 2, version);
      assert.deepEqual(started(p), [`${version} --hook`], version);
    }
  });

  test('the app is found as before: /Applications first, else ~/Applications', () => {
    const both = place();
    fakeApp(both.system, '0.4.0', { log: both.log });
    fakeApp(path.join(both.home, 'Applications'), '0.4.1', { log: both.log });
    hook(both, summaryPayload());
    assert.deepEqual(started(both), ['0.4.0 --hook']);

    const homeOnly = place();
    fakeApp(path.join(homeOnly.home, 'Applications'), '0.4.1', { log: homeOnly.log });
    hook(homeOnly, summaryPayload());
    assert.deepEqual(started(homeOnly), ['0.4.1 --hook']);

    // An old app in /Applications is the one found, and is not started.
    const old = place();
    fakeApp(old.system, '0.3.3', { log: old.log });
    fakeApp(path.join(old.home, 'Applications'), '0.4.0', { log: old.log });
    assert.equal(hook(old, summaryPayload()).stderr, TOO_OLD);
    assert.deepEqual(started(old), []);
  });

  test('with the real app (0.4.0): a summary with a malformed ID comes back to Claude with exit 2', () => {
    buildApp();
    const p = place();
    const contents = path.join(p.system, APP, 'Contents');
    fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
    fs.writeFileSync(path.join(contents, 'Info.plist'), plist('0.4.0'));
    fs.symlinkSync(APP_BIN, path.join(contents, 'MacOS', 'chief-of-staff'));
    const ws = path.join(p.dir, 'ws');
    fs.cpSync(SAMPLE, ws, { recursive: true });
    const file = path.join(ws, 'meeting-notes', SUMMARY);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('\n| A-260915-1 |', '\n| A-2609-1 |'));
    const before = snapshot(ws);
    assert.deepEqual(hook(p, payload('Write', file, ws)), {
      code: 2,
      stdout: '',
      stderr: `Chief of Staff for Managers could not read 1 thing in ${SUMMARY}:\n${SUMMARY}: ID "A-2609-1" is not in the form A-YYMMDD-n\nFix these in the summary and save it again.\n`,
    });
    assert.deepEqual(hook(p, payload('Edit', path.join(SAMPLE, 'meeting-notes', SUMMARY), SAMPLE)), { code: 0, stdout: '', stderr: '' });
    assert.deepEqual(snapshot(ws), before);
  });

  test('writes nothing: its folders, home, temp folder and working folder are unchanged after every kind of run', () => {
    const cases = [[null, summaryPayload()], ['0.3.3', summaryPayload()], ['0.4.0', summaryPayload()], ['0.4.0', payload('Write', path.join(SAMPLE, 'people.md'), SAMPLE)]];
    for (const [version, input] of cases) {
      const p = place();
      if (version) fakeApp(p.system, version, { log: p.log });
      const watched = ['system', 'home', 'cwd', 'tmp'].map((d) => path.join(p.dir, d));
      const before = watched.map(snapshot);
      const script = snapshot(path.dirname(p.copy));
      hook(p, input);
      assert.deepEqual(watched.map(snapshot), before, String(version));
      const after = snapshot(path.dirname(p.copy));
      // Only the stand-in app's own log, when it was started.
      assert.deepEqual(Object.keys(after).filter((k) => after[k] !== script[k]), version === '0.4.0' && input.includes('/meeting-notes/') ? ['log'] : [], String(version));
    }
  });
});
