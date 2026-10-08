// The Meetings page (step 3), drawn by public/app.js from the core's answers: the tracked table shows the ID
// and the due date, the Owner filter has one name per item, and an Attendee filter narrows the summaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { startSite } from './helpers/site.js';

const OLD = '2026-10-01_kevin-praveen_1on1.md';

let site;
let data;
let page;
before(async () => {
  site = await startSite({
    prepare(root) {
      // One summary in the old format, whose row has no ID.
      fs.writeFileSync(path.join(root, 'meeting-notes', OLD), `# Kevin & Praveen | October 1, 2026

**Date:** October 1, 2026 | **Duration:** 1m
**Attendees:** Kevin Collins (SRE Manager), Praveen Iyer (Senior SRE)
**Company:** Harborline Cloud | **Type:** 1:1

## Action Items

| # | Action Item | Owner | Due | Status |
|---|---|---|---|---|
| 1 | An item in the old format | Praveen Iyer | Not set | Open |
`);
    },
  });
  data = (await site.get('/api/meetings')).json;
  page = await openPage(site, '#/meetings');
});
after(async () => { await site?.stop(); });

const rowWith = (id) => page.rows('tracked-body').find((r) => r.includes(`>${id}<`));
const links = (html) => [...html.matchAll(/href="#\/meetings\/([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));

test('the page draws without an error', () => {
  assert.doesNotMatch(page.html(), /Something went wrong/);
  assert.ok(page.rows('tracked-body').length > 0);
});

test('the tracked table shows the ID and the due date', () => {
  assert.match(page.html(), /<th[^>]*>ID<\/th>/);
  assert.match(page.html(), /<th[^>]*>Due date<\/th>/);
  const row = rowWith('A-260505-3');
  assert.ok(row, 'the row for A-260505-3 is shown');
  assert.match(row, /Take Friday afternoon off/);
  assert.match(row, /May 8, 2026/);
});

test('a row with no ID shows "no ID"', () => {
  const row = page.rows('tracked-body').find((r) => r.includes('An item in the old format'));
  assert.ok(row, 'the old-format row is shown');
  assert.match(row, /no ID/);
});

test('the Owner filter lists only the owners of action items: in the sample, the five names in people.md', async () => {
  const five = (await site.api.people()).people.map((p) => p.name).sort();
  assert.equal(five.length, 5);
  const actionOwners = [...new Set(data.tracked.filter((r) => r.kind === 'action item').map((r) => r.owner).filter(Boolean))].sort();
  assert.deepEqual(actionOwners, five);
  assert.deepEqual([...data.owners].sort(), five);
  assert.deepEqual(page.options('owner-filter').filter(Boolean).sort(), five);
  // Earlier-items rows name owners such as "Sam Torres (now)"; a row that is not an action item never adds a name.
  const earlierOnly = data.tracked.filter((r) => r.kind !== 'action item' && r.owner && !five.includes(r.owner));
  assert.ok(earlierOnly.length > 0, 'the sample has earlier-items rows with other owner texts');
  for (const r of earlierOnly) assert.ok(!data.owners.includes(r.owner), `"${r.owner}" is not listed`);
  // A-260728-4 is Praveen's; later rows name Sam as well, but the item has one owner.
  await page.choose('owner-filter', 'Sam Torres');
  assert.ok(rowWith('A-260505-3'), "Sam's own item is shown");
  assert.equal(rowWith('A-260728-4'), undefined, "Praveen's item is not");
  await page.choose('owner-filter', '');
});

test('a number in the Age column never wraps', () => {
  // Layout is not drawn here, so this checks the rule that keeps an age on one line; check:app measures it in the app.
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'styles.css'), 'utf8');
  const rule = css.match(/\.tracked td\.num\s*\{([^}]*)\}/);
  assert.ok(rule, 'styles.css has a rule for the tracked table\'s number cells');
  assert.match(rule[1], /white-space:\s*nowrap/);
  const age = data.tracked.find((r) => r.id === 'A-260505-1').ageDays;
  assert.ok(age >= 100, 'a three-digit age');
  assert.ok(rowWith('A-260505-1').includes(`<td class="num">${age}</td>`));
});

test('the Attendee filter narrows the list of summaries', async () => {
  const attendees = [...new Set(data.meetings.flatMap((m) => m.people || []))].sort();
  assert.deepEqual(page.options('attendee-filter').filter(Boolean).sort(), attendees);

  await page.choose('attendee-filter', 'Riley Brooks');
  assert.deepEqual(links(page.el('meeting-list').innerHTML), ['2026-09-10_kevin-riley_1on1.md']);

  await page.choose('attendee-filter', 'Praveen Iyer');
  assert.deepEqual(links(page.el('meeting-list').innerHTML), [OLD, '2026-09-08_kevin-praveen_1on1.md', '2026-07-28_kevin-praveen_1on1.md']);

  await page.choose('attendee-filter', '');
  assert.equal(links(page.el('meeting-list').innerHTML).length, data.meetings.length);
});
