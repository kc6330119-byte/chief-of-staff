// Tracked items by ID (step 3): an action item is tracked by its ID, later mentions are found only by that ID
// in "Open Items from Earlier Meetings", and anything that doesn't fit is reported, never guessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { startSite } from './helpers/site.js';

const NOTES = 'meeting-notes';
const JUL28 = '2026-07-28_kevin-praveen_1on1.md';

// The Action Items IDs written in a workspace's summaries, read straight from the files.
function actionItemIds(root) {
  const ids = [];
  for (const f of fs.readdirSync(path.join(root, NOTES)).filter((x) => x.endsWith('.md'))) {
    const src = fs.readFileSync(path.join(root, NOTES, f), 'utf8');
    const section = src.split(/^## /m).find((s) => s.startsWith('Action Items')) || '';
    for (const m of section.matchAll(/^\|\s*(A-[^|\s]+)\s*\|/gm)) ids.push(m[1]);
  }
  return ids.sort();
}

const byId = (tracked, id) => {
  const rows = tracked.filter((r) => r.id === id);
  assert.equal(rows.length, 1, `exactly one tracked row has ID ${id}`);
  return rows[0];
};
const files = (row) => row.sources.map((s) => s.file);

describe('the sample, by ID', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite();
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  test('each Action Items row with a valid ID is one tracked item', () => {
    const items = data.tracked.filter((r) => r.kind === 'action item');
    assert.equal(items.length, 55);
    assert.deepEqual(items.map((r) => r.id).sort(), actionItemIds(site.root));
    for (const r of data.tracked) assert.deepEqual(r.problems, [], `${r.id ?? r.text.slice(0, 40)} has no problems`);
  });

  test('a tracked item has its ID, one owner, the due words, the due date and its first meeting', () => {
    const item = byId(data.tracked, 'A-260908-5');
    assert.equal(item.text, "Riley's first primary on-call week, with Praveen as secondary");
    assert.equal(item.owner, 'Riley Brooks');
    assert.equal(item.due, 'Week of Sep 14');
    assert.equal(item.dueDate, '2026-09-18');
    assert.equal(item.suggested, false);
    assert.equal(item.firstSeen, '2026-09-08');
    assert.deepEqual(item.sources[0], { file: '2026-09-08_kevin-praveen_1on1.md', date: '2026-09-08', kind: 'action item' });

    const suggested = byId(data.tracked, 'A-260728-6');
    assert.equal(suggested.suggested, true);
    assert.equal(suggested.due, 'Before next 1:1');
    assert.equal(suggested.dueDate, null);
  });

  test('later mentions are found by ID; the latest status is the last one, word for word', () => {
    const sprint = byId(data.tracked, 'A-260728-1');
    assert.equal(sprint.firstSeen, '2026-07-28');
    assert.deepEqual(files(sprint), [
      JUL28, '2026-09-08_kevin-praveen_1on1.md', '2026-09-10_kevin-riley_1on1.md', '2026-09-15_kevin-sam_1on1.md', '2026-09-22_dana-kevin_1on1.md',
    ]);
    assert.deepEqual(sprint.sources.map((s) => s.kind), ['action item', 'earlier item', 'earlier item', 'earlier item', 'earlier item']);
    assert.equal(sprint.latestStatus, 'Done. Closed today. Approved. Kevin owned the delay himself. Praveen still needs to hear it (see Sep 8 row below).');
    assert.equal(sprint.state, 'done');
  });

  test('the state comes from the first word of the latest status', () => {
    const asked = byId(data.tracked, 'A-260505-2');
    assert.deepEqual(files(asked), ['2026-05-05_kevin-sam_1on1.md', JUL28]);
    assert.match(asked.latestStatus, /^Dropped\. Closed \/ overtaken\./);
    assert.equal(asked.state, 'dropped');

    const backfill = byId(data.tracked, 'A-260728-5');
    assert.match(backfill.latestStatus, /^Open\. /);
    assert.equal(backfill.state, 'open');
  });

  test('an item never mentioned again is open, with its own status as the latest', () => {
    const item = byId(data.tracked, 'A-260922-2');
    assert.deepEqual(files(item), ['2026-09-22_dana-kevin_1on1.md']);
    assert.equal(item.latestStatus, 'Agreed');
    assert.equal(item.state, 'open');
  });

  test('the owner is the one named in the Action Items row, whatever later rows say', () => {
    // Later rows give "Praveen Iyer, Sam Torres" and "Sam Torres, Praveen Iyer".
    const pairing = byId(data.tracked, 'A-260728-4');
    assert.equal(pairing.owner, 'Praveen Iyer');
    assert.equal(pairing.state, 'done');
  });

  test('an earlier-items row with no ID is listed on its own, as found', () => {
    const concerns = data.tracked.filter((r) => r.kind === 'earlier item');
    assert.equal(concerns.length, 9);
    for (const r of concerns) {
      assert.equal(r.id, null);
      assert.equal(r.sources.length, 1);
    }
  });

  test('ages still count to the newest meeting', () => {
    assert.equal(data.asOf, '2026-09-22');
    assert.equal(byId(data.tracked, 'A-260505-1').ageDays, 140);
    assert.equal(byId(data.tracked, 'A-260922-1').ageDays, 0);
  });
});

