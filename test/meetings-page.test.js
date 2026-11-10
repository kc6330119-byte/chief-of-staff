// The Meetings page (step 3), drawn by public/app.js from the core's answers: the tracked table shows the ID
// and the due date, the Owner filter has one name per item, and an Attendee filter narrows the summaries. Since 0.4.2
// a button hides or shows the tracked table; it starts hidden when there are more than 15 rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { changedFiles, snapshot, startSite } from './helpers/site.js';

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

test('"Hide closed" also hides an item closed on the Board; it and one reported done in a summary both look closed', async () => {
  const own = await startSite();
  try {
    // A-260505-3 is open in every summary and closed only on the Board.
    assert.equal((await own.api.moveCard('A-260505-3', 'done')).status, 200);
    const tracked = await own.api.tracked();
    const item = (id) => tracked.find((r) => r.id === id && r.kind === 'action item');
    assert.deepEqual([item('A-260505-3').state, item('A-260505-3').column], ['open', 'done']);
    // A-260728-4 is reported done in the Sep 15 summary and open on the Board.
    assert.deepEqual([item('A-260728-4').state, item('A-260728-4').column], ['done', 'todo']);
    assert.equal(own.api.ledger().items['A-260728-4'], undefined);

    const p = await openPage(own, '#/meetings');
    assert.match(p.html(), /Hide closed/);
    assert.doesNotMatch(p.html(), /Hide done and dropped/);
    const drawn = (id) => p.rows('tracked-body').find((r) => r.includes(`>${id}<`));
    for (const id of ['A-260505-3', 'A-260728-4']) assert.match(drawn(id), /^ class="is-closed"/, id);
    assert.doesNotMatch(drawn('A-260505-1'), /^ class="is-closed"/);

    await p.choose('hide-closed', true);
    assert.equal(drawn('A-260505-3'), undefined, 'closed on the Board');
    assert.equal(drawn('A-260728-4'), undefined, 'reported done in a summary');
    assert.ok(drawn('A-260505-1'), 'an open item is still shown');

    await p.choose('hide-closed', false);
    assert.ok(drawn('A-260505-3') && drawn('A-260728-4'));
  } finally {
    await own.stop();
  }
});

// ---------- hiding and showing the tracked table (0.4.2) ----------

// A workspace whose only summary has `n` action items, so it has exactly n tracked rows: every other one is Sam's.
const withRows = (n) => ({
  prepare(root) {
    const dir = path.join(root, 'meeting-notes');
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
    const rows = Array.from({ length: n }, (_, i) =>
      `| A-261001-${i + 1} | Item number ${i + 1} | ${i % 2 ? 'Praveen Iyer' : 'Sam Torres'} | Not set |  | Open |`);
    fs.writeFileSync(path.join(dir, '2026-10-01_kevin-sam_1on1.md'), `# Kevin & Sam | October 1, 2026

**Date:** October 1, 2026 | **Duration:** 30m
**Attendees:** Kevin Collins (SRE Manager), Sam Torres (SRE)
**Company:** Harborline Cloud | **Type:** 1:1

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
${rows.join('\n')}
`);
  },
});

// What the tracked panel shows: the button's text and state, what is hidden, the count line and the rows drawn.
const panel = (p) => ({
  button: p.el('tracked-toggle').textContent,
  expanded: p.el('tracked-toggle').getAttribute('aria-expanded'),
  hidden: ['tracked-filters', 'tracked-table', 'tracked-legend'].filter((id) => p.el(id).hidden),
  count: p.el('tracked-count').textContent,
  about: !p.el('tracked-about').hidden,
  rows: p.rows('tracked-body').length,
});
const HIDDEN = ['tracked-filters', 'tracked-table', 'tracked-legend'];
const click = (p) => p.el('tracked-toggle').fire('click');

test('the button is in the panel head, a real button that controls the filters, the table and the legend', () => {
  const html = page.el('app').innerHTML;
  const head = html.slice(html.indexOf('id="tracked-h"'), html.indexOf('id="tracked-table"'));
  const tag = head.match(/<button\b[^>]*id="tracked-toggle"[^>]*>/)?.[0];
  assert.ok(tag, 'the button is in the panel head');
  // A <button type="button"> is reached with Tab and pressed with Return or Space.
  assert.match(tag, /type="button"/);
  assert.match(tag, /aria-controls="tracked-filters tracked-table tracked-legend"/);
  for (const id of HIDDEN) assert.match(html, new RegExp(`id="${id}"`), id);
  // The warnings panel and the Summaries section are outside it.
  const section = html.slice(html.indexOf('id="tracked-panel"'), html.indexOf('</section>', html.indexOf('id="tracked-panel"')));
  assert.doesNotMatch(section, /meetings-warnings|summaries-h|attendee-filter/);
});

