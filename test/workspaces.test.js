// 0.2.0 step 1: the sample ships a transcript for the coach to review, and the starter workspace is a clean
// folder for a manager starting their own: the sample's coach and agents made general, the library's
// placeholder notes, an empty corrections log, and empty folders, with nothing from the sample's people or company. The app opens the
// starter as it is, with nothing it could not read.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { SITE_DIR, startSite } from './helpers/site.js';

const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');
const TRANSCRIPT = 'Riley 1-1 - 20260929.txt';
const SAMPLE_NAMES = ['Kevin', 'Harborline', 'SRE', 'Riley', 'Praveen', 'Sam', 'Dana'];

// Every file under a folder, as paths relative to it.
function filesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.push(path.relative(dir, abs).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
// Wrapped lines read as one: a rule's words matter, not where its lines break.
const flat = (text) => text.replace(/\s+/g, ' ');

const DATES_RULE = flat(`- Name the saved summary: the date as YYYY-MM-DD, an underscore, then the
  transcript's name without its extension, any date in it, or the dashes and
  spaces left around that date, with the remaining spaces as underscores, ending in .md.`);

const SETUP = `## Setting up this workspace
This section is for the first run only. When the manager types "Set up my workspace":
1. Ask one question at a time: their full name and the name they go by, their role,
   their company, and the people they meet with: each person's full name, role,
   relationship to the manager (report, manager, peer or other), and any other name they
   are called.
2. Write people.md from the answers: the header row, the manager's own row marked "me",
   then one row per person, with names spelled exactly as given.
3. In this file and in every agent in .claude/agents/, replace "the manager" with the
   manager's first name where it names them, keeping the grammar right. Put the company
   name in templates/meeting-summary-template.md in place of <Company>.
4. Offer to start a goals file in goals/ for each report. Write only what the manager
   tells you.
5. List every file you changed and what changed in each. Then delete this "Setting up
   this workspace" section from this file.
Never invent people, roles or goals. If the manager skips a question, leave that part as
it is.
`;

describe('the sample transcript', () => {
  test('the sample has the Riley 1:1 transcript, its header written day first', () => {
    const text = read(SAMPLE, `transcripts/${TRANSCRIPT}`);
    assert.equal(text.split('\n')[0], 'Kevin / Riley 1:1 · 29 September 2026, 2:03pm');
    assert.equal(text.split('\n')[1], 'Fictional sample for a public YouTube video. Kevin Collins is the only real person. Harborline Cloud and everyone else are invented.');
  });

  test('the sample ships the transcript only, not its summary', () => {
    assert.deepEqual(fs.readdirSync(path.join(SAMPLE, 'meeting-notes')).filter((f) => f.startsWith('2026-09-29')), []);
  });
});

describe('the starter workspace', () => {
  test('names nothing from the sample: no person, no company, no team, in any file or file name, in any case', () => {
    for (const rel of filesIn(STARTER)) {
      for (const name of SAMPLE_NAMES) {
        const word = new RegExp(`\\b${name}\\b`, 'i');
        assert.doesNotMatch(rel, word, `${rel}: file name`);
        assert.doesNotMatch(read(STARTER, rel), word, rel);
      }
    }
  });

  test('has no sample marker, no summaries, and none of the files the app writes but an empty corrections log', () => {
    assert.equal(fs.existsSync(path.join(STARTER, '.sample-workspace')), false);
    assert.deepEqual(fs.readdirSync(path.join(STARTER, 'meeting-notes')).filter((f) => f.endsWith('.md')), []);
    for (const dir of ['actions', 'notes', 'board']) assert.equal(fs.existsSync(path.join(STARTER, dir)), false, dir);
  });

  test('has the corrections log with no entries and no note, written as the app writes it', () => {
    assert.deepEqual(fs.readdirSync(path.join(STARTER, 'corrections')), ['corrections.json']);
    assert.equal(read(STARTER, 'corrections/corrections.json'), '{\n  "entries": []\n}\n');
  });

  test('its empty folders each hold one README.txt, so git keeps them', () => {
    for (const dir of ['transcripts', 'meeting-notes', 'goals']) {
      assert.deepEqual(fs.readdirSync(path.join(STARTER, dir)), ['README.txt'], dir);
    }
  });

  test('people.md has the header row and one row, marked "me"', () => {
    assert.equal(read(STARTER, 'people.md'), '# People\n\n| Name | Role | Relationship | Also called |\n|---|---|---|---|\n| Your name | Your role | me | |\n');
  });

  test('the library is the sample\'s placeholder notes and books.json', () => {
    assert.deepEqual(filesIn(path.join(STARTER, 'library')), filesIn(path.join(SAMPLE, 'library')));
    for (const rel of filesIn(path.join(SAMPLE, 'library'))) assert.equal(read(STARTER, `library/${rel}`), read(SAMPLE, `library/${rel}`), rel);
  });

  test('the template has a <Company> slot and no sample line', () => {
    const template = read(STARTER, 'templates/meeting-summary-template.md');
    assert.match(template, /^\*\*Company:\*\* <Company> \| \*\*Type:\*\*$/m);
    assert.doesNotMatch(template, /fictional|YouTube/i);
  });

  test('the five agents keep the sample\'s rules: only their description lines differ', () => {
    const agents = fs.readdirSync(path.join(SAMPLE, '.claude', 'agents')).sort();
    assert.deepEqual(fs.readdirSync(path.join(STARTER, '.claude', 'agents')).sort(), agents);
    for (const f of agents) {
      const sample = read(SAMPLE, `.claude/agents/${f}`).split('\n');
      const starter = read(STARTER, `.claude/agents/${f}`).split('\n');
      assert.equal(starter.length, sample.length, f);
      const differ = sample.map((line, i) => [line, starter[i]]).filter(([a, b]) => a !== b);
      assert.equal(differ.length, 1, f);
      assert.match(differ[0][1], /^description: .*\bthe manager\b/, f);
    }
  });
});

describe('the coach in both workspaces', () => {
  test('both CLAUDE.md files have the Dates section with the new naming rule', () => {
    for (const dir of [SAMPLE, STARTER]) {
      const claude = read(dir, 'CLAUDE.md');
      const dates = claude.split(/^## Dates$/m)[1]?.split(/^## /m)[0];
      assert.ok(dates, `${dir}: a Dates section`);
      assert.ok(flat(dates).includes(DATES_RULE), dir);
      assert.ok(flat(dates).includes('"Weekly Sync - 20260803.docx" becomes "2026-08-03_Weekly_Sync.md"'), dir);
    }
  });

  test('the starter\'s CLAUDE.md has the setup section, word for word, right after Folder', () => {
    const claude = read(STARTER, 'CLAUDE.md');
    assert.ok(claude.includes(SETUP), 'the setup section as written');
    const heads = [...claude.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(heads[heads.indexOf('Folder') + 1], 'Setting up this workspace');
  });

  test('the starter\'s CLAUDE.md ends with the weekly brief, and keeps the lines the Agents page reads', () => {
    const claude = read(STARTER, 'CLAUDE.md');
    const heads = [...claude.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.equal(heads.at(-1), 'When the manager asks for the weekly brief');
    assert.match(claude, /- Don't save the brief unless the manager asks\.\n$/);
    for (const label of ['Purpose', 'Sources', 'Last reviewed']) assert.match(claude, new RegExp(`^${label}: \\S`, 'm'), label);
  });
});

describe('the app on a copy of the starter', () => {
  let site;
  before(async () => {
    site = await startSite({
      demo: false,
      prepare(root) {
        for (const entry of fs.readdirSync(root)) fs.rmSync(path.join(root, entry), { recursive: true, force: true });
        fs.cpSync(STARTER, root, { recursive: true });
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('answers every page\'s request, with nothing it could not read', async () => {
    const responses = [await site.get('/api/config'), ...(await site.api.everyDefaultResponse())];
    for (const res of responses) assert.ok(res.ok, `${res.status}: ${res.text.slice(0, 200)}`);
    // The page files carry the words "could not read" for showing a problem; the data answers must not.
    const answers = responses.filter((res) => res.json);
    assert.ok(answers.length >= 8, `${answers.length} data answers`);
    for (const res of answers) {
      assert.doesNotMatch(res.text, /could not read/i, res.text.slice(0, 300));
      if ('warnings' in res.json) assert.deepEqual(res.json.warnings, []);
    }
    assert.doesNotMatch(site.output(), /could not read/i);
  });

  test('is not the sample: no demo badge, no meetings, the coach and five agents on the Agents page', async () => {
    assert.equal((await site.api.config()).demo, false);
    assert.deepEqual(await site.api.meetings(), []);
    const { cards } = await site.api.agents();
    assert.deepEqual(cards.map((c) => c.name), ['Coach', 'Blind spot check', 'Commitment tracker', 'Negotiation prep', 'One on one prep', 'Risk radar']);
  });

  test('"Rules learned" shows an empty log, not a missing-file notice, and an entry added there is saved', async () => {
    const page = await openPage(site, '#/agents');
    assert.equal(page.el('corrections-missing').innerHTML, '');
    assert.equal(page.el('corrections-table').hidden, false);
    assert.equal(page.el('corrections-total').textContent, 0);
    assert.equal(page.el('corrections-total-label').textContent, 'corrections logged');
    assert.equal(page.rows('corrections-body').length, 0);
    assert.doesNotMatch(page.html(), /Note in the file/);

    const entry = { date: '2026-10-01', where: 'My first week', what: 'Something went wrong.', caught_by: 'Me', decision: 'Fixed it.', rule: 'Check first.' };
    const form = page.el('correction-form');
    for (const [k, v] of Object.entries(entry)) form[k] = { value: v, focus() {} };
    await form.fire('submit');
    assert.equal(page.el('corrections-status').textContent, 'Entry added.');
    assert.equal(page.el('corrections-total').textContent, 1);
    assert.deepEqual(site.json('corrections/corrections.json'), { entries: [entry] });
  });
});