// Step 7, the fix: an earlier-items row with no ID is background, not an action item.
describe('an earlier-items row with no ID is background', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite();
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  const background = () => data.tracked.find((r) => r.kind === 'earlier item' && r.text === 'ACT-121: automate the replica rebuild');

  test('its "From" text is kept as written, and no "could not read" is raised for it', () => {
    const row = background();
    assert.equal(row.id, null);
    assert.equal(row.firstSeenText, '2025 (per Riley)');
    assert.deepEqual(row.problems, []);
    assert.ok(!data.warnings.some((w) => /2025 \(per Riley\)/.test(w.message)), JSON.stringify(data.warnings));
  });

  test('every row with no ID keeps its "From" text as written, whether or not a date can be read from it', () => {
    const concern = data.tracked.find((r) => r.kind === 'earlier item' && r.text === 'Riley is nervous about being primary on call');
    assert.equal(concern.firstSeenText, 'Repeated concern (Riley Q2 check-in Jun 30; noted in Jul 28 and Sep 8 summaries)');
    // The date read from it still orders the table and gives the age.
    assert.equal(concern.firstSeen, '2026-06-30');
    assert.equal(concern.ageDays, 84);
  });

  test('afterwards the sample has nothing that could not be read', async () => {
    assert.deepEqual(data.warnings, []);
    assert.equal((await site.api.today()).foot.couldNotRead, 0);
  });

  test('the Meetings page shows the "From" text as written, with no "could not read" on the row', async () => {
    const page = await openPage(site, '#/meetings');
    const row = page.rows('tracked-body').find((r) => r.includes('ACT-121: automate the replica rebuild'));
    assert.match(row, /2025 \(per Riley\)/);
    assert.doesNotMatch(row, /could not read/);
    assert.doesNotMatch(page.html(), /could not be read/);
  });
});

// ---------- problems ----------

const header = (title, date, attendees) => `# ${title} | ${date}

**Date:** ${date} | **Duration:** 1m
**Attendees:** ${attendees}
**Company:** Harborline Cloud | **Type:** 1:1

---

`;
const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
const EARLIER = '\n## Open Items from Earlier Meetings\n\n| ID | From | Item | Owner | Age | Status now |\n|---|---|---|---|---|---|\n';

const OCT5 = '2026-10-05_kevin-sam_1on1.md';
const OCT5B = '2026-10-05_kevin-riley_1on1.md';
const OCT12 = '2026-10-12_kevin-sam_1on1.md';
const OLD = '2026-10-01_kevin-praveen_1on1.md';

