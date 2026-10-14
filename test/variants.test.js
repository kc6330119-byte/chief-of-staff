// 0.3.2: more of the ways real summaries are written are read (header fields, headings, "Status now" words), a row
// that refers to a meeting from before the oldest summary is not a problem, and Meetings groups its warnings.
// What is still not unambiguous is reported, never guessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { startSite } from './helpers/site.js';

const NOTES = 'meeting-notes';
const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
const EARLIER = '\n## Open Items from Earlier Meetings\n\n| ID | From | Item | Owner | Age | Status now |\n|---|---|---|---|---|---|\n';
const ATTENDEES = 'Kevin Collins (SRE Manager), Sam Torres (SRE II)';
const PEOPLE = ['Kevin Collins', 'Sam Torres'];

// A summary whose header lines are given as written.
const summary = (headerLines, rest = ACTIONS) => `# Kevin & Sam\n\n${headerLines.join('\n')}\n\n---\n\n${rest}`;

// ---------- header fields ----------

const HEADERS = {
  '2026-10-01_bold-colon-outside.md': ['**Date**: October 1, 2026 | **Duration**: 1m', `**Attendees**: ${ATTENDEES}`, '**Company**: Harborline Cloud | **Type**: 1:1'],
  '2026-10-02_plain.md': ['Date: October 2, 2026 | Duration: 1m', `Attendees: ${ATTENDEES}`, 'Company: Harborline Cloud | Type: 1:1'],
  '2026-10-03_capitals.md': ['**DATE:** October 3, 2026 | **duration:** 1m', `**ATTENDEES:** ${ATTENDEES}`, '**company:** Harborline Cloud | **TYPE:** 1:1'],
  '2026-10-04_synonyms.md': ['**Date:** October 4, 2026 | **Duration:** 1m', `**Participants:** ${ATTENDEES}`, '**Company:** Harborline Cloud | **Meeting type:** 1:1'],
  '2026-10-05_plain-synonyms.md': ['date: October 5, 2026 | duration: 1m', `participants: ${ATTENDEES}`, 'company: Harborline Cloud | meeting type: 1:1'],
};
// Under a "## Meeting info" heading, below the header: the bold forms are read there, as anywhere in the file; the
// plain form is read only in the header.
const INFO_BOLD = '2026-10-06_meeting-info-bold.md';
const INFO_PLAIN = '2026-10-07_meeting-info-plain.md';
const meetingInfo = (lines) => `# Kevin & Sam\n\n**Date:** October 6, 2026 | **Duration:** 1m\n\n## Meeting info\n\n${lines.join('\n')}\n\n${ACTIONS}`;

