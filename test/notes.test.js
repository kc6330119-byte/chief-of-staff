// Notes between meetings (step 8): a short note I write after a conversation outside a meeting, with a date, one
// person, the text, and optionally the meeting or the action item it relates to. Stored in notes/notes.json, written
// only by the app. Private by default: the text follows the "Show private notes" switch, by the same mechanism as
// Manager-only notes (?private=1), and is in no response from the core unless it is asked for.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { openPage } from './helpers/page.js';
import { LEDGER, NOTES, WRITABLE, changedFiles, snapshot, startSite } from './helpers/site.js';

// The fixture's newest meeting is Sep 22, 2026: in the sample, "today", the as-of date.
const AS_OF = '2026-09-22';
const PRIVATE = 'Sam talked about a family matter; keep it out of everything.';

const header = (title, date, attendees, type = '1:1') => `# ${title} | ${date}\n\n**Date:** ${date} | **Duration:** 1m\n**Attendees:** ${attendees}\n**Company:** Harborline Cloud | **Type:** ${type}\n\n---\n\n`;
const ACTIONS = '## Action Items\n\n| ID | Action Item | Owner | Due | Due date | Status |\n|---|---|---|---|---|---|\n';
const rows = (list) => list.map((r) => `| ${r.join(' | ')} |`).join('\n') + '\n';

const PEOPLE_FILE = `# People\n\n| Name | Role | Relationship | Also called |\n|---|---|---|---|\n${[
  '| Kevin Collins | SRE Manager | me | Kevin |',
  '| Sam Torres | SRE II | report | Sam, Sammy |',
  "| Dana Whitfield | Kevin's manager | manager | Dana |",
  '| Riley Brooks | SRE I | report | Riley |',
  '| Jordan Lee | Platform lead | peer | Jordan |',
].join('\n')}\n`;

const M_SAM = '2026-08-20_kevin-sam_1on1.md';
const M_TEAM = '2026-09-15_team-sync.md';
const M_DANA = '2026-09-22_dana-kevin_1on1.md';

function writeFixture(root) {
  const notes = path.join(root, 'meeting-notes');
  for (const f of fs.readdirSync(notes)) fs.rmSync(path.join(notes, f));
  const put = (file, text) => fs.writeFileSync(path.join(notes, file), text);
  fs.writeFileSync(path.join(root, 'people.md'), PEOPLE_FILE);
  // Sam is written by an "Also called" name on the Attendees line.
  put(M_SAM, header('Kevin & Sam: 1:1', 'August 20, 2026', 'Kevin Collins (SRE Manager), Sammy (SRE II)') + ACTIONS + rows([
    ['A-260820-1', 'Sam: send the runbook draft', 'Sam Torres', 'Friday', '2026-09-25', 'Agreed'],
    ['A-260820-2', 'Kevin: book the training', 'Kevin Collins', 'Sep 20', '2026-09-20', 'Open'],
    ['A-260820-3', 'Sam: closed since', 'Sam Torres', 'Not set', '', 'Agreed'],
    ['A-260820-4', 'Sam: a suggestion *(suggested)*', 'Sam Torres', 'Not set', '', 'Suggested'],
  ]) + `\n## Notes\n\n- **Manager-only note:** ${PRIVATE}\n`);
  put(M_TEAM, header('Team sync', 'September 15, 2026', 'Kevin Collins (SRE Manager), Riley Brooks (SRE I), Jordan Lee (Platform lead)', 'Team sync') + ACTIONS + rows([
    ['A-260915-1', 'Riley: due today', 'Riley Brooks', 'Today', '2026-09-22', 'Agreed'],
    ['A-260915-2', 'Jordan: due next week', 'Jordan Lee', 'Next Tuesday', '2026-09-29', 'Agreed'],
    ['A-260915-3', 'Kevin: send the notes to Jordan and Riley', 'Kevin Collins', 'Not set', '', 'Open'],
  ]));
  put(M_DANA, header('Dana & Kevin: 1:1 with Manager', 'September 22, 2026', "Dana Whitfield (Kevin's manager), Kevin Collins (SRE Manager)", '1:1 with manager') + ACTIONS + rows([
    ['A-260922-1', 'Dana: due Thursday', 'Dana Whitfield', 'Thursday', '2026-09-24', 'Agreed'],
  ]));
  fs.mkdirSync(path.join(root, 'actions'), { recursive: true });
  fs.writeFileSync(path.join(root, LEDGER), JSON.stringify({
    version: 1,
    items: {
      'A-260820-3': { column: 'done', closed: '2026-09-01' },
      'C-00000001': { title: 'My card: prep for Sam', meeting: M_SAM, meetingDate: '2026-08-20', created: '2026-09-01T09:00:00.000Z', due: '2026-10-01', column: 'todo' },
    },
  }, null, 2));
}

