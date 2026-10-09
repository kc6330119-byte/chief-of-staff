// 0.3.0 step 1: the briefing's data on /api/today (?week=this|last), worked out by the core from the Board, the people
// facts and the summaries' "Other Insights". The sample ships a small ledger made by the app's own Close, so the key
// below is the sample as a person opens it, as of its newest meeting, Tue 2026-09-22. Opening Today writes nothing,
// and no note between meetings and no Manager-only note appears in the briefing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { changedFiles, LEDGER, privateNoteTexts, SITE_DIR, snapshot, startSite } from './helpers/site.js';

const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');
const DANA = '2026-09-22_dana-kevin_1on1.md';
const SAM = '2026-09-15_kevin-sam_1on1.md';

// The tests copy the sample without its ledger; these put the shipped one back.
const withShippedLedger = (root) => {
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.copyFileSync(path.join(SAMPLE, LEDGER), path.join(root, LEDGER));
};

const briefing = async (site, week) => {
  const res = await site.get(`/api/today${week ? `?week=${week}` : ''}`);
  assert.equal(res.status, 200, res.text.slice(0, 300));
  return res.json.briefing;
};

describe("the sample's ledger", () => {
  test('holds exactly the four closes, as the app writes them', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(SAMPLE, LEDGER), 'utf8'));
    assert.deepEqual(ledger, {
      version: 1,
      items: {
        'A-260728-4': { column: 'done', closed: '2026-09-16' },
        'A-260910-4': { column: 'done', closed: '2026-09-16' },
        'A-260728-1': { column: 'done', closed: '2026-09-22' },
        'A-260908-5': { column: 'done', closed: '2026-09-22' },
      },
      order: { done: ['A-260908-5', 'A-260728-1', 'A-260910-4', 'A-260728-4'] },
    });
  });

  test("Today's counts are 5 I owe, 5 owed to me, 1 to confirm", async () => {
    const site = await startSite({ prepare: withShippedLedger });
    try {
      assert.deepEqual((await site.api.today()).counts, { iOwe: 5, owedToMe: 5, open: 0, confirm: 1, total: 11 });
    } finally {
      await site.stop();
    }
  });
});

describe('the briefing on the sample, as of Tue 2026-09-22', () => {
  let site;
  let thisWeek;
  let lastWeek;
  before(async () => {
    site = await startSite({ prepare: withShippedLedger });
    thisWeek = await briefing(site);
    lastWeek = await briefing(site, 'last');
  });
  after(async () => { await site?.stop(); });

  test('this week is the default, Monday Sep 21 to Sunday Sep 27, counted to the as-of date', async () => {
    assert.deepEqual(await briefing(site, 'this'), thisWeek);
    assert.equal(thisWeek.week, 'this');
    assert.deepEqual([thisWeek.weekStart, thisWeek.weekEnd, thisWeek.countedTo], ['2026-09-21', '2026-09-27', '2026-09-22']);
  });

  test('tiles', () => {
    assert.deepEqual(thisWeek.tiles, {
      dueToday: 0,
      overdue: { count: 4, overThirtyDays: 3 },
      dueThisWeek: { count: 0, through: '2026-09-25', next: { date: '2026-09-29', count: 3 } },
      completed: { count: 2, otherWeek: 2 },
      teamAlerts: { count: 0, names: [] },
    });
  });

  test('team health', () => {
    assert.deepEqual(thisWeek.teamHealth, {
      heavyLoads: { count: 0, names: [] },
      overdueOwedToYou: {
        count: 1,
        items: [{ id: 'A-260505-3', title: 'Take Friday afternoon off', owner: 'Sam Torres', due: '2026-05-08', daysPastDue: 137 }],
      },
      missedOneOnOne: { count: 0, names: [], longestGap: { name: 'Praveen Iyer', days: 14 } },
      awaitingInput: 1,
    });
  });

  test('numbers', () => {
    assert.deepEqual(thisWeek.numbers, { closed: 2, closedOnTime: '0 of 1', yourOverdue: 3, coverage: '3 of 3' });
  });

  test('reflections: four went well and four could do better, all from the Sep 22 summary, words as written', () => {
    const kinds = (k) => thisWeek.reflections.filter((r) => r.kind === k);
    assert.equal(kinds('went-well').length, 4);
    assert.equal(kinds('could-do-better').length, 4);
    assert.equal(thisWeek.reflections.length, 8);
    for (const r of thisWeek.reflections) assert.deepEqual([r.file, r.date], [DANA, '2026-09-22']);
    assert.equal(kinds('went-well')[0].headline, 'wins before asks, and the asks were earned by the wins.');
    assert.equal(kinds('could-do-better')[0].headline, 'the headcount question needed a question back.');
    // The full text is the item after its label, its words unchanged.
    const source = fs.readFileSync(path.join(SAMPLE, 'meeting-notes', DANA), 'utf8');
    assert.equal(kinds('went-well')[0].text, 'wins before asks, and the asks were earned by the wins. Kevin said "three wins and two asks," got Dana\'s okay to start with wins, and let the numbers make the case. Dana\'s "Given the numbers you just gave me, that\'s an easy yes" shows it worked.');
    for (const r of thisWeek.reflections) {
      assert.ok(r.text.startsWith(r.headline), r.headline);
      assert.ok(source.includes(r.headline), r.headline);
    }
  });

  test('activity: the six weeks ending with this one', () => {
    assert.deepEqual(thisWeek.activity, [
      { weekStart: '2026-08-17', created: 0, completed: 0, overdue: 3 },
      { weekStart: '2026-08-24', created: 0, completed: 0, overdue: 3 },
      { weekStart: '2026-08-31', created: 0, completed: 0, overdue: 3 },
      { weekStart: '2026-09-07', created: 9, completed: 0, overdue: 3 },
      { weekStart: '2026-09-14', created: 5, completed: 2, overdue: 5 },
      { weekStart: '2026-09-21', created: 4, completed: 2, overdue: 4 },
    ]);
  });

  test('last week: Sep 14 to 20; completed, on time and the reflections follow the week, the rest stays as of the as-of date', () => {
    assert.equal(lastWeek.week, 'last');
    assert.deepEqual([lastWeek.weekStart, lastWeek.weekEnd, lastWeek.countedTo], ['2026-09-14', '2026-09-20', '2026-09-20']);
    assert.deepEqual(lastWeek.tiles.completed, { count: 2, otherWeek: 2 });
    assert.deepEqual(lastWeek.numbers, { closed: 2, closedOnTime: '1 of 1', yourOverdue: 3, coverage: '3 of 3' });
    assert.ok(lastWeek.reflections.length > 0);
    for (const r of lastWeek.reflections) assert.deepEqual([r.file, r.date], [SAM, '2026-09-15']);
    const { completed: _a, ...tiles } = thisWeek.tiles;
    const { completed: _b, ...lastTiles } = lastWeek.tiles;
    assert.deepEqual(lastTiles, tiles);
    assert.deepEqual(lastWeek.teamHealth, thisWeek.teamHealth);
    assert.deepEqual(lastWeek.activity, thisWeek.activity);
  });

  test('a week that is neither this nor last is refused', async () => {
    const res = await site.get('/api/today?week=next');
    assert.equal(res.status, 400);
    assert.match(res.json.error, /week=this or week=last/);
  });
});