describe('header fields', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
        for (const [file, lines] of Object.entries(HEADERS)) put(file, summary(lines));
        put(INFO_BOLD, meetingInfo([`**Attendees**: ${ATTENDEES}`, '**Company:** Harborline Cloud | **Meeting type:** 1:1']));
        put(INFO_PLAIN, meetingInfo([`Attendees: ${ATTENDEES}`, 'Company: Harborline Cloud', 'Meeting type: 1:1']));
      },
    });
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  for (const file of Object.keys(HEADERS)) {
    test(`${file}: Attendees and Type are read, on Meetings and on the meeting page alike`, async () => {
      const m = data.meetings.find((x) => x.file === file);
      assert.deepEqual(m.people, PEOPLE);
      assert.equal(m.type, '1:1');
      assert.ok(!data.warnings.some((w) => w.file === file), JSON.stringify(data.warnings.filter((w) => w.file === file)));

      const page = (await site.get(`/api/meeting?file=${encodeURIComponent(file)}`)).json;
      assert.deepEqual(page.people, PEOPLE);
      assert.equal(page.type, '1:1');
      const fields = Object.fromEntries([...page.html.matchAll(/<dt>([^<]*)<\/dt><dd>(.*?)<\/dd>/g)].map((x) => [x[1], x[2]]));
      assert.deepEqual(Object.keys(fields), ['Date', 'Duration', 'Attendees', 'Company', 'Type', 'Prior context']);
      assert.match(fields.Attendees, /Kevin Collins \(SRE Manager\), Sam Torres \(SRE II\)/);
      assert.equal(fields.Type, '1:1');
      assert.match(fields.Duration, /1m/);
      // The field lines are shown as fields, not again as text.
      assert.doesNotMatch(page.html, /<p>[^<]*(Attendees|Participants|ATTENDEES)/i);
    });
  }

  test('bold fields under a "## Meeting info" heading are read, on Meetings and on the meeting page alike', async () => {
    const m = data.meetings.find((x) => x.file === INFO_BOLD);
    assert.deepEqual(m.people, PEOPLE);
    assert.equal(m.type, '1:1');
    assert.ok(!data.warnings.some((w) => w.file === INFO_BOLD), JSON.stringify(data.warnings.filter((w) => w.file === INFO_BOLD)));
    const page = (await site.get(`/api/meeting?file=${encodeURIComponent(INFO_BOLD)}`)).json;
    assert.deepEqual(page.people, PEOPLE);
    assert.equal(page.type, '1:1');
    assert.match(page.html, /<dt>Attendees<\/dt><dd>Kevin Collins \(SRE Manager\), Sam Torres \(SRE II\)<\/dd>/);
    assert.match(page.html, /<dt>Type<\/dt><dd>1:1<\/dd>/);
    assert.match(page.html, /<dt>Company<\/dt><dd>Harborline Cloud<\/dd>/);
    // The lines stay under their heading.
    assert.match(page.html, /<h2>Meeting info<\/h2>\s*<p><strong>Attendees<\/strong>:/);
  });

  test('the plain form under a "## Meeting info" heading is not read', async () => {
    const m = data.meetings.find((x) => x.file === INFO_PLAIN);
    assert.equal(m.people, null);
    assert.equal(m.type, null);
    assert.ok(data.warnings.some((w) => w.file === INFO_PLAIN && w.message === 'attendees could not read'));
    assert.ok(data.warnings.some((w) => w.file === INFO_PLAIN && w.message === 'meeting type could not read'));
    const page = (await site.get(`/api/meeting?file=${encodeURIComponent(INFO_PLAIN)}`)).json;
    for (const f of ['Attendees', 'Company', 'Type']) {
      assert.match(page.html, new RegExp(`<dt>${f}</dt><dd><span class="cnr">could not read</span></dd>`), f);
    }
    assert.match(page.html, /Attendees: Kevin Collins/);
  });
});

// ---------- headings ----------

const HEADER_LINES = (day) => [`**Date:** October ${day}, 2026 | **Duration:** 1m`, `**Attendees:** ${ATTENDEES}`, '**Company:** Harborline Cloud | **Type:** 1:1'];
const HEADED = '2026-10-07_headings.md';
const HEADED_LATER = '2026-10-08_headings.md';
const NEXT_STEPS = '2026-10-09_next-steps.md';

describe('section headings', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
        put(HEADED, summary(HEADER_LINES(7), ACTIONS.replace('## Action Items', '## action items:')
          + '| A-261007-1 | Read under a heading in other capitals, with a colon | Sam Torres | Not set |  | Open |\n'));
        put(HEADED_LATER, summary(HEADER_LINES(8), '## ACTION ITEMS\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n'
          + EARLIER.replace('## Open Items from Earlier Meetings', '## open items from earlier meetings:')
          + '| A-261007-1 | Oct 7, 2026 | Read again | Sam Torres | 1 day | Done. Finished. |\n'));
        put(NEXT_STEPS, summary(HEADER_LINES(9), '## Next steps\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n'
          + '| A-261009-1 | Under "Next steps", which is not "Action Items" | Sam Torres | Not set |  | Open |\n'));
      },
    });
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  test('"Action Items" and "Open Items from Earlier Meetings" are read in any capitals and with a colon', () => {
    const item = data.tracked.find((r) => r.id === 'A-261007-1');
    assert.ok(item, 'the action item is read');
    assert.deepEqual(item.sources.map((s) => s.file), [HEADED, HEADED_LATER]);
    assert.equal(item.state, 'done');
    assert.ok(!data.warnings.some((w) => [HEADED, HEADED_LATER].includes(w.file)), JSON.stringify(data.warnings));
  });

  test('"Next steps" is still not "Action Items"', () => {
    assert.ok(!data.tracked.some((r) => r.id === 'A-261009-1'));
    assert.ok(data.warnings.some((w) => w.file === NEXT_STEPS && w.message === 'no "Action Items" section'));
  });
});

// ---------- "Status now" words ----------