// A notes file written by hand, before the app starts.
const withNotes = (data) => (root) => {
  writeFixture(root);
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(root, NOTES), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

// Three texts, each with a word found nowhere else, so "is it anywhere it shouldn't be" is a plain search.
const TEXTS = {
  sam: 'Kumquat: Sam said the runbook slipped because of the on-call swap.\nFollow up Friday.',
  samEarlier: 'Persimmon: Sam asked about the conference budget.',
  riley: 'Quince: Riley is covering on-call next week & wants a <quiet> handover.',
};
const WORDS = ['Kumquat', 'Persimmon', 'Quince'];

const enc = encodeURIComponent;
const person = async (site, name, opts) => {
  const res = await site.api.personRaw(name, opts);
  assert.equal(res.status, 200, res.text.slice(0, 300));
  return res.json;
};
const meeting = async (site, file, opts) => {
  const res = await site.api.meetingRaw(file, opts);
  assert.equal(res.status, 200, res.text.slice(0, 300));
  return res.json;
};
const added = async (site, note, opts) => {
  const res = await site.api.addNote(note, opts);
  assert.equal(res.status, 200, res.text.slice(0, 300));
  return res.json.note;
};
const storedNote = (site, id) => site.api.notes().notes.find((n) => n.id === id);

// Every GET the site answers, with private notes not asked for: each page's read, each person's page and each meeting.
async function everyResponse(site) {
  const out = await site.api.everyDefaultResponse();
  return out.map((r) => r.text).join('\n');
}

describe('a note: what it is, and where it is stored', () => {
  let site;
  before(async () => { site = await startSite({ prepare: writeFixture }); });
  after(async () => { await site?.stop(); });

  test('opening any page writes nothing, and there is no notes file before the first note', async () => {
    const before = snapshot(site.root);
    await everyResponse(site);
    for (const name of ['Sam Torres', 'Riley Brooks']) await site.api.personRaw(name, { showPrivate: true });
    for (const m of await site.api.meetings()) await site.api.meetingRaw(m.file, { showPrivate: true });
    await site.api.peopleRaw({ showPrivate: true });
    await openPage(site, `#/people/${enc('Sam Torres')}`);
    await openPage(site, `#/meetings/${enc(M_SAM)}`);
    assert.deepEqual(changedFiles(before, snapshot(site.root)), []);
    assert.equal(site.exists(NOTES), false);
    assert.equal(site.exists('notes'), false, 'not even the folder');
  });

  test('the first note creates notes/notes.json; a note holds a date, one person, the text, a meeting and an item', async () => {
    const note = await added(site, { person: 'Sammy', text: TEXTS.sam, meeting: M_SAM, item: 'A-260820-1' });
    assert.match(note.id, /^N-[0-9a-f]{8}$/);
    const file = site.api.notes();
    assert.equal(file.version, 1);
    assert.equal(file.notes.length, 1);
    const { created, ...rest } = file.notes[0];
    // The date defaults to the as-of date; the person is stored as the Name in people.md.
    assert.deepEqual(rest, { id: note.id, date: AS_OF, person: 'Sam Torres', meeting: M_SAM, item: 'A-260820-1', text: TEXTS.sam });
    assert.match(created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Written as the app writes its other files: two-space JSON and a final newline, with no temporary file left behind.
    assert.equal(site.file(NOTES), `${JSON.stringify(file, null, 2)}\n`);
    assert.deepEqual(fs.readdirSync(path.join(site.root, 'notes')), ['notes.json']);
  });

  test('the meeting and the item are optional', async () => {
    const note = await added(site, { person: 'Riley Brooks', text: TEXTS.riley, date: '2026-09-16', meeting: '', item: null });
    assert.deepEqual({ ...storedNote(site, note.id), created: undefined },
      { id: note.id, date: '2026-09-16', person: 'Riley Brooks', meeting: null, item: null, text: TEXTS.riley, created: undefined });
  });

  test('the date can be set earlier, never later than the as-of date, and must be a real date', async () => {
    assert.equal((await added(site, { person: 'Sam Torres', text: TEXTS.samEarlier, date: '2026-08-19' })).date, '2026-08-19');
    const count = site.api.notes().notes.length;
    for (const date of ['2026-09-23', '2027-01-01']) {
      const res = await site.api.addNote({ person: 'Sam Torres', text: 'x', date });
      assert.equal(res.status, 400, date);
      assert.equal(res.json.error, `The date can’t be later than ${AS_OF}.`);
    }
    for (const date of ['2026-02-30', 'Sep 1', '2026-9-1', 7]) {
      const res = await site.api.addNote({ person: 'Sam Torres', text: 'x', date });
      assert.equal(res.status, 400, String(date));
      assert.equal(res.json.error, 'The date must be a real date written YYYY-MM-DD.');
    }
    assert.equal(site.api.notes().notes.length, count, 'nothing was added');
  });

  test('the person is one name from people.md, not "me", and is required', async () => {
    const count = site.api.notes().notes.length;
    const refused = async (person, error) => {
      const res = await site.api.addNote({ person, text: 'x' });
      assert.equal(res.status, 400, String(person));
      assert.equal(res.json.error, error);
    };
    await refused(undefined, 'Choose the person the note is about.');
    await refused('  ', 'Choose the person the note is about.');
    await refused('Morgan Diaz', '“Morgan Diaz” is not in people.md.');
    await refused('Sam Torres, Riley Brooks', '“Sam Torres, Riley Brooks” is not in people.md.');
    await refused('Kevin Collins', 'A note is about someone else, not you.');
    await refused('Kevin', 'A note is about someone else, not you.');
    assert.equal(site.api.notes().notes.length, count);
  });

  test('the meeting, if given, is a summary that person attended', async () => {
    const count = site.api.notes().notes.length;
    for (const [meeting, error] of [
      [M_DANA, `Sam Torres did not attend ${M_DANA}.`],
      [M_TEAM, `Sam Torres did not attend ${M_TEAM}.`],
      ['2026-01-01_nobody.md', 'There is no summary named “2026-01-01_nobody.md” in meeting-notes/.'],
      ['../CLAUDE.md', 'There is no summary named “../CLAUDE.md” in meeting-notes/.'],
    ]) {
      const res = await site.api.addNote({ person: 'Sam Torres', text: 'x', meeting });
      assert.equal(res.status, 400, meeting);
      assert.equal(res.json.error, error);
    }
    assert.equal(site.api.notes().notes.length, count);
  });

  test('the item, if given, is the ID of an action item in the summaries', async () => {
    const count = site.api.notes().notes.length;
    // A card of my own is not an action item; an ID in no summary is no item at all.
    for (const item of ['C-00000001', 'A-200101-1', 'nope']) {
      const res = await site.api.addNote({ person: 'Sam Torres', text: 'x', item });
      assert.equal(res.status, 400, item);
      assert.equal(res.json.error, `There is no action item ${item} in the summaries.`);
    }
    assert.equal(site.api.notes().notes.length, count);
  });

  test('the text is required and at most 2,000 characters; line breaks are kept', async () => {
    const res = await site.api.addNote({ person: 'Sam Torres', text: '   \n  ' });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'Write the note first.');
    const long = await site.api.addNote({ person: 'Sam Torres', text: 'x'.repeat(2001) });
    assert.equal(long.status, 400);
    assert.equal(long.json.error, 'The note is longer than 2000 characters.');
    // 2,000 characters as the page counts them, accented letters included.
    const full = await added(site, { person: 'Sam Torres', text: 'é'.repeat(2000) });
    assert.equal(storedNote(site, full.id).text, 'é'.repeat(2000));
    // Windows line breaks become plain ones; blank lines inside the note stay; spaces at either end go.
    const lines = await added(site, { person: 'Sam Torres', text: '  first line\r\n\r\nthird line\n  ' });
    assert.equal(storedNote(site, lines.id).text, 'first line\n\nthird line');
    for (const n of [full, lines]) assert.equal((await site.api.deleteNote(n.id)).status, 200);
  });

  test('I can edit a note: its date, person, text, meeting and item, each checked as when adding', async () => {
    const id = site.api.notes().notes.find((n) => n.text === TEXTS.riley).id;
    const res = await site.api.editNote(id, { text: `${TEXTS.riley}\nAnd the pager.`, meeting: M_TEAM, item: 'A-260915-1', date: '2026-09-17' });
    assert.equal(res.status, 200, res.text);
    const stored = storedNote(site, id);
    assert.equal(stored.text, `${TEXTS.riley}\nAnd the pager.`);
    assert.deepEqual([stored.date, stored.meeting, stored.item], ['2026-09-17', M_TEAM, 'A-260915-1']);
    assert.match(stored.updated, /^\d{4}-\d{2}-\d{2}T/);
    for (const [changes, error] of [
      [{ date: '2026-09-30' }, `The date can’t be later than ${AS_OF}.`],
      [{ date: '' }, 'The date must be a real date written YYYY-MM-DD.'],
      [{ text: '' }, 'Write the note first.'],
      [{ person: 'Kevin Collins' }, 'A note is about someone else, not you.'],
      // Sam did not attend the team sync the note names.
      [{ person: 'Sam Torres' }, `Sam Torres did not attend ${M_TEAM}.`],
      [{ item: 'C-00000001' }, 'There is no action item C-00000001 in the summaries.'],
    ]) {
      const refused = await site.api.editNote(id, changes);
      assert.equal(refused.status, 400, JSON.stringify(changes));
      assert.equal(refused.json.error, error);
    }
    assert.deepEqual(storedNote(site, id), stored, 'a refused change leaves the note as it was');
    const moved = await site.api.editNote(id, { person: 'Jordan', meeting: M_TEAM });
    assert.equal(moved.status, 200);
    assert.equal(storedNote(site, id).person, 'Jordan Lee');
    await site.api.editNote(id, { person: 'Riley Brooks' });
  });

  test('I can delete a note; an unknown note is not found', async () => {
    const extra = await added(site, { person: 'Dana', text: 'To be deleted.' });
    const res = await site.api.deleteNote(extra.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { deleted: extra.id });
    assert.equal(storedNote(site, extra.id), undefined);
    for (const r of [await site.api.deleteNote(extra.id), await site.api.editNote(extra.id, { text: 'x' })]) {
      assert.equal(r.status, 404);
      assert.equal(r.json.error, 'That note is no longer in notes/notes.json. Reload to see the current notes.');
    }
  });

  test('a meeting summary is never edited, and only the four allowed files are written', async () => {
    const summaries = fs.readdirSync(path.join(site.root, 'meeting-notes')).map((f) => site.file(`meeting-notes/${f}`));
    const before = snapshot(site.root);
    const n = await added(site, { person: 'Sam Torres', text: 'One more.', meeting: M_SAM, item: 'A-260820-2' });
    await site.api.editNote(n.id, { text: 'One more, edited.' });
    const changed = changedFiles(before, snapshot(site.root));
    assert.deepEqual(changed, [NOTES]);
    assert.ok(changed.every((f) => WRITABLE.includes(f)));
    assert.deepEqual(fs.readdirSync(path.join(site.root, 'meeting-notes')).map((f) => site.file(`meeting-notes/${f}`)), summaries);
  });
});

describe('fields the app doesn\'t know are kept', () => {
  const HAND = {
    version: 1,
    kept: 'a field the app does not know',
    notes: [
      { id: 'N-0000000a', date: '2026-09-01', person: 'Sam Torres', meeting: null, item: null, text: 'Written by hand.', mood: 'calm', created: '2026-09-01T10:00:00.000Z' },
      { id: 'N-0000000b', date: '2026-09-02', person: 'Riley Brooks', meeting: null, item: null, text: 'To delete.', created: '2026-09-02T10:00:00.000Z' },
    ],
  };
  let site;
  before(async () => { site = await startSite({ prepare: withNotes(HAND) }); });
  after(async () => { await site?.stop(); });

  test('adding, editing and deleting keep every field the app does not know, in the file and in each note', async () => {
    await added(site, { person: 'Sam Torres', text: 'New.' });
    assert.equal((await site.api.editNote('N-0000000a', { text: 'Edited.' })).status, 200);
    assert.equal((await site.api.deleteNote('N-0000000b')).status, 200);
    const file = site.api.notes();
    assert.equal(file.kept, 'a field the app does not know');
    const a = file.notes.find((n) => n.id === 'N-0000000a');
    assert.equal(a.mood, 'calm');
    assert.equal(a.text, 'Edited.');
    assert.deepEqual(file.notes.map((n) => n.id).slice(0, 1), ['N-0000000a']);
    assert.equal(file.notes.length, 2);
  });
});

describe('private by default', () => {
  let site;
  const ids = {};
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    ids.sam = (await added(site, { person: 'Sam Torres', text: TEXTS.sam, meeting: M_SAM, item: 'A-260820-1', date: '2026-09-20' })).id;
    ids.samEarlier = (await added(site, { person: 'Sam Torres', text: TEXTS.samEarlier, date: '2026-09-02' })).id;
    ids.riley = (await added(site, { person: 'Riley Brooks', text: TEXTS.riley, meeting: M_TEAM, item: 'A-260915-1', date: '2026-09-18' })).id;
  });
  after(async () => { await site?.stop(); });

  test('unless private notes are asked for, the text of a note is in no response from the core', async () => {
    const all = await everyResponse(site);
    // The writes answer without the text too, unless it is asked for.
    const writes = [
      await site.api.addNote({ person: 'Dana Whitfield', text: 'Persimmon too: Dana mentioned it.' }),
      await site.api.editNote(ids.sam, { text: TEXTS.sam }),
    ];
    assert.ok(writes.every((w) => w.status === 200));
    await site.api.deleteNote(writes[0].json.note.id);
    const today = await site.api.todayRaw();
    for (const word of WORDS) {
      assert.ok(!all.includes(word), `${word} is in a default response`);
      for (const w of writes) assert.ok(!w.text.includes(word), `${word} is in a write's answer`);
      assert.ok(!today.text.includes(word));
    }
  });

  test('without the switch a note shows its date and person, and says it is private; with it, the text', async () => {
    const off = (await person(site, 'Sam Torres')).notes.list.find((n) => n.id === ids.sam);
    assert.equal(off.textShown, false);
    assert.equal('text' in off, false);
    assert.equal(off.date, '2026-09-20');
    assert.equal(off.person, 'Sam Torres');
    const on = (await person(site, 'Sam Torres', { showPrivate: true })).notes.list.find((n) => n.id === ids.sam);
    assert.equal(on.textShown, true);
    assert.equal(on.text, TEXTS.sam);
    const inMeeting = (await meeting(site, M_TEAM, { showPrivate: true })).notes.list;
    assert.deepEqual(inMeeting.map((n) => n.text), [TEXTS.riley]);
    const write = await site.api.editNote(ids.riley, { text: TEXTS.riley }, { showPrivate: true });
    assert.equal(write.json.note.text, TEXTS.riley);
  });

  test('a note can still be added with the switch off', async () => {
    const res = await site.api.addNote({ person: 'Jordan Lee', text: 'Added with the switch off.' });
    assert.equal(res.status, 200);
    assert.equal(res.json.note.textShown, false);
    assert.equal(storedNote(site, res.json.note.id).text, 'Added with the switch off.');
    await site.api.deleteNote(res.json.note.id);
  });

  test('the switch on a person\'s page and a meeting\'s page shows and hides the text, and the page says "private note"', async () => {
    const page = await openPage(site, `#/people/${enc('Sam Torres')}`);
    const section = () => sectionHtml(page, 'group-notes');
    assert.match(section(), /private note/);
    for (const word of WORDS) assert.ok(!page.html().includes(word), word);
    await page.choose('private-switch', true);
    assert.match(section(), /Kumquat: Sam said the runbook slipped because of the on-call swap\.\nFollow up Friday\./);
    assert.match(section(), /Persimmon/);
    await page.choose('private-switch', false);
    for (const word of WORDS) assert.ok(!section().includes(word), word);

    const m = await openPage(site, `#/meetings/${enc(M_TEAM)}`);
    assert.match(sectionHtml(m, 'group-since'), /private note/);
    assert.ok(!m.html().includes('Quince'));
    await m.choose('private-switch', true);
    assert.match(sectionHtml(m, 'group-since'), /Quince: Riley is covering on-call next week &amp; wants a &lt;quiet&gt; handover\./);
    await m.choose('private-switch', false);
    assert.ok(!sectionHtml(m, 'group-since').includes('Quince'));
  });

  test('note text never appears in a chip, an alert, a Today row or a count', async () => {
    const today = await openPage(site, '#/today');
    const board = await openPage(site, '#/board');
    const people = await openPage(site, '#/people');
    for (const page of [today, board, people]) for (const word of WORDS) assert.ok(!page.html().includes(word), word);
  });
});

