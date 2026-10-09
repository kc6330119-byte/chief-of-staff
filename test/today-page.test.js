// 0.3.0 step 2: the new Today, drawn from step 1's briefing (design/reference-briefing.html). On the sample with its
// shipped ledger, as of Tue 2026-09-22: the tiles, a tile's filter, the week picker, the coach's reflections, the numbers
// and the activity chart show the values in test/briefing.test.js. Search reads what the Board and People pages read,
// never a note's text. Opening Today, searching or picking a week writes nothing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { changedFiles, LEDGER, privateNoteTexts, SITE_DIR, snapshot, startSite } from './helpers/site.js';

const SAMPLE = path.join(SITE_DIR, 'sample-workspace');
const STARTER = path.join(SITE_DIR, 'starter-workspace');
const DANA = '2026-09-22_dana-kevin_1on1.md';
const SAM = '2026-09-15_kevin-sam_1on1.md';
const RILEY = '2026-09-10_kevin-riley_1on1.md';
const NOTE_WORD = 'Zanzibar';
const CARD_NOTE = 'Quillfeather';

const withShippedLedger = (root) => {
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.copyFileSync(path.join(SAMPLE, LEDGER), path.join(root, LEDGER));
};

const body = (page) => page.el('today-body').innerHTML;
const section = (page, id) => body(page).split(/<section\b/).find((s) => s.includes(`id="${id}"`)) || '';
const tile = (page, id) => {
  const m = body(page).match(new RegExp(`id="tile-${id}"[^>]*>\\s*<span class="tile-label">([^<]*)</span><span class="tile-count">([^<]*)</span><span class="tile-sub">([^<]*)</span>`));
  return m ? m.slice(1).map((x) => x.trim()) : null;
};
const rowIds = (page) => [...body(page).matchAll(/<li class="today-row[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
async function clickBrief(page, dataset) {
  const target = { dataset, closest: (sel) => (sel === '[data-brief]' ? target : null) };
  await page.el('today-body').fire('click', { target });
}
const headlines = (page, kind) => [...section(page, `reflections-${kind}`).matchAll(/class="reflection-text"[^>]*>([^<]*)</g)].map((m) => m[1]);
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('Today on the sample, as of Tue Sep 22', () => {
  let site;
  let page;
  let view;
  before(async () => {
    site = await startSite({ prepare: withShippedLedger });
    view = await site.api.today();
    page = await openPage(site, '#/today');
  });
  after(async () => { await site?.stop(); });

  test('the header: the as-of date, the greeting with the first name of the "me" row, the counts line, Search, Week and Reload', () => {
    assert.equal(page.el('today-date').textContent, 'Tuesday, Sep 22, 2026 · the date of the newest meeting');
    assert.match(page.el('today-greeting').innerHTML, /^Good (morning|afternoon|evening), Kevin\.$/);
    assert.equal(page.el('today-sub').innerHTML, 'Five for you, five owed to you, one to confirm.');
    assert.match(page.html(), /<input type="search" id="today-search" placeholder="Actions, meetings, people"/);
    assert.deepEqual(page.options('today-week'), ['this', 'last']);
    assert.match(page.el('today-week').innerHTML, /<option value="this" selected>This week \(Sep 21–27\)<\/option><option value="last">Last week \(Sep 14–20\)<\/option>/);
    assert.match(page.html(), /id="today-reload"[^>]*>Reload</);
  });

  test('the five tiles show the sample\'s values, with the second lines of the reference', () => {
    assert.deepEqual(tile(page, 'due-today'), ['Due today', '0', 'Nothing due today']);
    assert.deepEqual(tile(page, 'overdue'), ['Overdue', '4', '3 over 30 days']);
    assert.deepEqual(tile(page, 'due-this-week'), ['Due this week', '0', 'Next: 3 due Tue, Sep 29']);
    assert.deepEqual(tile(page, 'completed'), ['Completed', '2', 'This week · 2 last week']);
    assert.deepEqual(tile(page, 'team-alerts'), ['Team alerts', '0', 'No one flagged']);
    assert.match(body(page), /<a class="tile tile-good" id="tile-completed" href="#\/board">/);
    assert.match(body(page), /<a class="tile" id="tile-team-alerts" href="#\/people">/);
  });

  test('Needs you now: Today\'s items in Today\'s order, the first 7, then "Show all 11"', async () => {
    const order = view.groups.flatMap((g) => g.items.map((i) => i.id));
    assert.equal(order.length, 11);
    assert.deepEqual(rowIds(page), order.slice(0, 7));
    assert.match(section(page, 'group-now'), /Showing 7 of 11, in Today’s order/);
    await clickBrief(page, { brief: 'show-all' });
    assert.deepEqual(rowIds(page), order);
    await clickBrief(page, { brief: 'show-fewer' });
    assert.deepEqual(rowIds(page), order.slice(0, 7));
  });

  test('a row: the chip, the title, "You" for mine, the due date and the meeting link', () => {
    const row = body(page).split(/<li class="today-row/).find((r) => r.includes('data-id="A-260915-3"'));
    assert.match(row, /<span class="chip chip-soon">Due in 7 days<\/span>/);
    assert.match(row, />Sponsor the change at the change board</);
    assert.match(row, /<span class="today-owner">You<\/span> · Due Tue, Sep 29/);
    assert.match(row, new RegExp(`<a href="#/meetings/${encodeURIComponent(SAM)}"[^>]*>Kevin &amp; Sam: Bi-Weekly 1:1, <span class="nowrap">Sep 15</span></a>`));
    const other = body(page).split(/<li class="today-row/).find((r) => r.includes('data-id="A-260505-3"'));
    assert.match(other, /<span class="today-owner">Sam Torres<\/span>/);
  });

  test('a filter tile filters the list and is named above it; a second click clears it', async () => {
    await clickBrief(page, { brief: 'filter', filter: 'overdue' });
    assert.deepEqual(rowIds(page).sort(), ['A-260505-2', 'A-260505-3', 'A-260505-4', 'A-260915-4']);
    assert.match(body(page), /id="tile-overdue" data-brief="filter" data-filter="overdue" aria-pressed="true"/);
    assert.match(section(page, 'group-now'), /Filtered to <strong>Overdue<\/strong>: 4 items of 11\./);
    await clickBrief(page, { brief: 'filter', filter: 'overdue' });
    assert.equal(rowIds(page).length, 7);
    assert.doesNotMatch(body(page), /now-filter|aria-pressed="true"/);
    await clickBrief(page, { brief: 'filter', filter: 'due-this-week' });
    assert.deepEqual(rowIds(page), []);
    assert.match(section(page, 'group-now'), /Nothing is due this week\./);
    await clickBrief(page, { brief: 'filter', filter: 'due-today' });
    assert.match(section(page, 'group-now'), /Filtered to <strong>Due today<\/strong>/);
    await clickBrief(page, { brief: 'clear-filter' });
    assert.equal(rowIds(page).length, 7);
  });

  test('Team health: the four rows, each a link to People or to the item, and "View People"', async () => {
    const team = section(page, 'group-team');
    assert.match(team, /3 reports/);
    const sub = (id) => team.match(new RegExp(`id="team-${id}"[^>]*>\\s*<span class="team-count[^"]*">(\\d+)</span>\\s*<span class="team-text"><span class="team-name">([^<]*)</span><span class="team-sub">([^<]*)</span>`))?.slice(1);
    assert.deepEqual(sub('heavy'), ['0', 'Heavy loads', '3+ open items past due or due within a week']);
    assert.deepEqual(sub('owed'), ['1', 'Overdue, owed to you', 'Sam Torres, 137 days']);
    assert.deepEqual(sub('missed'), ['0', 'No 1:1 in 30+ days', 'Longest gap: Praveen, 14 days']);
    assert.deepEqual(sub('input'), ['1', 'Awaiting your input', 'A summary and your Board disagree']);
    assert.match(team, /id="team-heavy" href="#\/people"/);
    assert.match(team, /id="team-owed" href="#\/today" data-brief="goto-item" data-item="A-260505-3"/);
    assert.match(team, /id="team-input" href="#\/today" data-brief="goto-item" data-item="A-260505-2"/);
    assert.match(team, />View People</);
    // The item link shows its row, even past the first seven.
    await clickBrief(page, { brief: 'goto-item', item: 'A-260505-2' });
    assert.ok(rowIds(page).includes('A-260505-2'));
    await clickBrief(page, { brief: 'show-fewer' });
  });

  test('the reflections: the headlines word for word, each with its meeting date linked; 3, then "1 more"; a click shows the full text', async () => {
    const all = view.briefing.reflections;
    for (const kind of ['went-well', 'could-do-better']) {
      const mine = all.filter((r) => r.kind === kind);
      assert.deepEqual(headlines(page, kind).map(unesc), mine.slice(0, 3).map((r) => r.headline));
      assert.match(section(page, `reflections-${kind}`), /The Coach’s words, from this week’s summaries/);
      assert.match(section(page, `reflections-${kind}`), new RegExp(`<a class="reflection-date" href="#/meetings/${encodeURIComponent(DANA)}"[^>]*>Sep 22</a>`));
      assert.match(section(page, `reflections-${kind}`), /data-brief="more" data-kind="[\w-]+">1 more</);
      await clickBrief(page, { brief: 'more', kind });
      assert.deepEqual(headlines(page, kind).map(unesc), mine.map((r) => r.headline));
    }
    const first = all.find((r) => r.kind === 'went-well');
    await clickBrief(page, { brief: 'reflection', key: 'went-well-0' });
    assert.equal(unesc(headlines(page, 'went-well')[0]), first.text);
    assert.match(section(page, 'reflections-went-well'), /data-key="went-well-0" aria-expanded="true"/);
    await clickBrief(page, { brief: 'reflection', key: 'went-well-0' });
    assert.equal(unesc(headlines(page, 'went-well')[0]), first.headline);
  });

  test('this week in numbers: counts with their base and one line each', () => {
    const numbers = section(page, 'group-numbers');
    assert.match(numbers, /<h2 id="h-numbers">This week in numbers<\/h2>/);
    assert.match(numbers, /Sep 21–27, counted to Sep 22/);
    const stat = (id) => numbers.match(new RegExp(`id="number-${id}"><dt>([^<]*)</dt><dd class="number-value[^"]*">([^<]*)</dd><dd class="number-note">([^<]*)</dd>`))?.slice(1);
    assert.deepEqual(stat('closed'), ['Closed', '2', '2 last week']);
    assert.deepEqual(stat('on-time'), ['Closed on time', '0 of 1', 'of those with a due date']);
    assert.deepEqual(stat('your-overdue'), ['Your overdue items', '3', 'items you own, past due']);
    assert.deepEqual(stat('coverage'), ['1:1 coverage', '3 of 3', 'reports met in 14 days']);
  });

  test('weekly activity: an SVG line chart of 6 weeks, 18 points each named with its value, a legend and the note', () => {
    const chart = section(page, 'group-activity');
    assert.equal((chart.match(/class="chart-point /g) || []).length, 18);
    assert.equal((chart.match(/<polyline class="chart-line /g) || []).length, 3);
    assert.deepEqual([...chart.matchAll(/<text class="chart-week"[^>]*>([^<]*)</g)].map((m) => m[1]), ['Aug 17', 'Aug 24', 'Aug 31', 'Sep 7', 'Sep 14', 'Sep 21']);
    for (const w of view.briefing.activity) {
      const day = new Date(`${w.weekStart}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
      for (const [k, label] of [['created', 'Created'], ['completed', 'Completed'], ['overdue', 'Overdue']]) {
        assert.ok(chart.includes(`role="img" aria-label="${label}, week of ${day}: ${w[k]}"`), `${label} ${day}`);
      }
    }
    assert.match(chart, /<ul class="chart-legend" aria-label="Legend">[^]*Created[^]*Completed[^]*Overdue/);
    assert.match(chart, /Overdue = open and past due at the week’s end\./);
    assert.doesNotMatch(page.html(), /<script|cdn|chart\.js/i);
  });

  test('Last week: Completed\'s second line, the reflections, the numbers and their heading follow it; the rest stays', async () => {
    const tilesBefore = ['due-today', 'overdue', 'due-this-week', 'team-alerts'].map((id) => tile(page, id));
    const rowsBefore = rowIds(page);
    await page.choose('today-week', 'last');
    assert.deepEqual(tile(page, 'completed'), ['Completed', '2', 'Last week · 2 this week']);
    assert.deepEqual(['due-today', 'overdue', 'due-this-week', 'team-alerts'].map((id) => tile(page, id)), tilesBefore);
    assert.deepEqual(rowIds(page), rowsBefore);
    const numbers = section(page, 'group-numbers');
    assert.match(numbers, /<h2 id="h-numbers">Last week in numbers<\/h2>/);
    assert.match(numbers, /id="numbers-sub">Sep 14–20</);
    assert.match(numbers, /Closed on time<\/dt><dd class="number-value">1 of 1/);
    assert.match(numbers, /Closed<\/dt><dd class="number-value">2<\/dd><dd class="number-note">2 this week/);
    // Your overdue items and coverage are still counted to the as-of date, and say so.
    const stat = (id) => numbers.match(new RegExp(`id="number-${id}"><dt>([^<]*)</dt><dd class="number-value[^"]*">([^<]*)</dd><dd class="number-note">([^<]*)</dd>`))?.slice(1);
    assert.deepEqual(stat('your-overdue'), ['Your overdue items', '3', 'as of Sep 22']);
    assert.deepEqual(stat('coverage'), ['1:1 coverage', '3 of 3', 'as of Sep 22']);
    for (const kind of ['went-well', 'could-do-better']) {
      const s = section(page, `reflections-${kind}`);
      assert.match(s, /from last week’s summaries/);
      const dates = [...s.matchAll(/<a class="reflection-date" href="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [decodeURIComponent(m[1]), m[2]]);
      for (const d of dates) assert.deepEqual(d, [`#/meetings/${SAM}`, 'Sep 15']);
    }
    await page.choose('today-week', 'this');
    assert.match(section(page, 'group-numbers'), /This week in numbers/);
    assert.match(section(page, 'group-numbers'), /<dd class="number-note">items you own, past due<\/dd>[^]*<dd class="number-note">reports met in 14 days<\/dd>/);
  });
});

describe('search on Today', () => {
  let site;
  let page;
  let board;
  const search = async (q) => { await page.el('today-search').fire('input', { value: q }); return page.el('today-search-results'); };
  const group = (html, id) => html.split(/<section\b/).find((s) => s.includes(`id="search-${id}"`)) || '';
  before(async () => {
    site = await startSite({ prepare: withShippedLedger });
    // A note between meetings about Riley, and a note on one of Riley's cards: neither is ever searched.
    const added = await site.api.addNote({ person: 'Riley Brooks', text: `${NOTE_WORD}: Riley said something in the hallway.`, date: '2026-09-21' });
    assert.ok(added.ok, added.text);
    board = (await site.get('/api/board')).json;
    const riley = board.cards.find((c) => c.owner === 'Riley Brooks' && !c.suggested);
    const saved = await site.put(`/api/board/cards/${riley.id}`, { note: `${CARD_NOTE} on the card.` });
    assert.equal(saved.status, 200, saved.text);
    board = (await site.get('/api/board')).json;
    page = await openPage(site, '#/today');
  });
  after(async () => { await site?.stop(); });

  test('"riley" finds Riley Brooks, her items and her meetings, grouped by kind, each a link', async () => {
    const out = await search('riley');
    assert.equal(out.hidden, false);
    const html = out.innerHTML;
    assert.match(group(html, 'people'), /<a href="#\/people\/Riley%20Brooks">\s*<span class="search-main">Riley Brooks<\/span>\s*<span class="search-sub">SRE I<\/span>/);
    const hers = board.cards.filter((c) => c.owner === 'Riley Brooks' && !c.suggested);
    assert.ok(hers.length > 0);
    const items = group(html, 'items');
    for (const c of hers.slice(0, 8)) assert.ok(items.includes(`>${c.id} · Riley Brooks`), c.id);
    // Hers, and any whose title names her.
    const matching = board.cards.filter((c) => !c.suggested && /riley/i.test(`${c.own ? '' : c.id} ${c.title} ${c.owner || ''}`));
    assert.match(items, new RegExp(`<h3 id="search-items-h">Action items <span class="search-n">${matching.length}</span>`));
    const meetings = group(html, 'meetings');
    const withRiley = board.meetings.filter((m) => (m.people || []).some((p) => /riley/i.test(p)) || /riley/i.test(m.title));
    assert.ok(withRiley.some((m) => m.file === RILEY));
    for (const m of withRiley) assert.ok(meetings.includes(`href="#/meetings/${encodeURIComponent(m.file)}"`), m.file);
    // Ignoring case.
    assert.equal((await search('RILEY')).innerHTML, html.replace('for “riley”', 'for “RILEY”'));
  });

  test('by ID, by role and by a meeting\'s title', async () => {
    const id = board.cards.find((c) => !c.own && !c.suggested).id;
    assert.ok(group((await search(id.toLowerCase())).innerHTML, 'items').includes(`>${id} · `));
    assert.match(group((await search('senior sre')).innerHTML, 'people'), /Praveen Iyer/);
    assert.match(group((await search('bi-weekly')).innerHTML, 'meetings'), /Kevin &amp; Sam: Bi-Weekly 1:1/);
  });

  test('never a note\'s text, a card\'s note or a Manager-only note', async () => {
    assert.match((await search(NOTE_WORD)).innerHTML, /Nothing matches “Zanzibar”\./);
    assert.match((await search(CARD_NOTE)).innerHTML, /Nothing matches/);
    for (const n of privateNoteTexts(site.root)) {
      const words = n.text.split(/\s+/).filter((w) => w.length > 8 && !/[^A-Za-z]/.test(w));
      for (const w of words.slice(0, 2)) assert.doesNotMatch((await search(w)).innerHTML, /class="search-main"[^>]*>[^<]*Manager-only/i, w);
    }
  });

  test('Escape clears it', async () => {
    await search('riley');
    await page.el('today-search').fire('keydown', { key: 'Escape' });
    assert.equal(page.el('today-search').value, '');
    assert.equal(page.el('today-search-results').hidden, true);
    assert.equal(page.el('today-search-results').innerHTML, '');
  });
});

describe('Today shows no private text, and opening it, searching, filtering or picking a week writes nothing', () => {
  let site;
  before(async () => {
    site = await startSite({ prepare: withShippedLedger });
    const added = await site.api.addNote({ person: 'Sam Torres', text: `${NOTE_WORD}: Sam said something in the hallway.`, date: '2026-09-21' });
    assert.ok(added.ok, added.text);
  });
  after(async () => { await site?.stop(); });

  test('no note text and no Manager-only note, with everything opened, in either week', async () => {
    const before = snapshot(site.root);
    const page = await openPage(site, '#/today');
    await clickBrief(page, { brief: 'show-all' });
    for (const week of ['this', 'last']) {
      await page.choose('today-week', week);
      for (const kind of ['went-well', 'could-do-better']) await clickBrief(page, { brief: 'more', kind });
      for (const kind of ['went-well', 'could-do-better']) for (let i = 0; i < 6; i++) await clickBrief(page, { brief: 'reflection', key: `${kind}-${i}` });
      const html = page.html();
      assert.doesNotMatch(html, new RegExp(NOTE_WORD));
      assert.doesNotMatch(html, /manager-only/i);
      for (const n of privateNoteTexts(site.root)) assert.ok(!html.includes(n.text.slice(0, 40)), `${week}: ${n.file}`);
    }
    for (const filter of ['due-today', 'overdue', 'due-this-week']) await clickBrief(page, { brief: 'filter', filter });
    await page.el('today-search').fire('input', { value: 'sam' });
    assert.doesNotMatch(page.el('today-search-results').innerHTML, new RegExp(NOTE_WORD));
    await page.el('today-reload').fire('click');
    assert.deepEqual(changedFiles(before, snapshot(site.root)), []);
  });
});

describe('Today on the starter workspace', () => {
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

  test('the tiles show 0, the list says there is nothing yet and links to Help, and nothing goes wrong', async () => {
    const before = snapshot(site.root);
    const page = await openPage(site, '#/today');
    const html = body(page);
    for (const id of ['due-today', 'overdue', 'due-this-week', 'completed', 'team-alerts']) assert.equal(tile(page, id)?.[1], '0', id);
    assert.match(section(page, 'group-now'), /Nothing yet: there are no meeting summaries\.[^]*<a href="#\/help">Help<\/a>/);
    assert.match(section(page, 'reflections-went-well'), /No coaching notes in this week’s summaries\./);
    assert.match(section(page, 'reflections-could-do-better'), /No coaching notes in this week’s summaries\./);
    assert.match(section(page, 'group-numbers'), /Closed on time<\/dt><dd class="number-value">0 of 0/);
    assert.equal((section(page, 'group-activity').match(/class="chart-point /g) || []).length, 18);
    assert.match(page.el('today-greeting').innerHTML, /^Good (morning|afternoon|evening)\.$/);
    assert.doesNotMatch(page.html(), /Something went wrong|could not read|undefined|NaN|Invalid Date/);
    await page.choose('today-week', 'last');
    assert.match(section(page, 'reflections-went-well'), /No coaching notes in last week’s summaries\./);
    assert.match((await (async () => { await page.el('today-search').fire('input', { value: 'anything' }); return page.el('today-search-results').innerHTML; })()), /Nothing matches “anything”\./);
    assert.doesNotMatch(page.html(), /Something went wrong|undefined|NaN/);
    assert.deepEqual(changedFiles(before, snapshot(site.root)), []);
    assert.doesNotMatch(site.output(), /could not read|Server error/i);
    assert.ok(html.length > 0);
  });
});