const STATUS = [
  ['Open', 'open'], ['in progress', 'open'], ['ONGOING', 'open'], ['Pending', 'open'], ['Still open', 'open'],
  ['not started', 'open'], ['Blocked', 'open'], ['Partially', 'open'],
  ['Done', 'done'], ['closed', 'done'], ['Completed', 'done'], ['COMPLETE', 'done'], ['Resolved', 'done'], ['finished', 'done'],
  ['Dropped', 'dropped'], ['Cancelled', 'dropped'], ['canceled', 'dropped'], ['Abandoned', 'dropped'],
];
const STATUS_FIRST = '2026-10-10_status-first.md';
const STATUS_LATER = '2026-10-11_status-later.md';
const NOT_ACCEPTED = 'Handed over';

describe('"Status now" words', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
        const ids = [...STATUS.keys(), STATUS.length].map((i) => `A-261010-${i + 1}`);
        put(STATUS_FIRST, summary(HEADER_LINES(10), ACTIONS + ids.map((id) => `| ${id} | Item ${id} | Sam Torres | Not set |  | Open |`).join('\n') + '\n'));
        put(STATUS_LATER, summary(HEADER_LINES(11), ACTIONS + EARLIER + [
          ...STATUS.map(([word], i) => `| ${ids[i]} | Oct 10, 2026 | Item | Sam Torres | 1 day | **${word}.** More words after it. |`),
          `| ${ids[STATUS.length]} | Oct 10, 2026 | Item | Sam Torres | 1 day | ${NOT_ACCEPTED}. To Dana. |`,
        ].join('\n') + '\n'));
      },
    });
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  for (const [i, [word, state]] of STATUS.entries()) {
    test(`"${word}" reads as ${state}`, () => {
      const item = data.tracked.find((r) => r.id === `A-261010-${i + 1}`);
      assert.equal(item.state, state);
      assert.equal(item.latestStatus, `${word}. More words after it.`);
      assert.deepEqual(item.problems, []);
    });
  }

  test(`a word that is still not accepted ("${NOT_ACCEPTED}") counts as open, with a warning that lists the accepted words`, () => {
    const id = `A-261010-${STATUS.length + 1}`;
    const item = data.tracked.find((r) => r.id === id);
    assert.equal(item.state, 'open');
    const words = 'Open, In progress, Ongoing, Pending, Still open, Not started, Blocked, Partially, Done, Closed, Completed, Complete, '
      + 'Resolved, Finished, Dropped, Cancelled, Canceled or Abandoned';
    const message = `${id}: "Status now" starts with none of ${words}, so it counts as open`;
    assert.deepEqual(item.problems, [message]);
    assert.deepEqual(data.warnings.filter((w) => w.file === STATUS_LATER), [{ file: STATUS_LATER, message, kind: `…: "Status now" starts with none of ${words}, so it counts as open` }]);
  });
});

// ---------- rows from before the first saved summary, and grouped warnings ----------

// The sample's oldest summary is May 5, 2026.
const LATER = '2026-10-12_earlier-rows.md';
const LATEST = '2026-10-13_earlier-rows.md';