describe('where it shows: a person\'s page', () => {
  let site;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    await added(site, { person: 'Sam Torres', text: TEXTS.samEarlier, date: '2026-08-19' });
    await added(site, { person: 'Sam Torres', text: TEXTS.sam, meeting: M_SAM, item: 'A-260820-1', date: '2026-09-20' });
    await added(site, { person: 'Sam Torres', text: 'Middle.', date: '2026-09-02', item: 'A-260820-2' });
    await added(site, { person: 'Riley Brooks', text: TEXTS.riley, date: '2026-09-18' });
  });
  after(async () => { await site?.stop(); });

  test('"Notes between meetings": that person\'s notes, newest first, each with its date, meeting and item', async () => {
    const sam = await person(site, 'Sam Torres', { showPrivate: true });
    assert.deepEqual(sam.notes.list.map((n) => n.date), ['2026-09-20', '2026-09-02', '2026-08-19']);
    const first = sam.notes.list[0];
    assert.deepEqual(first.meeting, { file: M_SAM, found: true, date: '2026-08-20', title: 'Kevin & Sam: 1:1 | August 20, 2026' });
    assert.deepEqual(first.item, { id: 'A-260820-1', found: true, title: 'Sam: send the runbook draft', meeting: M_SAM });
    assert.equal(sam.notes.list[2].meeting, null);
    assert.deepEqual((await person(site, 'Riley')).notes.list.map((n) => n.date), ['2026-09-18']);
  });

  test('the box: the as-of date, the meetings they attended, and their open items or mine from their meetings', async () => {
    const sam = await person(site, 'Sam Torres');
    assert.equal(sam.notes.canAdd, true);
    assert.equal(sam.notes.cantAdd, null);
    assert.equal(sam.notes.asOf, AS_OF);
    assert.deepEqual(sam.notes.meetings.map((m) => m.file), [M_SAM]);
    // Theirs: A-260820-1 (A-260820-3 is closed, A-260820-4 a suggestion not accepted). Mine from a meeting they attended:
    // A-260820-2 (my card from that meeting is not an action item).
    assert.deepEqual(sam.notes.items.map((i) => [i.id, i.title]), [['A-260820-1', 'Sam: send the runbook draft'], ['A-260820-2', 'Kevin: book the training']]);
    const riley = await person(site, 'Riley Brooks');
    assert.deepEqual(riley.notes.meetings.map((m) => m.file), [M_TEAM]);
    assert.deepEqual(riley.notes.items.map((i) => i.id), ['A-260915-1', 'A-260915-3']);
  });

  test('the page draws the section between "You owe them" and "Meetings", with the box', async () => {
    const page = await openPage(site, `#/people/${enc('Sam Torres')}`);
    const html = page.el('person-body').innerHTML;
    const order = ['>You owe them<', '>Notes between meetings<', '>Meetings<'].map((h) => html.indexOf(h));
    assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    const section = sectionHtml(page, 'group-notes');
    assert.equal(noteRowIds(section).length, 3);
    assert.match(section, /Sep 20/);
    assert.match(section, new RegExp(`href="#/meetings/${enc(M_SAM)}"`));
    assert.match(section, /A-260820-1/);
    assert.match(section, /<input[^>]*type="date"[^>]*id="note-date"[^>]*value="2026-09-22"[^>]*max="2026-09-22"|<input[^>]*type="date"[^>]*id="note-date"[^>]*max="2026-09-22"[^>]*value="2026-09-22"/);
    assert.deepEqual(page.options('note-meeting'), ['', M_SAM]);
    assert.deepEqual(page.options('note-item'), ['', 'A-260820-1', 'A-260820-2']);
    assert.match(section, /<textarea[^>]*id="note-text"[^>]*maxlength="2000"/);
    assert.match(section, /data-act="note-add"[^>]*>Add note</);
    // With the switch off, a note can't be edited or deleted: its text isn't shown.
    assert.doesNotMatch(section, /data-act="note-edit"|data-act="note-delete"/);
  });

  test('"Add note" saves the note, the row shows it as a private note, and one line says so', async () => {
    const page = await openPage(site, `#/people/${enc('Riley Brooks')}`);
    page.el('note-date').value = '2026-09-21';
    page.el('note-meeting').value = M_TEAM;
    page.el('note-item').value = 'A-260915-3';
    page.el('note-text').value = 'Riley wants the notes by Friday.\nSent a reminder.';
    await clickNote(page, 'person', 'note-add');
    const stored = site.api.notes().notes.find((n) => n.text.startsWith('Riley wants'));
    assert.deepEqual([stored.date, stored.person, stored.meeting, stored.item, stored.text],
      ['2026-09-21', 'Riley Brooks', M_TEAM, 'A-260915-3', 'Riley wants the notes by Friday.\nSent a reminder.']);
    assert.equal(page.el('person-status').textContent, 'Note added.');
    assert.equal(noteRowIds(sectionHtml(page, 'group-notes'))[0], stored.id);
    assert.doesNotMatch(page.html(), /Riley wants the notes/);
    assert.equal(page.el('note-text').value, '', 'the box is empty again');
  });

  test('a refused note keeps what was typed and shows why', async () => {
    const page = await openPage(site, `#/people/${enc('Riley Brooks')}`);
    const count = site.api.notes().notes.length;
    page.el('note-date').value = '2026-09-30';
    page.el('note-text').value = 'Too late.';
    await clickNote(page, 'person', 'note-add');
    assert.equal(site.api.notes().notes.length, count);
    assert.match(sectionHtml(page, 'group-notes'), /role="alert"[^>]*>The date can’t be later than 2026-09-22\.</);
    assert.equal(page.el('note-text').value, 'Too late.');
  });

  test('with the switch on, a note can be edited and deleted in place', async () => {
    const page = await openPage(site, `#/people/${enc('Sam Torres')}`);
    await page.choose('private-switch', true);
    const id = site.api.notes().notes.find((n) => n.text === 'Middle.').id;
    await clickNote(page, 'person', 'note-edit', id);
    assert.equal(page.el('note-edit-text').value, 'Middle.');
    page.el('note-edit-text').value = 'Middle, edited.';
    await clickNote(page, 'person', 'note-save', id);
    assert.equal(storedNote(site, id).text, 'Middle, edited.');
    assert.equal(page.el('person-status').textContent, 'Note saved.');
    assert.match(sectionHtml(page, 'group-notes'), /Middle, edited\./);
    await clickNote(page, 'person', 'note-delete', id);
    assert.ok(storedNote(site, id), 'Delete asks first');
    assert.match(sectionHtml(page, 'group-notes'), /data-act="note-delete-confirm"/);
    await clickNote(page, 'person', 'note-delete-confirm', id);
    assert.equal(storedNote(site, id), undefined);
    assert.equal(page.el('person-status').textContent, 'Note deleted.');
    await page.choose('private-switch', false);
  });
});

