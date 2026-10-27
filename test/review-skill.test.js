// 0.4.0, step 2: the check hook and the review-transcript skill. `chief-of-staff --hook` reads a Claude Code
// PostToolUse payload on stdin and checks the summary just saved, as `--check --file` does; each workspace's
// .claude/settings.json runs it after every Edit or Write. The transcript review moved, word for word, from CLAUDE.md to
// .claude/skills/review-transcript/, CLAUDE.md keeps five Standing rules, and the Agents page shows the skill as a card.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { claudeAsInStep1, LAST_STEP, PLACEHOLDER_RULE, SHA_STEP1, SKILL, STANDING_RULES } from './helpers/coach.js';
import { openPage } from './helpers/page.js';
import { SITE_DIR, snapshot, startSite } from './helpers/site.js';

const TARGET_DIR = process.env.CARGO_TARGET_DIR || path.join(SITE_DIR, 'target');
const APP_BIN = path.join(TARGET_DIR, 'debug', 'chief-of-staff');
const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');
const SUMMARY = '2026-09-15_kevin-sam_1on1.md';
// The Write and the Edit payloads Claude Code sent in step 1, with the paths in them made general.
const PAYLOADS = fs.readFileSync(path.join(SITE_DIR, 'test', 'fixtures', 'hook', 'step1-payloads.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

let built = false;
function buildApp() {
  if (built) return;
  const res = spawnSync('cargo', ['build', '--quiet', '-p', 'chief-of-staff-app'], { cwd: SITE_DIR, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`cargo build failed.\n${res.error?.message || ''}${res.stdout}${res.stderr}`);
  built = true;
}

function run(cmd, args, input, { env = process.env, cwd = SITE_DIR } = {}) {
  const res = spawnSync(cmd, args, { input, cwd, env, encoding: 'utf8', timeout: 30000 });
  if (res.error) throw res.error;
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}
const hook = (input, opts) => run(APP_BIN, ['--hook'], input, opts);

// A step 1 payload for this tool, pointed at `file` with `cwd` as the session's folder.
function payload(tool, file, cwd) {
  const p = structuredClone(PAYLOADS.find((x) => x.tool_name === tool));
  p.cwd = cwd;
  p.tool_input.file_path = file;
  p.tool_response.filePath = file;
  return JSON.stringify(p);
}

function scratchCopy(source, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mc-hook-${name}-`));
  fs.cpSync(source, dir, { recursive: true });
  return dir;
}

// The sample with one action item's ID written wrong in one summary.
function withBadId() {
  const dir = scratchCopy(SAMPLE, 'bad-id');
  const file = path.join(dir, 'meeting-notes', SUMMARY);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('\n| A-260915-1 |'));
  fs.writeFileSync(file, text.replace('\n| A-260915-1 |', '\n| A-2609-1 |'));
  return { dir, file };
}
const BAD_ID_MESSAGE = `Chief of Staff for Managers could not read 1 thing in ${SUMMARY}:
${SUMMARY}: ID "A-2609-1" is not in the form A-YYMMDD-n
Fix these in the summary and save it again.
`;

before(buildApp);

describe('--hook', () => {
  test('the step 1 payloads are a Write and an Edit, each with an absolute file_path and a cwd', () => {
    assert.deepEqual(PAYLOADS.map((p) => [p.hook_event_name, p.tool_name]), [['PostToolUse', 'Write'], ['PostToolUse', 'Edit']]);
    for (const p of PAYLOADS) {
      assert.ok(path.isAbsolute(p.tool_input.file_path));
      assert.ok(path.isAbsolute(p.cwd));
    }
  });

  test('the step 1 payloads as sent, for a file outside meeting-notes/: exit 0, nothing said', () => {
    for (const p of PAYLOADS) assert.deepEqual(hook(JSON.stringify(p)), { code: 0, stdout: '', stderr: '' }, p.tool_name);
  });

  test('a summary with nothing wrong, after a Write or an Edit: exit 0, nothing said', () => {
    for (const tool of ['Write', 'Edit']) {
      assert.deepEqual(hook(payload(tool, path.join(SAMPLE, 'meeting-notes', SUMMARY), SAMPLE)), { code: 0, stdout: '', stderr: '' }, tool);
      // From a session started elsewhere: the workspace is the folder that holds meeting-notes/, not cwd.
      assert.deepEqual(hook(payload(tool, path.join(SAMPLE, 'meeting-notes', SUMMARY), os.tmpdir())), { code: 0, stdout: '', stderr: '' }, tool);
    }
  });

  test('other files in the workspace, and a .md not directly in meeting-notes/: exit 0, nothing said', () => {
    for (const rel of ['CLAUDE.md', 'people.md', SKILL, '.claude/skills/review-transcript/example.md', 'templates/meeting-summary-template.md',
      'meeting-notes/README.txt', 'meeting-notes/old/2026-09-15_x.md', 'shared/2026-09-15_kevin-sam_1on1.md', 'actions/ledger.json']) {
      for (const tool of ['Write', 'Edit']) assert.deepEqual(hook(payload(tool, path.join(SAMPLE, rel), SAMPLE)), { code: 0, stdout: '', stderr: '' }, rel);
    }
  });

  test('a summary with something that could not be read: exit 2, and the message for Claude on stderr', () => {
    const { dir, file } = withBadId();
    for (const tool of ['Write', 'Edit']) assert.deepEqual(hook(payload(tool, file, dir)), { code: 2, stdout: '', stderr: BAD_ID_MESSAGE }, tool);
    // The same lines as the check for that summary.
    const checked = run(APP_BIN, ['--check', dir, '--file', file], '');
    assert.equal(checked.code, 1);
    assert.deepEqual(checked.stdout.trimEnd().split('\n').slice(1), BAD_ID_MESSAGE.trimEnd().split('\n').slice(1, -1));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('several things: counted, one line each, grouped as the check groups them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-hook-several-'));
    fs.mkdirSync(path.join(dir, 'meeting-notes'));
    const file = path.join(dir, 'meeting-notes', '2026-10-02_b.md');
    fs.writeFileSync(file, '# B\n');
    const out = hook(payload('Write', file, dir));
    const checked = run(APP_BIN, ['--check', dir, '--file', 'meeting-notes/2026-10-02_b.md'], '');
    const lines = checked.stdout.trimEnd().split('\n').slice(1);
    assert.ok(lines.length > 1);
    assert.deepEqual(out, {
      code: 2,
      stdout: '',
      stderr: `Chief of Staff for Managers could not read ${lines.length} things in 2026-10-02_b.md:\n${lines.join('\n')}\nFix these in the summary and save it again.\n`,
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('input it cannot read, or a summary it cannot open: exit 0, one line on stderr', () => {
    for (const input of ['', 'not json', '{"tool_input":', '[]', '{}', '{"tool_input":{"file_path":null}}',
      payload('Write', path.join(SAMPLE, 'meeting-notes', '2026-09-16_nobody.md'), SAMPLE),
      payload('Write', '/nowhere/at/all/meeting-notes/2026-09-15_x.md', SAMPLE)]) {
      const out = hook(input);
      assert.equal(out.code, 0, input);
      assert.equal(out.stdout, '');
      assert.equal(out.stderr.split('\n').filter(Boolean).length, 1, `${input}: ${out.stderr}`);
      assert.ok(out.stderr.endsWith('\n'));
    }
  });

  test('writes nothing anywhere: the workspace stays byte-identical, and a fresh home, temp folder and working folder stay empty', () => {
    const settings = path.join(os.homedir(), 'Library', 'Application Support', 'com.practicalaishift.chiefofstaff', 'settings.json');
    const state = (p) => (fs.existsSync(p) ? { bytes: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs } : null);
    const { dir, file } = withBadId();
    const dirs = ['home', 'tmp', 'cwd'].map((d) => fs.mkdtempSync(path.join(os.tmpdir(), `mc-hook-${d}-`)));
    const [home, tmp, cwd] = dirs;
    const env = { PATH: process.env.PATH, HOME: home, TMPDIR: tmp + path.sep };
    const before = snapshot(dir);
    const beforeSettings = state(settings);
    for (const input of [payload('Write', file, dir), payload('Edit', file, dir), payload('Write', path.join(dir, 'meeting-notes', '2026-09-08_kevin-praveen_1on1.md'), dir),
      payload('Edit', path.join(dir, 'people.md'), dir), 'not json']) {
      hook(input, { env, cwd });
      hook(input);
    }
    assert.deepEqual(snapshot(dir), before);
    for (const d of dirs) assert.deepEqual(fs.readdirSync(d), [], d);
    assert.deepEqual(state(settings), beforeSettings);
    for (const d of [dir, ...dirs]) fs.rmSync(d, { recursive: true, force: true });
  });
});

// The hook in .claude/settings.json, and the script it runs, are tested in hook-script.test.js (0.4.0 step 3).

describe('the review-transcript skill in both workspaces', () => {
  for (const [name, dir, manager] of [['sample', SAMPLE, 'Kevin'], ['starter', STARTER, 'the manager']]) {
    const skill = read(dir, SKILL);

    test(`${name}: name and a description that asks for it in plain words and as /review-transcript`, () => {
      const fm = skill.match(/^---\n([^]*?)\n---\n/)[1];
      assert.match(fm, /^name: review-transcript$/m);
      const description = fm.match(/^description: (.+)$/m)[1];
      assert.match(description, new RegExp(`Use whenever ${manager} asks you to review, summarise or write up a transcript`));
      assert.match(description, /\/review-transcript/);
    });

    test(`${name}: Purpose, Sources and Last reviewed lines, and the template and example it points to`, () => {
      for (const label of ['Purpose', 'Sources', 'Last reviewed']) assert.match(skill, new RegExp(`^${label}: \\S`, 'm'), label);
      // 0.4.1 moved it from 2026-10-18 with the lines below.
      assert.match(skill, /^Last reviewed: 2026-10-22$/m);
      assert.ok(skill.includes('The summary format is templates/meeting-summary-template.md. example.md, next to this file, is one complete\nsummary to copy the shape of.'));
      // 0.4.1: with no transcript named (as "Run in Claude Code" on the Agents page starts it), it lists the ones not yet
      // reviewed and asks. Before the steps, so they and the sections moved from CLAUDE.md are as they were.
      assert.ok(skill.includes(`summary to copy the shape of.\n\nIf ${manager} doesn't name a transcript, list the files in transcripts/ that have no summary in meeting-notes/ yet\n(a summary is named after its transcript, as under Dates), and ask which one to review.\n\n## When ${manager} asks you to review a transcript\n`));
      assert.ok(fs.existsSync(path.join(dir, 'templates', 'meeting-summary-template.md')));
      assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'review-transcript', 'example.md')));
      assert.deepEqual(fs.readdirSync(path.join(dir, '.claude', 'skills')), ['review-transcript']);
      assert.deepEqual(fs.readdirSync(path.join(dir, '.claude', 'skills', 'review-transcript')).sort(), ['SKILL.md', 'example.md']);
    });

    test(`${name}: the review steps are the first numbered list, ending with the app's check; then Dates and Action items`, () => {
      const heads = [...skill.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      assert.deepEqual(heads, [`When ${manager} asks you to review a transcript`, 'Dates', 'Action items']);
      const steps = skill.split(/^## /m)[1];
      assert.deepEqual([...steps.matchAll(/^(\d+)\. /gm)].map((m) => m[1]), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
      assert.ok(steps.endsWith(`${LAST_STEP}\n`));
      assert.equal(skill.indexOf('\n1. '), skill.indexOf(`## When ${manager} asks you to review a transcript\n1. `) + `## When ${manager} asks you to review a transcript`.length);
    });

    test(`${name}: Action items has the same-day letter, shared copies and no placeholder rows`, () => {
      const actions = skill.split(/^## Action items\n/m)[1];
      assert.ok(actions.includes('add the next\n  letter after the date: A-YYMMDDb-n'));
      assert.ok(actions.includes(PLACEHOLDER_RULE));
      assert.ok(actions.endsWith('Every file in meeting-notes/ is read as its own meeting.\n'));
    });

    test(`${name}: put back into CLAUDE.md, the moved sections give step 1's CLAUDE.md byte for byte`, () => {
      assert.equal(sha(claudeAsInStep1(dir)), SHA_STEP1[name]);
    });

    test(`${name}: CLAUDE.md keeps its sections, adds the Standing rules, and no longer has the review, Dates or Action items`, () => {
      const claude = read(dir, 'CLAUDE.md');
      const heads = [...claude.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      const setup = name === 'starter' ? ['Setting up this workspace'] : [];
      const own = name === 'starter' ? 'their' : 'his';
      assert.deepEqual(heads, ['Standing rules', 'Folder', ...setup, 'Notes between meetings', `When ${manager} asks for one of ${own} agents`, `When ${manager} asks for the weekly brief`]);
      assert.ok(claude.includes(`\nLast reviewed: 2026-10-18\n\n${STANDING_RULES}## Folder\n`));
      assert.match(claude, /^Sources: transcripts\/, goals\/, meeting-notes\/, templates\/, \.claude\/skills\/, library\//m);
      for (const gone of ['Never change or reuse an ID', 'Name the saved summary', 'Flip Cards']) assert.equal(claude.includes(gone), false, gone);
    });
  }

  test('the sample\'s example is a copy of the Sep 15 summary', () => {
    assert.equal(read(SAMPLE, '.claude/skills/review-transcript/example.md'), read(SAMPLE, `meeting-notes/${SUMMARY}`));
  });

  test('the starter\'s example says so at the top, and reads with nothing that could not be read', () => {
    const example = read(STARTER, '.claude/skills/review-transcript/example.md');
    assert.match(example.split('\n')[0], /^> \*\*Example only\.\*\* A made-up meeting/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-hook-example-'));
    fs.mkdirSync(path.join(dir, 'meeting-notes'));
    fs.writeFileSync(path.join(dir, 'people.md'), '# People\n\n| Name | Role | Relationship | Also called |\n|---|---|---|---|\n| Alex Morgan | Engineering Manager | me | Alex |\n| Jordan Lee | Software Engineer | report | Jordan |\n');
    fs.writeFileSync(path.join(dir, 'meeting-notes', '2026-03-02_alex-jordan_1on1.md'), example);
    assert.deepEqual(run(APP_BIN, ['--check', dir], ''), { code: 0, stdout: 'Nothing could not be read\n', stderr: '' });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the skill on the Agents page', () => {
  let site;
  before(async () => { site = await startSite(); });
  after(async () => { await site?.stop(); });

  test('a card like an agent\'s: name, Purpose, Sources, Last reviewed and the review steps as Rules', async () => {
    const { cards, skillsFolder } = await site.api.agents();
    assert.equal(skillsFolder, '.claude/skills');
    const card = cards.at(-1);
    assert.equal(card.role, 'skill');
    assert.equal(card.file, SKILL);
    assert.equal(card.name, 'Review transcript');
    assert.equal(card.command, '/review-transcript');
    assert.equal(card.purposeHtml, 'review one meeting transcript, save its summary in meeting-notes/, and coach Kevin on the meeting.');
    assert.match(card.sourcesHtml, /^transcripts\/, goals\//);
    assert.equal(card.lastReviewed, '2026-10-22');
    assert.equal(card.rulesHtml.length, 9);
    assert.equal(card.rulesHtml.at(-1), 'The app checks the summary when you save it. If it reports anything, fix it and save again.');
    assert.deepEqual(card.warnings, []);
  });

  test('the page labels it "Skill · /review-transcript", with its rules closed like the others', async () => {
    const html = (await openPage(site, '#/agents')).html();
    const card = html.split(/<article class="agent-card\b/).slice(1).map((c) => c.split('</article>')[0]).at(-1);
    assert.match(card, /<h3 class="agent-name">Review transcript<\/h3>/);
    assert.match(card, /<p class="agent-kind">Skill · \/review-transcript<\/p>/);
    assert.match(card, /<code>\.claude\/skills\/review-transcript\/SKILL\.md<\/code>/);
    assert.match(card, /<summary>Rules \(9\)<\/summary>/);
    assert.match(html, /From <code>CLAUDE\.md<\/code>, <code>\.claude\/agents\/<\/code> and <code>\.claude\/skills\/<\/code>\./);
  });

  test('the Library\'s readers are still the coach and the five agents', async () => {
    assert.deepEqual((await site.api.library()).agents, ['Coach', 'Blind spot check', 'Commitment tracker', 'Negotiation prep', 'One on one prep', 'Risk radar']);
  });
});

describe('the skill card\'s fields', () => {
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const dir = path.join(root, '.claude', 'skills', 'old-skill');
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: old-skill\ndescription: Does an old thing.\n---\n\nSources: people.md\nLast reviewed: 2026-08-01\n\n1. One rule.\n');
        // A folder with no SKILL.md is not a skill.
        fs.mkdirSync(path.join(root, '.claude', 'skills', 'not-a-skill'));
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('with no Purpose line, the description is shown; "Review due" after 30 days; skills in name order', async () => {
    const { cards, warnings } = await site.api.agents();
    const skills = cards.filter((c) => c.role === 'skill');
    assert.deepEqual(skills.map((c) => c.name), ['Old skill', 'Review transcript']);
    assert.equal(skills[0].purposeHtml, 'Does an old thing.');
    assert.equal(skills[0].reviewDue, true);
    assert.equal(skills[0].command, '/old-skill');
    assert.deepEqual(warnings, []);
  });
});

describe('the sample\'s answers from every API are step 1\'s, but the Agents page\'s', () => {
  // Step 1's sample: its CLAUDE.md, and no skills folder or settings.json.
  const asStep1 = (root) => {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeAsInStep1(SAMPLE));
    fs.rmSync(path.join(root, '.claude', 'skills'), { recursive: true });
    fs.rmSync(path.join(root, '.claude', 'settings.json'));
  };
  async function everyAnswer(site) {
    const paths = ['/api/config', '/api/today', '/api/today?week=this', '/api/today?week=last', '/api/meetings', '/api/board',
      '/api/library', '/api/corrections', '/api/agents', '/api/people', '/api/people?private=1', '/api/help'];
    for (const m of (await site.get('/api/meetings')).json.meetings) {
      paths.push(`/api/meeting?file=${encodeURIComponent(m.file)}`, `/api/meeting?file=${encodeURIComponent(m.file)}&private=1`);
    }
    for (const p of (await site.get('/api/people')).json.groups.flatMap((g) => g.people)) {
      paths.push(`/api/people/${encodeURIComponent(p.name)}`, `/api/people/${encodeURIComponent(p.name)}?private=1`);
    }
    for (const f of fs.readdirSync(path.join(site.root, 'library')).filter((x) => x.endsWith('.md')).sort()) paths.push(`/api/library/notes?file=${encodeURIComponent(f)}`);
    const root = path.basename(site.root);
    const out = {};
    for (const p of paths) {
      const res = await site.get(p);
      out[p] = `${res.status} ${res.text.split(root).join('<root>')}`;
    }
    return out;
  }
  let now;
  let step1;
  before(async () => {
    const sites = [await startSite(), await startSite({ prepare: asStep1 })];
    try {
      [now, step1] = await Promise.all(sites.map(everyAnswer));
    } finally {
      await Promise.all(sites.map((s) => s.stop()));
    }
  });

  test('every answer but /api/agents is byte-identical', () => {
    assert.deepEqual(Object.keys(now), Object.keys(step1));
    assert.ok(Object.keys(now).length > 30);
    for (const p of Object.keys(now).filter((x) => x !== '/api/agents')) assert.equal(now[p], step1[p], p);
  });

  test('on the Agents page, only the coach\'s card differs, and the skill\'s card is added after the agents', () => {
    const a = JSON.parse(now['/api/agents'].slice(4));
    const b = JSON.parse(step1['/api/agents'].slice(4));
    assert.equal(a.cards.length, b.cards.length + 1);
    assert.equal(a.cards.at(-1).role, 'skill');
    assert.notDeepEqual(a.cards[0], b.cards[0]);
    assert.deepEqual(a.cards.slice(1, -1), b.cards.slice(1));
    assert.deepEqual({ ...a, cards: null }, { ...b, cards: null });
  });
});