describe('the briefing leaves out private text and writes nothing', () => {
  const SECRET = 'Quillfeather';
  const NOTE = 'Zanzibar: Sam said something in the hallway.';
  let site;
  before(async () => {
    site = await startSite({
      prepare(root) {
        withShippedLedger(root);
        // Reflections inside a Manager-only note, in this week's summary: nested under one, written as one, and under
        // a Manager-only note heading.
        const file = path.join(root, 'meeting-notes', DANA);
        fs.appendFileSync(file, [
          '',
          `- **Manager-only note:** see below.`,
          `  - **What went well: ${SECRET} nested.** Kept private.`,
          `- **Manager-only note:** Could do better: ${SECRET} written as the note.`,
          '',
          '### Manager-only note',
          '',
          `- Could do better: ${SECRET} under the heading.`,
          '',
        ].join('\n'));
      },
    });
  });
  after(async () => { await site?.stop(); });

  test('a reflection inside a Manager-only note is skipped; the others are all there', async () => {
    const b = await briefing(site);
    assert.equal(b.reflections.filter((r) => r.kind === 'went-well').length, 4);
    assert.equal(b.reflections.filter((r) => r.kind === 'could-do-better').length, 4);
    assert.doesNotMatch(JSON.stringify(b), new RegExp(SECRET));
  });

  test('no Manager-only note and no note between meetings appears, in either week', async () => {
    const added = await site.api.addNote({ person: 'Sam Torres', text: NOTE, date: '2026-09-21' });
    assert.ok(added.ok, added.text);
    const notes = privateNoteTexts(site.root);
    assert.ok(notes.length >= 6);
    for (const week of ['this', 'last']) {
      const text = JSON.stringify(await briefing(site, week));
      for (const n of notes) assert.ok(!text.includes(n.text), `${week} week holds the private note in ${n.file}`);
      assert.doesNotMatch(text, /Zanzibar/);
      assert.doesNotMatch(text, /manager-only/i);
    }
  });

  test('opening Today, for either week, writes nothing', async () => {
    const before = snapshot(site.root);
    for (const week of [undefined, 'this', 'last']) await briefing(site, week);
    assert.deepEqual(changedFiles(before, snapshot(site.root)), []);
  });

  test('with no ledger, opening Today does not create one', async () => {
    const bare = await startSite();
    try {
      await briefing(bare);
      await briefing(bare, 'last');
      assert.equal(bare.exists(LEDGER), false);
    } finally {
      await bare.stop();
    }
  });
});

describe('the briefing on the starter workspace', () => {
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

  test('everything is 0 or empty, with no errors, in either week', async () => {
    for (const week of ['this', 'last']) {
      const res = await site.get(`/api/today?week=${week}`);
      assert.equal(res.status, 200, res.text);
      assert.equal(res.json.status, 'no-summaries');
      const b = res.json.briefing;
      assert.deepEqual(b.tiles, {
        dueToday: 0,
        overdue: { count: 0, overThirtyDays: 0 },
        dueThisWeek: { count: 0, through: b.tiles.dueThisWeek.through, next: null },
        completed: { count: 0, otherWeek: 0 },
        teamAlerts: { count: 0, names: [] },
      });
      assert.deepEqual(b.teamHealth, {
        heavyLoads: { count: 0, names: [] },
        overdueOwedToYou: { count: 0, items: [] },
        missedOneOnOne: { count: 0, names: [], longestGap: null },
        awaitingInput: 0,
      });
      assert.deepEqual(b.reflections, []);
      assert.deepEqual(b.numbers, { closed: 0, closedOnTime: '0 of 0', yourOverdue: 0, coverage: '0 of 0' });
      assert.equal(b.activity.length, 6);
      for (const w of b.activity) assert.deepEqual([w.created, w.completed, w.overdue], [0, 0, 0]);
    }
    assert.doesNotMatch(site.output(), /could not read|Server error/i);
  });
});