describe('where it shows: a meeting\'s page', () => {
  let site;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    await added(site, { person: 'Riley Brooks', text: TEXTS.riley, meeting: M_TEAM, date: '2026-09-18' });
    await added(site, { person: 'Jordan Lee', text: 'Jordan: the platform freeze.', meeting: M_TEAM, date: '2026-09-19' });
    await added(site, { person: 'Riley Brooks', text: 'Not about the meeting.', date: '2026-09-20' });
  });
  after(async () => { await site?.stop(); });

  test('"Since this meeting": the notes that name this meeting, newest first', async () => {
    const team = await meeting(site, M_TEAM);
    assert.deepEqual(team.notes.list.map((n) => [n.date, n.person]), [['2026-09-19', 'Jordan Lee'], ['2026-09-18', 'Riley Brooks']]);
    assert.deepEqual((await meeting(site, M_SAM)).notes.list, []);
  });

  test('the box has the meeting filled in, and the person when exactly one attendee is not me', async () => {
    const sam = await meeting(site, M_SAM);
    assert.equal(sam.notes.canAdd, true);
    assert.equal(sam.notes.meeting, M_SAM);
    // Written "Sammy" on the Attendees line: the Name from people.md.
    assert.deepEqual(sam.notes.people.map((p) => p.name), ['Sam Torres']);
    assert.equal(sam.notes.person, 'Sam Torres');
    assert.deepEqual(sam.notes.people[0].items.map((i) => i.id), ['A-260820-1', 'A-260820-2']);
    const team = await meeting(site, M_TEAM);
    assert.deepEqual(team.notes.people.map((p) => p.name), ['Riley Brooks', 'Jordan Lee']);
    assert.equal(team.notes.person, null);
  });

  test('the page draws the section after the summary, and "Add note" saves a note naming the meeting', async () => {
    const page = await openPage(site, `#/meetings/${enc(M_SAM)}`);
    const html = page.html();
    assert.ok(html.indexOf('class="prose"') < html.indexOf('id="group-since"'));
    assert.match(sectionHtml(page, 'group-since'), />Since this meeting</);
    assert.deepEqual(page.options('note-person'), ['Sam Torres']);
    assert.deepEqual(page.options('note-item'), ['', 'A-260820-1', 'A-260820-2']);
    page.el('note-text').value = 'Sam followed up in the hallway.';
    await clickNote(page, 'meeting', 'note-add');
    const stored = site.api.notes().notes.find((n) => n.text === 'Sam followed up in the hallway.');
    assert.deepEqual([stored.person, stored.meeting, stored.date], ['Sam Torres', M_SAM, AS_OF]);
    assert.equal(noteRowIds(sectionHtml(page, 'group-since')).length, 1);
    assert.equal(page.el('since-status').textContent, 'Note added.');
  });

  test('with more than one other attendee, the person is chosen first', async () => {
    const page = await openPage(site, `#/meetings/${enc(M_TEAM)}`);
    assert.deepEqual(page.options('note-person'), ['', 'Riley Brooks', 'Jordan Lee']);
    assert.equal(noteRowIds(sectionHtml(page, 'group-since')).length, 2);
  });
});