test('the sample as shipped has 64 tracked rows, more than 15, so the table starts hidden', async () => {
  const own = await startSite();
  try {
    assert.equal((await own.get('/api/meetings')).json.tracked.length, 64);
    const p = await openPage(own, '#/meetings');
    assert.deepEqual(panel(p), { button: 'Show', expanded: 'false', hidden: HIDDEN, count: '64 tracked items', about: false, rows: panel(p).rows });
    assert.match(p.el('app').innerHTML, /<h2 id="tracked-h">Tracked items across all meetings<\/h2>/);
  } finally {
    await own.stop();
  }
});

test('with 15 tracked rows the table starts shown, as today; with 16 it starts hidden', async () => {
  for (const [n, shown] of [[15, true], [16, false]]) {
    const own = await startSite(withRows(n));
    try {
      assert.equal((await own.get('/api/meetings')).json.tracked.length, n, `the fixture has ${n} rows`);
      const p = await openPage(own, '#/meetings');
      assert.deepEqual(panel(p), shown
        ? { button: 'Hide', expanded: 'true', hidden: [], count: `Showing ${n} of ${n}`, about: true, rows: n }
        : { button: 'Show', expanded: 'false', hidden: HIDDEN, count: `${n} tracked items`, about: false, rows: n }, `${n} rows`);
    } finally {
      await own.stop();
    }
  }
});

test('a click shows the table and the filters still work; hidden again, the count is of every row, not the filtered ones', async () => {
  const own = await startSite(withRows(20));
  try {
    for (const id of ['A-261001-3', 'A-261001-9', 'A-261001-15']) assert.equal((await own.api.moveCard(id, 'done')).status, 200);
    const p = await openPage(own, '#/meetings');
    assert.equal(panel(p).button, 'Show');
    await click(p);
    assert.deepEqual(panel(p), { button: 'Hide', expanded: 'true', hidden: [], count: 'Showing 20 of 20', about: true, rows: 20 });

    await p.choose('owner-filter', 'Sam Torres');
    assert.equal(panel(p).count, 'Showing 10 of 20');
    assert.ok(p.rows('tracked-body').every((r) => r.includes('Sam Torres')));
    await p.choose('hide-closed', true);
    // Sam's are items 1, 3, 5, …, 19; of those, 3, 9 and 15 are closed on the Board.
    assert.equal(panel(p).count, 'Showing 7 of 20');

    await click(p);
    assert.deepEqual(panel(p), { button: 'Show', expanded: 'false', hidden: HIDDEN, count: '20 tracked items', about: false, rows: 7 });
    await click(p);
    assert.equal(panel(p).count, 'Showing 7 of 20', 'shown again, with the filters as they were');
  } finally {
    await own.stop();
  }
});

test('the choice is kept on leaving Meetings and coming back, and nothing is written', async () => {
  const many = await startSite(withRows(20));
  const few = await startSite(withRows(3));
  try {
    const before = [snapshot(many.root), snapshot(few.root)];
    // Many rows: shown by a click, then still shown after another page.
    const p = await openPage(many, '#/meetings');
    await click(p);
    await p.go('#/board');
    assert.equal(p.body.dataset.page, 'board');
    await p.go('#/meetings');
    assert.deepEqual(panel(p), { button: 'Hide', expanded: 'true', hidden: [], count: 'Showing 20 of 20', about: true, rows: 20 });

    // Few rows: hidden by a click, then still hidden after a meeting's page; until then the rule decides on each visit.
    const q = await openPage(few, '#/meetings');
    await q.go('#/today');
    await q.go('#/meetings');
    assert.equal(panel(q).button, 'Hide', 'not yet chosen: 3 rows start shown');
    await click(q);
    await q.go(`#/meetings/${encodeURIComponent('2026-10-01_kevin-sam_1on1.md')}`);
    await q.go('#/meetings');
    assert.deepEqual(panel(q), { button: 'Show', expanded: 'false', hidden: HIDDEN, count: '3 tracked items', about: false, rows: 3 });

    assert.deepEqual(changedFiles(before[0], snapshot(many.root)), []);
    assert.deepEqual(changedFiles(before[1], snapshot(few.root)), []);
  } finally {
    await many.stop();
    await few.stop();
  }
});
