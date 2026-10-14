// 0.3.1: a summary's dates may be written YYYY-MM-DD or day first, and an earlier item's ID gives its first-seen
// date when its "From" can't be read.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startSite } from './helpers/site.js';

const NOTES = 'meeting-notes';
const header = (title, date) => `# ${title}

**Date:** ${date} | **Duration:** 1m
**Attendees:** Kevin Collins (SRE Manager), Sam Torres (SRE II)
**Company:** Harborline Cloud | **Type:** 1:1

---

## Action Items

| ID | Action Item | Owner | Due | Due date | Status |
|---|---|---|---|---|---|
`;
const EARLIER = '\n## Open Items from Earlier Meetings\n\n| ID | From | Item | Owner | Age | Status now |\n|---|---|---|---|---|---|\n';

const FORMS = '2026-10-12_kevin-sam_1on1.md';
const BY_ID = '2026-10-13_kevin-sam_1on1.md';
const BAD_ID = '2026-10-14_kevin-sam_1on1.md';
const UNREAD = '2026-10-15_kevin-sam_1on1.md';
const HEADER_ISO = 'kevin-sam-iso.md';
const HEADER_DAY_FIRST = 'kevin-sam-day-first.md';
const HEADER_SLASHES = 'kevin-sam-slashes.md';

function writeFixtures(root) {
  const put = (file, text) => fs.writeFileSync(path.join(root, NOTES, file), text);
  // The IDs carry another date (Aug 1), so a first-seen date of Aug 13 can only have come from "From".
  put(FORMS, header('Kevin & Sam', 'October 12, 2026') + EARLIER + [
    '| A-260801-1 | 2026-08-13 | Written YYYY-MM-DD | Kevin Collins | 2 months | Open |',
    '| A-260801-2 | 13 August 2026 | Written day first | Kevin Collins | 2 months | Open |',
    '| A-260801-3 | 13 Aug | Written day first, short, no year | Kevin Collins | 2 months | Open |',
    '| A-260801-4 | Aug 13, 2026 | Written month first | Kevin Collins | 2 months | Open |',
    '|  | 13 Aug 2026 | Background, written day first | Kevin Collins | 2 months | Open |',
  ].join('\n') + '\n');
  put(BY_ID, header('Kevin & Sam', 'October 13, 2026') + EARLIER
    + '| A-260813-4 | earlier | From not readable, ID well formed | Kevin Collins | 2 months | Open |\n');
  put(BAD_ID, header('Kevin & Sam', 'October 14, 2026') + EARLIER
    + '| A-2608-4 | earlier | From not readable, ID malformed | Kevin Collins | 2 months | Open |\n');
  put(UNREAD, header('Kevin & Sam', 'October 15, 2026') + EARLIER + [
    '| A-2608-5 | 03/08/2026 | A date that reads two ways | Kevin Collins | 2 months | Open |',
    '| A-2608-6 | 2026-02-30 | A date that does not exist | Kevin Collins | 2 months | Open |',
  ].join('\n') + '\n');
  // No date in the file name: the **Date:** line is read.
  put(HEADER_ISO, header('Kevin & Sam', '2026-08-13'));
  put(HEADER_DAY_FIRST, header('Kevin & Sam', '13 August 2026, 10:00 AM'));
  put(HEADER_SLASHES, header('Kevin & Sam', '03/08/2026'));
}

describe('dates in a summary', () => {
  let site;
  let data;
  before(async () => {
    site = await startSite({ prepare: writeFixtures });
    data = (await site.get('/api/meetings')).json;
  });
  after(async () => { await site?.stop(); });

  const row = (text) => {
    const r = data.tracked.find((x) => x.text === text);
    assert.ok(r, `"${text}" is listed`);
    return r;
  };
  const firstSeenWarnings = (file) => data.warnings.filter((w) => w.file === file && /first-seen date could not read/.test(w.message));

  test('"From" written as 2026-08-13, 13 August 2026, 13 Aug and Aug 13, 2026 all give the same first-seen date', () => {
    for (const text of ['Written YYYY-MM-DD', 'Written day first', 'Written day first, short, no year', 'Written month first', 'Background, written day first']) {
      assert.equal(row(text).firstSeen, '2026-08-13', text);
    }
    assert.deepEqual(firstSeenWarnings(FORMS), []);
  });

  test('a "From" that can\'t be read takes the date of a well-formed ID, with no warning', () => {
    const r = row('From not readable, ID well formed');
    assert.equal(r.id, 'A-260813-4');
    assert.equal(r.firstSeen, '2026-08-13');
    assert.equal(r.ageDays, 63); // as of the newest meeting, Oct 15
    assert.deepEqual(firstSeenWarnings(BY_ID), []);
  });

  test('with a malformed ID it still warns, as before', () => {
    const r = row('From not readable, ID malformed');
    assert.equal(r.firstSeen, null);
    assert.equal(r.firstSeenText, 'earlier');
    assert.deepEqual(firstSeenWarnings(BAD_ID).map((w) => w.message), ['first-seen date could not read: "earlier"']);
  });

  test('03/08/2026 and 2026-02-30 are still not read', () => {
    assert.equal(row('A date that reads two ways').firstSeen, null);
    assert.equal(row('A date that does not exist').firstSeen, null);
    assert.deepEqual(firstSeenWarnings(UNREAD).map((w) => w.message).sort(),
      ['first-seen date could not read: "03/08/2026"', 'first-seen date could not read: "2026-02-30"']);
  });

  test('the **Date:** line is read the same way when the file name has no date', () => {
    const date = (file) => data.meetings.find((m) => m.file === file).date;
    assert.equal(date(HEADER_ISO), '2026-08-13');
    assert.equal(date(HEADER_DAY_FIRST), '2026-08-13');
    assert.equal(date(HEADER_SLASHES), null);
    assert.ok(data.warnings.some((w) => w.file === HEADER_SLASHES && w.message === 'date could not read'));
    for (const file of [HEADER_ISO, HEADER_DAY_FIRST]) assert.ok(!data.warnings.some((w) => w.file === file && /^date /.test(w.message)), file);
  });
});