describe('rows that refer to meetings that are not loaded, and the grouped warnings', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite({
      prepare(root) {
        const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
        put(LATER, summary(HEADER_LINES(12), ACTIONS + EARLIER + [
          '| A-250301-2 | Mar 1, 2025 | From before the first saved summary | Sam Torres | 1 year | Open. Still going. |',
          '| A-260504-1 | May 4, 2026 | The day before the first saved summary | Sam Torres | 5 months | Open |',
          '| A-260505-77 | May 5, 2026 | The day of the first saved summary | Sam Torres | 5 months | Open |',
          '| A-260601-1 | Jun 1, 2026 | After the first saved summary | Sam Torres | 4 months | Open |',
          '| A-260602-1 | Jun 2, 2026 | Also after it | Sam Torres | 4 months | Open |',
          '| A-260603-1 | Jun 3, 2026 | And this one | Sam Torres | 4 months | Open |',
          '| A-2606-1 | Jun 2026 | An ID in the wrong form | Sam Torres | 4 months | Open |',
        ].join('\n') + '\n'));
        put(LATEST, summary(HEADER_LINES(13), ACTIONS + EARLIER + [
          '| A-250301-2 | Mar 1, 2025 | From before the first saved summary | Sam Torres | 1 year | Done. Finished at last. |',
          '| A-260604-1 | Jun 4, 2026 | After it, in another file | Sam Torres | 4 months | Open |',
        ].join('\n') + '\n'));
      },
    });
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  test('a row from before the first saved summary: no warning, one row with its latest status and the note', async () => {
    const rows = data.tracked.filter((r) => r.id === 'A-250301-2');
    assert.equal(rows.length, 1, 'one row for both mentions');
    const [row] = rows;
    assert.equal(row.kind, 'earlier item');
    assert.equal(row.beforeFirstSummary, true);
    assert.deepEqual(row.problems, []);
    assert.equal(row.firstSeen, '2025-03-01');
    assert.deepEqual(row.sources.map((s) => s.file), [LATER, LATEST]);
    assert.equal(row.latestStatus, 'Done. Finished at last.');
    assert.equal(row.state, 'done');
    assert.ok(!data.warnings.some((w) => w.message.includes('A-250301-2')), JSON.stringify(data.warnings));
    const before = data.tracked.find((r) => r.id === 'A-260504-1');
    assert.equal(before.beforeFirstSummary, true);
    assert.deepEqual(before.problems, []);

    const page = await openPage(site, '#/meetings');
    const drawn = page.rows('tracked-body').find((r) => r.includes('>A-250301-2<'));
    assert.match(drawn, /from before your first saved summary/);
    assert.match(drawn, /Done\. Finished at last\./);
    assert.equal(page.rows('tracked-body').filter((r) => /from before your first saved summary/.test(r)).length, 2);
  });

  test('it is not on the Board or Today', async () => {
    for (const p of ['/api/board', '/api/today', '/api/today?week=last']) {
      const res = await site.get(p);
      assert.equal(res.status, 200, p);
      assert.doesNotMatch(res.text, /A-250301-2|A-260504-1/, p);
    }
  });

  test('a row whose ID date is on or after the first saved summary keeps its warning', () => {
    for (const id of ['A-260505-77', 'A-260601-1', 'A-260602-1', 'A-260603-1', 'A-260604-1']) {
      const row = data.tracked.find((r) => r.id === id);
      assert.equal(row.beforeFirstSummary, undefined, id);
      assert.deepEqual(row.problems, [`ID ${id} matches no action item in an earlier meeting`], id);
      const warning = data.warnings.find((w) => w.message === row.problems[0]);
      assert.equal(warning.kind, 'ID … matches no action item in an earlier meeting');
    }
  });

  test('every warning has a kind: the message without the part that varies', () => {
    const kinds = Object.fromEntries(data.warnings.map((w) => [w.message, w.kind]));
    assert.equal(kinds['ID "A-2606-1" is not in the form A-YYMMDD-n'], 'ID "…" is not in the form A-YYMMDD-n');
  });

  test('Meetings groups the warnings by kind, most first, with their counts, each opening to its files', async () => {
    const page = await openPage(site, '#/meetings');
    const html = page.html();
    const panel = html.match(/<details class="notice notice-warn" id="meetings-warnings">([\s\S]*?)<\/details>\s*<\/li>\s*<\/ul>\s*<\/details>/);
    assert.ok(panel, 'the panel is drawn');
    // The total is every warning, as on Today.
    const n = data.warnings.length;
    assert.match(panel[1], new RegExp(`<strong>${n} things could not be read\\.</strong>`));
    const today = (await site.get('/api/today')).json;
    assert.equal(today.foot.couldNotRead, n);

    const groups = panel[1].split('<details class="warning-group">').slice(1).map((g) => ({
      count: Number(g.match(/<span class="warning-count">(\d+)<\/span>/)[1]),
      kind: g.match(/<\/span> ([^<]*)<\/summary>/)[1],
      files: [...g.matchAll(/<li><code>([^<]*)<\/code>: /g)].map((x) => x[1]),
    }));
    assert.deepEqual(groups.map((g) => g.count), [...groups.map((g) => g.count)].sort((a, b) => b - a), 'most first');
    assert.equal(groups.reduce((t, g) => t + g.count, 0), n);
    for (const g of groups) assert.equal(g.files.length, g.count, g.kind);
    const noMatch = groups.find((g) => g.kind === 'ID … matches no action item in an earlier meeting');
    assert.equal(noMatch.count, 5);
    assert.equal(groups[0], noMatch);
    assert.deepEqual(noMatch.files, [LATER, LATER, LATER, LATER, LATEST]);
  });
});
