// 0.4.0, step 1: the app's check mode, `chief-of-staff --check <folder> [--file meeting-notes/<name>.md] [--json]`.
// It reports exactly what the Meetings page lists as could not be read (the same messages, groups and total, from the
// same core code), exits 0, 1 or 2, and writes nothing anywhere. These tests run the app's debug binary and compare its
// answer with /api/meetings from the test server for the same folder.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { SITE_DIR, snapshot, startSite } from './helpers/site.js';

const TARGET_DIR = process.env.CARGO_TARGET_DIR || path.join(SITE_DIR, 'target');
const APP_BIN = path.join(TARGET_DIR, 'debug', 'chief-of-staff');
const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');
// The ways October's summaries were written that the app reports: an ID used by two meetings on the same day, an ID
// not in the form A-YYMMDD-n, a "Status now" word it doesn't accept, a row with a cell missing, and a shared copy
// with no header fields.
const OCTOBER = path.join(SITE_DIR, 'test', 'fixtures', 'october-variants');

let built = false;
function buildApp() {
  if (built) return;
  const res = spawnSync('cargo', ['build', '--quiet', '-p', 'chief-of-staff-app'], { cwd: SITE_DIR, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`cargo build failed.\n${res.error?.message || ''}${res.stdout}${res.stderr}`);
  built = true;
}

// Runs the check. `env` and `cwd` are given in full when set, so a test can see where it might write.
function check(args, { env = process.env, cwd = SITE_DIR } = {}) {
  const res = spawnSync(APP_BIN, args, { cwd, env, encoding: 'utf8', timeout: 30000 });
  if (res.error) throw res.error;
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

// The check's text, as the page's groups give it.
function textFor(total, groups) {
  const first = total === 0 ? 'Nothing could not be read' : `${total} thing${total === 1 ? '' : 's'} could not be read`;
  return [first, ...groups.flatMap((g) => g.warnings.map((w) => `${w.file}: ${w.message}`))].join('\n') + '\n';
}

// The grouping Meetings showed before 0.4.0 moved it into the core: by kind (or the message, when there is none), most
// first, kinds with the same count in the order first found. Kept here as a second opinion on the core's groups.
function groupLikeThePage(warnings) {
  const groups = new Map();
  for (const w of warnings) {
    const kind = w.kind || w.message;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push({ file: w.file, message: w.message });
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length).map(([kind, ws]) => ({ kind, count: ws.length, warnings: ws }));
}

// A test server whose data folder is `source` as it is, in place of the sample.
const startOn = (source) => startSite({
  demo: false,
  prepare(root) {
    for (const name of fs.readdirSync(root)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
    fs.cpSync(source, root, { recursive: true });
  },
});

before(buildApp);

for (const [name, source, expected] of [['the sample', SAMPLE, 0], ['the starter', STARTER, 0], ['the October variants', OCTOBER, 7]]) {
  describe(`${name}: the check says what Meetings says`, () => {
    let site;
    let data;
    before(async () => {
      site = await startOn(source);
      data = (await site.get('/api/meetings')).json;
    });
    after(async () => { await site?.stop(); });

    test(`${expected} things could not be read, on Meetings and in the check`, () => {
      assert.equal(data.warnings.length, expected, JSON.stringify(data.warnings, null, 2));
    });

    test('JSON: the same total, the same groups in the same order, the same messages', () => {
      const out = check(['--check', site.root, '--json']);
      assert.equal(out.code, expected ? 1 : 0, out.stderr);
      assert.equal(out.stderr, '');
      const json = JSON.parse(out.stdout);
      assert.deepEqual(Object.keys(json), ['total', 'groups']);
      assert.equal(json.total, data.warnings.length);
      assert.deepEqual(json.groups, data.warningGroups);
      assert.deepEqual(json.groups, groupLikeThePage(data.warnings));
      assert.equal(json.groups.reduce((t, g) => t + g.count, 0), json.total);
    });

    test('text: the count, then one line per warning, grouped by kind, most first', () => {
      const out = check(['--check', site.root]);
      assert.equal(out.code, expected ? 1 : 0, out.stderr);
      assert.equal(out.stderr, '');
      assert.equal(out.stdout, textFor(data.warnings.length, groupLikeThePage(data.warnings)));
      assert.deepEqual(out.stdout.trimEnd().split('\n').slice(1).sort(), data.warnings.map((w) => `${w.file}: ${w.message}`).sort());
    });

    test('Today\'s foot counts the same total', async () => {
      const today = (await site.get('/api/today')).json;
      if (today.foot) assert.equal(today.foot.couldNotRead, JSON.parse(check(['--check', site.root, '--json']).stdout).total);
    });
  });
}

describe('the October variants, one summary at a time', () => {
  let site;
  let data;
  before(async () => {
    site = await startOn(OCTOBER);
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  test('each variant is reported', () => {
    const messages = data.warnings.map((w) => `${w.file}: ${w.message}`);
    for (const want of [
      /^2026-10-12_kevin-sam_1on1\.md: ID A-261012-1 is used more than once in this workspace$/,
      /^2026-10-12_kevin-riley_1on1\.md: ID A-261012-1 is used more than once in this workspace$/,
      /^2026-10-12_kevin-sam_1on1\.md: ID "A-2610-3" is not in the form A-YYMMDD-n$/,
      /^2026-10-14_kevin-praveen_1on1\.md: A-261012-2: "Status now" starts with none of /,
      /^2026-10-12_kevin-sam_1on1\.md: "Action Items" row could not read: \| A-261012-4 /,
      /^2026-10-15_kevin-sam_shared-copy\.md: attendees could not read$/,
      /^2026-10-15_kevin-sam_shared-copy\.md: meeting type could not read$/,
    ]) assert.ok(messages.some((m) => want.test(m)), `${want}\n${messages.join('\n')}`);
  });

  test('--file reports only the warnings whose file is that summary', () => {
    for (const m of data.meetings) {
      const own = data.warnings.filter((w) => w.file === m.file);
      assert.ok(own.length > 0, m.file);
      const json = check(['--check', site.root, '--file', `meeting-notes/${m.file}`, '--json']);
      assert.equal(json.code, 1, json.stderr);
      const parsed = JSON.parse(json.stdout);
      assert.equal(parsed.total, own.length, m.file);
      assert.deepEqual(parsed.groups, groupLikeThePage(own), m.file);
      const text = check(['--check', site.root, '--file', `meeting-notes/${m.file}`]);
      assert.equal(text.code, 1);
      assert.equal(text.stdout, textFor(own.length, groupLikeThePage(own)), m.file);
    }
  });

  test('--file for a summary with nothing wrong exits 0', () => {
    const file = fs.readdirSync(path.join(SAMPLE, 'meeting-notes'))[0];
    const out = check(['--check', SAMPLE, '--file', `meeting-notes/${file}`]);
    assert.deepEqual(out, { code: 0, stdout: 'Nothing could not be read\n', stderr: '' });
  });
});

describe('what the check refuses', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-check-refuse-'));
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  for (const [why, args] of [
    ['a missing folder', ['--check', path.join(tmp, 'missing')]],
    ['a folder that is not a workspace', ['--check', tmp]],
    ['a file instead of a folder', ['--check', path.join(OCTOBER, 'people.md')]],
    ['a summary that is not there', ['--check', OCTOBER, '--file', 'meeting-notes/2026-10-13_nobody.md']],
    ['a --file outside meeting-notes/', ['--check', OCTOBER, '--file', 'people.md']],
    ['an argument it does not know', ['--check', OCTOBER, '--quiet']],
    ['no folder', ['--check']],
  ]) {
    test(`${why}: exit 2, one line on stderr, nothing on stdout`, () => {
      const out = check(args);
      assert.equal(out.code, 2, out.stdout + out.stderr);
      assert.equal(out.stdout, '');
      assert.equal(out.stderr.split('\n').filter(Boolean).length, 1, out.stderr);
      assert.ok(out.stderr.endsWith('\n'));
    });
  }
});

describe('the check writes nothing anywhere', () => {
  const settings = path.join(os.homedir(), 'Library', 'Application Support', 'com.practicalaishift.chiefofstaff', 'settings.json');
  const state = (p) => (fs.existsSync(p) ? { bytes: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs } : null);

  for (const [name, source] of [['the sample', SAMPLE], ['the starter', STARTER], ['the October variants', OCTOBER]]) {
    test(`${name}: the folder stays byte-identical, and a fresh home, temp folder and working folder stay empty`, () => {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-check-ws-'));
      fs.cpSync(source, work, { recursive: true });
      const dirs = ['home', 'tmp', 'cwd'].map((d) => fs.mkdtempSync(path.join(os.tmpdir(), `mc-check-${d}-`)));
      const [home, tmp, cwd] = dirs;
      const before = snapshot(work);
      const beforeSettings = state(settings);
      const env = { PATH: process.env.PATH, HOME: home, TMPDIR: tmp + path.sep };
      for (const args of [[], ['--json'], ['--file', `meeting-notes/${fs.readdirSync(path.join(work, 'meeting-notes')).find((f) => f.endsWith('.md')) ?? 'none.md'}`]]) {
        check(['--check', work, ...args], { env, cwd });
        // Also with the real home: the app's settings file is left as it was.
        check(['--check', work, ...args]);
      }
      assert.deepEqual(snapshot(work), before);
      for (const d of dirs) assert.deepEqual(fs.readdirSync(d), [], d);
      assert.deepEqual(state(settings), beforeSettings);
      for (const d of [work, ...dirs]) fs.rmSync(d, { recursive: true, force: true });
    });
  }
});