function writeFixtures(root) {
  const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
  put(OCT5, header('Kevin & Sam', 'October 5, 2026', 'Kevin Collins (SRE Manager), Sam Torres (SRE II)') + ACTIONS + [
    '| A-261005-1 | Write the failover runbook | Sam | Friday | 2026-10-09 | Open |',
    '|  | A row with no ID | Kevin Collins | Not set |  | Open |',
    '| A-2610-3 | A row whose ID has the wrong shape | Kevin Collins | Not set |  | Open |',
    "| A-261004-4 | A row whose ID has another day's date | Kevin Collins | Not set |  | Open |",
    '| A-261005-5 | A row whose due date does not exist | Kevin Collins | Feb 30 | 2026-02-30 | Open |',
    '| A-261005-6 | The first row with a repeated ID | Kevin Collins | Not set |  | Open |',
    '| A-261005-7 | A row whose owner is not in people.md | Pat Nobody | Not set |  | Open |',
    '| A-261005-8 | A suggested row *(suggested)* | Kevin Collins | Next 1:1 |  | Suggested |',
  ].join('\n') + '\n' + EARLIER + [
    '| A-260101-1 | Jan 1, 2026 | An ID that matches no item | Kevin Collins | 9 months | Open. Not mentioned. |',
    '| A-260505-1 | May 5, 2026 (Sam 1:1) | Bring the duplicates to Dana | Kevin Collins | 22 weeks | Closed. Dana has it now. |',
  ].join('\n') + '\n');
  // A second meeting on the same day: its IDs carry a letter after the date.
  put(OCT5B, header('Kevin & Riley', 'October 5, 2026', 'Kevin Collins (SRE Manager), Riley Brooks (SRE I)') + ACTIONS + [
    '| A-261005b-1 | A row from the second meeting that day | Riley Brooks | Not set |  | Open |',
    '| A-261005-6 | The second row with the repeated ID | Riley Brooks | Not set |  | Open |',
  ].join('\n') + '\n');
  put(OCT12, header('Kevin & Sam', 'October 12, 2026', 'Kevin Collins (SRE Manager), Sam Torres (SRE II)') + ACTIONS + EARLIER + [
    '| A-261005-1 | Oct 5, 2026 | The runbook, in other words | Sam Torres | 7 days | Open. Half written. |',
    '|  | Oct 5, 2026 | Write the failover runbook | Sam Torres | 7 days | Done. Finished on Friday. |',
    '| A-261005b-1 | Oct 5, 2026 (Riley 1:1) | From the second meeting | Riley Brooks | 7 days | Dropped. No longer needed. |',
    '| A-261005-6 | Oct 5, 2026 | The repeated ID | Kevin Collins | 7 days | Done. Finished. |',
  ].join('\n') + '\n');
  // A summary in the old format: a # column and no IDs.
  put(OLD, header('Kevin & Praveen', 'October 1, 2026', 'Kevin Collins (SRE Manager), Praveen Iyer (Senior SRE)')
    + '## Action Items\n\n| # | Action Item | Owner | Due | Status |\n|---|---|---|---|---|\n| 1 | An item in the old format | Praveen Iyer | Not set | Open |\n'
    + '| 2 | A second item in the old format | Kevin Collins | Not set | Open |\n| 3 | A third item in the old format | Sam Torres | Not set | Open |\n'
    + '\n## Open Items from Earlier Meetings\n\n| From | Item | Owner | Age | Status now |\n|---|---|---|---|---|\n| May 5, 2026 | An earlier row in the old format | Kevin Collins | 21 weeks | Open |\n');
}