describe('where it shows: markers and counts', () => {
  let site;
  before(async () => {
    site = await startSite({ prepare: writeFixture });
    await added(site, { person: 'Sam Torres', text: TEXTS.sam, item: 'A-260820-1', date: '2026-09-20' });
    await added(site, { person: 'Sam Torres', text: TEXTS.samEarlier, item: 'A-260820-1', date: '2026-09-02' });
    // Dated before the last meeting with Sam (Aug 20): not counted as since it.
    await added(site, { person: 'Sam Torres', text: 'Before.', date: '2026-08-19' });
    // On the day of the last meeting with Riley: not after it.
    await added(site, { person: 'Riley Brooks', text: 'Same day.', date: '2026-09-15' });
  });
  after(async () => { await site?.stop(); });

  test('a Board card and a Today row whose item has notes carry the count and the person, and no text', async () => {
    const card = await site.api.card('A-260820-1');
    assert.deepEqual(card.notes, { count: 2, person: 'Sam Torres', personKnown: true });
    for (const id of ['A-260820-2', 'A-260915-1', 'C-00000001']) assert.equal((await site.api.card(id)).notes, null, id);
    const today = await site.api.today();
    const row = today.groups.flatMap((g) => g.items).find((i) => i.id === 'A-260820-1');
    assert.deepEqual(row.notes, { count: 2, person: 'Sam Torres', personKnown: true });
  });

  test('the marker "2 notes" links to the person\'s page, on the Board and on Today', async () => {
    const board = await openPage(site, '#/board');
    const marker = `<a class="note-marker" href="#/people/${enc('Sam Torres')}">2 notes</a>`;
    assert.ok(board.cardHtml('A-260820-1').includes(marker), board.cardHtml('A-260820-1'));
    assert.doesNotMatch(board.cardHtml('A-260820-2'), /note-marker/);
    const today = await openPage(site, '#/today');
    const row = today.el('today-body').innerHTML.split(/<li class="today-row/).find((r) => r.includes('data-id="A-260820-1"'));
    assert.ok(row.includes(marker), row);
  });

  test('"1 note" for one', async () => {
    const n = await added(site, { person: 'Riley Brooks', text: 'About the item.', item: 'A-260915-1', date: '2026-09-21' });
    const board = await openPage(site, '#/board');
    assert.match(board.cardHtml('A-260915-1'), new RegExp(`<a class="note-marker" href="#/people/${enc('Riley Brooks')}">1 note</a>`));
    await site.api.deleteNote(n.id);
  });

  test('the People list and Today\'s People rows: how many notes since the last meeting', async () => {
    const people = await site.api.people();
    const row = (name) => people.groups.flatMap((g) => g.people).find((p) => p.name === name);
    assert.equal(row('Sam Torres').notesSince, 2);
    assert.equal(row('Riley Brooks').notesSince, 0);
    assert.equal(row('Dana Whitfield').notesSince, 0);
    const today = await site.api.today();
    assert.deepEqual(today.people.reports.map((p) => [p.name, p.notesSince]), [['Sam Torres', 2], ['Riley Brooks', 0]]);

    const page = await openPage(site, '#/people');
    const samRow = page.el('people-body').innerHTML.split('<li class="today-person').find((r) => r.includes('>Sam Torres<'));
    assert.match(samRow, /2 notes since the last meeting/);
    const rileyRow = page.el('people-body').innerHTML.split('<li class="today-person').find((r) => r.includes('>Riley Brooks<'));
    assert.doesNotMatch(rileyRow, /notes? since/);
    const todayPage = await openPage(site, '#/today');
    assert.match(todayPage.el('today-body').innerHTML.split('id="group-people"')[1], /2 notes since the last meeting/);
  });

  test('"1 note since the last meeting" for one', async () => {
    const n = await added(site, { person: 'Riley Brooks', text: 'After.', date: '2026-09-16' });
    const page = await openPage(site, '#/people');
    assert.match(page.el('people-body').innerHTML, /1 note since the last meeting/);
    await site.api.deleteNote(n.id);
  });
});

describe('when something is missing: no people.md', () => {
  let site;
  before(async () => { site = await startSite({ prepare: (root) => { writeFixture(root); fs.rmSync(path.join(root, 'people.md')); } }); });
  after(async () => { await site?.stop(); });

  test('notes can\'t be added, and the box on a meeting\'s page says why', async () => {
    const res = await site.api.addNote({ person: 'Sam Torres', text: 'x', meeting: M_SAM });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, 'There is no people.md in this workspace, so notes can’t be added.');
    assert.equal(site.exists(NOTES), false);
    const m = await meeting(site, M_SAM);
    assert.equal(m.notes.canAdd, false);
    assert.equal(m.notes.cantAdd, 'There is no people.md in this workspace, so notes can’t be added.');
    const page = await openPage(site, `#/meetings/${enc(M_SAM)}`);
    const section = sectionHtml(page, 'group-since');
    assert.match(section, /There is no <code>people\.md<\/code> in this workspace, so notes can’t be added\./);
    assert.doesNotMatch(section, /data-act="note-add"/);
  });
});

