// Meetings page: SPEC.md "Checks" plus Decision 2's sprint-item test.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { privateNoteTexts, startSite } from './helpers/site.js';

let site;
before(async () => { site = await startSite(); });
after(async () => { await site?.stop(); });

const decode = (s) => s
  .replace(/\\"/g, '"').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// A probe that survives rendering: the note's first six words, without Markdown marks.
const probe = (text) => text.replace(/[*_`]/g, '').split(/\s+/).slice(0, 6).join(' ');

test('6 meetings are listed, newest first', async () => {
  const meetings = await site.api.meetings();
  assert.equal(meetings.length, 6);
  const dates = meetings.map((m) => m.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
  for (const m of meetings) {
    assert.ok(m.date && m.people?.length && m.type, `${m.file} shows date, people and type`);
  }
});

test('the tracked items include the alert-hygiene sprint, A-260728-1, first seen Jul 28, 2026, latest status "Done…"', async () => {
  const tracked = await site.api.tracked();
  const item = tracked.find((r) => r.id === 'A-260728-1');
  assert.ok(item, 'the sprint item is listed');
  assert.match(item.text, /^Ask Dana for a two-week alert-hygiene sprint/);
  assert.equal(item.firstSeen, '2026-07-28');
  assert.match(item.latestStatus, /^Done\. Closed today\./);
  assert.equal(item.state, 'done');
});

test('every tracked row lists the meetings it came from', async () => {
  const tracked = await site.api.tracked();
  const files = new Set((await site.api.meetings()).map((m) => m.file));
  for (const r of tracked) {
    assert.ok(r.sources.length >= 1, `${r.text.slice(0, 40)} has sources`);
    for (const s of r.sources) assert.ok(files.has(s.file), `${s.file} is a listed meeting`);
  }
});

test('no Manager-only note text is in the default page output', async () => {
  const notes = privateNoteTexts(site.root);
  assert.ok(notes.length >= 1, 'the demo data has private notes to hide');

  // Everything the Meetings page loads with the switch off: the page itself, the list, and every summary.
  const responses = [...(await site.api.pageShell()), await site.api.meetingsRaw()];
  for (const m of await site.api.meetings()) responses.push(await site.api.meetingRaw(m.file));
  const output = decode(responses.map((r) => r.text).join('\n'));

  assert.doesNotMatch(output, /manager-only note/i, 'no private-note label');
  for (const n of notes) assert.ok(!output.includes(probe(n.text)), `note from ${n.file} is hidden`);
});

test('private notes never appear in any default response on any page', async () => {
  const output = decode((await site.api.everyDefaultResponse()).map((r) => r.text).join('\n'));
  for (const n of privateNoteTexts(site.root)) assert.ok(!output.includes(probe(n.text)), `note from ${n.file} is hidden`);
});

test('"Show private notes" reveals each meeting\'s note', async () => {
  for (const n of privateNoteTexts(site.root)) {
    const res = await site.api.meetingRaw(n.file, { showPrivate: true });
    assert.equal(res.status, 200);
    assert.ok(decode(res.text).includes(probe(n.text)), `note from ${n.file} is shown when asked for`);
  }
});

test('a meeting page shows each header field', async () => {
  const [m] = await site.api.meetings();
  const page = decode((await site.api.meetingRaw(m.file)).text);
  for (const field of ['Date', 'Duration', 'Attendees', 'Company', 'Type', 'Prior context']) {
    assert.ok(page.includes(field), `shows ${field}`);
  }
});

test('demo mode: the header badge is on and ages count to the newest meeting', async () => {
  assert.equal((await site.api.config()).demo, true);
  const raw = (await site.api.meetingsRaw()).json;
  const newest = raw.meetings[0].date;
  assert.equal(raw.asOf, newest);
  const shell = (await site.api.pageShell()).map((r) => r.text).join('\n');
  assert.ok(shell.includes('Recreated demo data'));
  assert.ok(shell.includes('Local only'));
});