describe('problems are reported, never guessed', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite({ prepare: writeFixtures });
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  // A row's problem is listed on the row and among the page's warnings, under the row's own file.
  const flagged = (row, re) => {
    const p = row.problems.find((x) => re.test(x));
    assert.ok(p, `${row.id ?? row.text} is flagged ${re}; problems: ${JSON.stringify(row.problems)}`);
    assert.ok(data.warnings.some((w) => w.file === row.sources[0].file && w.message.includes(p)), `"${p}" is among the warnings`);
  };
  const actionRow = (text) => {
    const row = data.tracked.find((r) => r.kind === 'action item' && r.text === text);
    assert.ok(row, `"${text}" is listed`);
    return row;
  };

  test('a valid item: owner by "Also called", due date, and a later mention found by ID only', () => {
    const item = byId(data.tracked, 'A-261005-1');
    assert.equal(item.owner, 'Sam Torres');
    assert.equal(item.due, 'Friday');
    assert.equal(item.dueDate, '2026-10-09');
    assert.deepEqual(item.problems, []);
    assert.deepEqual(files(item), [OCT5, OCT12]);
    assert.equal(item.latestStatus, 'Open. Half written.');
    assert.equal(item.state, 'open');
  });

  test('matching by wording is gone: a row with the same words but no ID stays on its own', () => {
    const same = data.tracked.filter((r) => r.text === 'Write the failover runbook');
    assert.equal(same.length, 2);
    const later = same.find((r) => r.kind === 'earlier item');
    assert.equal(later.id, null);
    assert.deepEqual(files(later), [OCT12]);
    assert.equal(later.state, 'done');
  });

  test('a second meeting on the same day: an ID with a letter after the date', () => {
    const item = byId(data.tracked, 'A-261005b-1');
    assert.deepEqual(item.problems, []);
    assert.deepEqual(files(item), [OCT5B, OCT12]);
    assert.equal(item.state, 'dropped');
  });

  test('a row with no ID is shown as "no ID" and not tracked across meetings', () => {
    const row = actionRow('A row with no ID');
    assert.equal(row.id, null);
    assert.deepEqual(files(row), [OCT5]);
    flagged(row, /no ID/);
  });

  test('an ID of the wrong shape', () => {
    const row = actionRow('A row whose ID has the wrong shape');
    assert.equal(row.id, 'A-2610-3');
    flagged(row, /A-YYMMDD-n/);
  });

  test("an ID whose date is not the meeting's date", () => {
    flagged(actionRow("A row whose ID has another day's date"), /not the meeting's date/);
  });

  test('the same ID twice in a workspace: both flagged, and a later mention is given to neither', () => {
    const rows = data.tracked.filter((r) => r.id === 'A-261005-6' && r.kind === 'action item');
    assert.equal(rows.length, 2);
    for (const r of rows) {
      flagged(r, /more than once/);
      assert.equal(r.sources.length, 1, `${r.text} gets no later mention`);
    }
    assert.deepEqual(rows.map((r) => r.sources[0].file).sort(), [OCT5B, OCT5].sort());
  });

  test('a Due date that is not a real date', () => {
    const row = actionRow('A row whose due date does not exist');
    assert.equal(row.dueDate, null);
    assert.equal(row.due, 'Feb 30');
    flagged(row, /Due date/);
  });

  test('an owner not in people.md', () => {
    const row = actionRow('A row whose owner is not in people.md');
    assert.equal(row.owner, 'Pat Nobody');
    flagged(row, /not in people\.md/);
  });

  test('a suggested row gets an ID like any other', () => {
    const item = byId(data.tracked, 'A-261005-8');
    assert.equal(item.suggested, true);
    assert.deepEqual(item.problems, []);
  });

  test('an earlier-items ID that matches no item', () => {
    const row = data.tracked.find((r) => r.id === 'A-260101-1');
    assert.ok(row, 'the row is listed');
    assert.equal(row.kind, 'earlier item');
    flagged(row, /matches no action item/);
  });

  test('a "Status now" that starts with none of the three words is treated as open, and flagged', () => {
    const item = byId(data.tracked, 'A-260505-1');
    assert.equal(item.latestStatus, 'Closed. Dana has it now.');
    assert.equal(item.state, 'open');
    assert.ok(data.warnings.some((w) => w.file === OCT5 && /Status now/.test(w.message) && /Open, Done or Dropped/.test(w.message)), 'flagged');
  });

  test('a summary in the old format still opens; its rows show "no ID", with one warning for the file', async () => {
    const res = await site.api.meetingRaw(OLD);
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.match(res.json.html, /An item in the old format/);

    const row = data.tracked.find((r) => r.key === `${OLD}#1`);
    assert.ok(row, 'its action item is listed');
    assert.equal(row.id, null);
    assert.equal(row.text, 'An item in the old format');
    assert.equal(row.owner, 'Praveen Iyer');
    const rows = data.tracked.filter((r) => r.kind === 'action item' && r.sources[0].file === OLD);
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.id, null);
      assert.ok(!r.problems.some((p) => /no ID/.test(p)), 'the row itself carries no "no ID" problem');
    }
    const noId = data.warnings.filter((w) => w.file === OLD && /no ID/.test(w.message));
    assert.equal(noId.length, 1, JSON.stringify(noId));
    assert.match(noId[0].message, /^3 Action Items rows have no ID/);

    const earlier = data.tracked.find((r) => r.text === 'An earlier row in the old format');
    assert.equal(earlier.id, null);
    assert.deepEqual(files(earlier), [OLD]);
  });
});