describe('when something is missing: a person, a meeting or an item that is gone', () => {
  const HAND = {
    version: 1,
    notes: [
      { id: 'N-0000000c', date: '2026-09-10', person: 'Morgan Diaz', meeting: null, item: null, text: 'Kumquat: Morgan left the team.', created: '2026-09-10T10:00:00.000Z' },
      { id: 'N-0000000d', date: '2026-09-11', person: 'Sam Torres', meeting: '2026-07-01_kevin-sam_1on1.md', item: 'A-260701-1', text: 'About a meeting that is gone.', created: '2026-09-11T10:00:00.000Z' },
    ],
  };
  let site;
  before(async () => { site = await startSite({ prepare: withNotes(HAND) }); });
  after(async () => { await site?.stop(); });

  test('a note whose person is not in people.md is kept and listed on the People page', async () => {
    const view = await site.api.people();
    assert.deepEqual(view.notesNotInPeople.map((n) => [n.id, n.person, n.personKnown, n.textShown]), [['N-0000000c', 'Morgan Diaz', false, false]]);
    assert.equal(view.notesNotInPeople[0].text, undefined);
    assert.equal((await site.api.people({ showPrivate: true })).notesNotInPeople[0].text, 'Kumquat: Morgan left the team.');
    const page = await openPage(site, '#/people');
    const section = sectionHtml(page, 'people-notes-not-in');
    assert.match(section, />Notes for names not in people\.md</);
    assert.match(section, /Morgan Diaz/);
    assert.match(section, /private note/);
    assert.doesNotMatch(section, /Kumquat/);
    await page.choose('private-switch', true);
    assert.match(sectionHtml(page, 'people-notes-not-in'), /Kumquat: Morgan left the team\./);
    // The note itself can still be edited: its person isn't changed, so it isn't checked again.
    assert.equal((await site.api.editNote('N-0000000c', { text: 'Morgan left the team.' })).status, 200);
  });

  test('a note whose meeting or item no longer exists is kept and shown without that link', async () => {
    const sam = await person(site, 'Sam Torres');
    const note = sam.notes.list.find((n) => n.id === 'N-0000000d');
    assert.deepEqual(note.meeting, { file: '2026-07-01_kevin-sam_1on1.md', found: false, date: null, title: null });
    assert.deepEqual(note.item, { id: 'A-260701-1', found: false, title: null, meeting: null });
    const page = await openPage(site, `#/people/${enc('Sam Torres')}`);
    const row = sectionHtml(page, 'group-notes');
    assert.doesNotMatch(row, /href="#\/meetings\/2026-07-01/);
    // An edit that leaves them as they were is not refused for them.
    assert.equal((await site.api.editNote('N-0000000d', { text: 'Still about it.', meeting: '2026-07-01_kevin-sam_1on1.md', item: 'A-260701-1' })).status, 200);
  });

  test('none of them is ever removed by the app', async () => {
    await added(site, { person: 'Sam Torres', text: 'Another.' });
    await everyResponse(site);
    const ids = site.api.notes().notes.map((n) => n.id);
    assert.ok(ids.includes('N-0000000c') && ids.includes('N-0000000d'), ids.join());
  });
});

describe('an unreadable notes file is never overwritten', () => {
  for (const [what, text] of [
    ['not JSON', '{"version": 1, "notes": [ {"id": "N-1"'],
    ['notes that are not a list', JSON.stringify({ version: 1, notes: { a: 1 } })],
    ['a note with no person', JSON.stringify({ version: 1, notes: [{ id: 'N-00000001', date: '2026-09-01', text: 'x' }] })],
    ['a note with a date that does not exist', JSON.stringify({ version: 1, notes: [{ id: 'N-00000001', date: '2026-02-30', person: 'Sam Torres', text: 'x' }] })],
    ['a version this app does not know', JSON.stringify({ version: 2, notes: [] })],
  ]) {
    describe(what, () => {
      let site;
      before(async () => { site = await startSite({ prepare: withNotes(text) }); });
      after(async () => { await site?.stop(); });

      test('the pages say so and refuse changes; every other page still opens; the file is unchanged', async () => {
        const sam = await person(site, 'Sam Torres');
        assert.match(sam.notes.error, /^notes\/notes\.json could not read: .+\. Nothing will be saved until it is fixed\.$/);
        assert.equal(sam.notes.canAdd, false);
        assert.deepEqual(sam.notes.list, []);
        assert.match((await meeting(site, M_SAM)).notes.error, /notes\/notes\.json could not read/);
        assert.match((await site.api.people()).notesError, /notes\/notes\.json could not read/);
        for (const res of [await site.api.addNote({ person: 'Sam Torres', text: 'x' }), await site.api.editNote('N-00000001', { text: 'y' }), await site.api.deleteNote('N-00000001')]) {
          assert.equal(res.status, 409, res.text);
          assert.match(res.json.error, /notes\/notes\.json could not read/);
        }
        for (const res of await site.api.everyDefaultResponse()) assert.equal(res.status, 200, res.text.slice(0, 200));
        assert.equal(site.file(NOTES), text);
        const page = await openPage(site, `#/people/${enc('Sam Torres')}`);
        assert.match(sectionHtml(page, 'group-notes'), /notes\/notes\.json could not read/);
        assert.doesNotMatch(sectionHtml(page, 'group-notes'), /data-act="note-add"/);
        assert.doesNotMatch(page.html(), /Something went wrong/);
      });
    });
  }
});

describe('the sample', () => {
  const SAMPLE = path.join(import.meta.dirname, '..', 'sample-workspace');
  const COACH = [
    '## Notes between meetings',
    '- notes/notes.json holds short notes Kevin wrote between meetings. The app writes',
    '  it. You only read it.',
    '- Before you write a summary, read the notes dated after the last meeting with the',
    '  same person.',
    '- A note is Kevin\'s own account. Never present it as something said in the meeting,',
    '  and never put it in Action Items.',
    '- A work fact from a note (an item is done, a date has moved) may go in that item\'s',
    '  row under Open Items from Earlier Meetings as "Kevin noted on <date>: ...". The',
    '  Status word still comes from what was said in the meeting.',
    '- Anything else from a note goes only in the Manager-only note, with the note\'s',
    '  date. The app keeps that part hidden unless Kevin asks to see it.',
  ].join('\n');

  test('ships with no notes file', () => {
    assert.equal(fs.existsSync(path.join(SAMPLE, NOTES)), false);
    assert.equal(fs.existsSync(path.join(SAMPLE, 'notes')), false);
  });

  test('its CLAUDE.md lists notes/notes.json among the folders and the Sources, and tells the coach how to use the notes, in these words', () => {
    const claude = fs.readFileSync(path.join(SAMPLE, 'CLAUDE.md'), 'utf8');
    const folders = claude.split('## Folder\n')[1].split('\n## ')[0];
    assert.match(folders, /^- `notes\/notes\.json`: /m);
    assert.ok(claude.includes(`\n${COACH}\n`), 'the section, word for word');
    assert.equal(claude.split('\n## ').filter((s) => s.startsWith('Notes between meetings')).length, 1, 'the section once');
    assert.match(claude, /^Sources: .*, notes\/notes\.json$/m);
  });

  test('the Agents page reads the coach as before: the same rules, nothing it could not read', async () => {
    const site = await startSite();
    try {
      const coach = (await site.api.agents()).cards.find((c) => c.role === 'coach');
      assert.equal(coach.rulesHtml.length, 8);
      assert.deepEqual((await site.api.agents()).warnings, []);
    } finally {
      await site.stop();
    }
  });
});

// ---------- the page in the stand-in document ----------
function sectionHtml(page, id) {
  return page.html().split(/<section\b/).find((s) => s.includes(`id="${id}"`)) || '';
}
function noteRowIds(html) {
  return [...html.matchAll(/<li class="note-row[^"]*" data-id="([^"]+)"/g)].map((m) => m[1]);
}
// Where each page draws its notes: the element its clicks are wired to, and the section inside it.
const WHERE = { person: ['person-body', 'group-notes'], meeting: ['meeting-since', 'group-since'], people: ['people-body', 'people-notes-not-in'] };
// Clicks a button marked data-act="<act>" in a page's notes section, on the note with this ID when one is given.
async function clickNote(page, where, act, id) {
  const [container, section] = WHERE[where];
  const html = sectionHtml(page, section);
  const scope = id ? html.split(/<li class="note-row/).find((r) => r.includes(`data-id="${id}"`)) : html;
  if (!scope) throw new Error(`note ${id} is not drawn`);
  if (!new RegExp(`data-act="${act}"`).test(scope)) throw new Error(`no ${act} button${id ? ` on ${id}` : ''}`);
  const row = id ? { dataset: { id } } : null;
  const button = { dataset: { act }, disabled: false, closest: (sel) => (sel.startsWith('button') ? button : sel === '.note-row' ? row : null) };
  await page.el(container).fire('click', { target: button });
}
